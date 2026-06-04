/**
 * On-chain Character → UI Character shape mapper.
 *
 * Phase 2 minimum: fetches the Character object via sdk read, maps the
 * subset of fields the UI actually needs to render `/dossier?id=X`,
 * falls back to sensible defaults for the rest.
 *
 * Survival / gallery / derived state stays placeholder for now; those
 * are populated by runner (Phase 4) writing to off-chain stores.
 */

import type { BlobRef, Character, CharacterRole } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { lazySettle } from '@endless-story/economy';
import { resolveNetwork } from './network.js';
import { getMemoryCount } from './memory-counter.js';

const SUI_ID_RE = /^0x[0-9a-fA-F]{64}$/;

export function isSuiObjectId(id: string): boolean {
    return SUI_ID_RE.test(id);
}

/**
 * Map a decoded chain Character struct into the UI Character interface.
 * Shared by single fetch + list fetch — keep them visually identical so
 * the dossier grid and detail page get the same shape.
 *
 * `ownerOverride` lets the list-by-owner path stamp the wallet without
 * paying for a per-character getObject({ showOwner }) round-trip.
 */
/**
 * Move `Option<ID>` arrives as one of:
 *   - null                          (None — RPC json view)
 *   - string                        (Some — RPC raw json sometimes flattens)
 *   - { Some: string }              (Some — older codegen)
 *   - { vec: [string] | [] }        (BCS option canonical encoding via bcs.option)
 * Normalise to string | null.
 */
function unwrapOption(raw: unknown): string | null {
    if (raw == null) return null;
    if (typeof raw === 'string') return raw;
    if (typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    // { Some: 'value' } form
    if ('Some' in obj && typeof obj.Some === 'string') return obj.Some;
    // BCS canonical: { vec: ['value'] } for Some, { vec: [] } for None
    if ('vec' in obj && Array.isArray(obj.vec)) {
        return typeof obj.vec[0] === 'string' ? obj.vec[0] : null;
    }
    return null;
}

function mapChainCharacter(id: string, json: ChainCharacter, ownerOverride?: string, narrativeDay = 1, memoryCount?: number): Character {
    const profile = json.profile;
    const physical = profile?.physical_facts;
    const attrs = json.attributes ?? [];
    const attrMap: Record<string, number> = {};
    for (const a of attrs) {
        if (typeof a?.key === 'string' && typeof a?.value !== 'undefined') {
            attrMap[a.key] = Number(a.value);
        }
    }

    const roleStr = roleFromTags(json.tags ?? []) ?? '看客';

    const birthMsRaw = json.birth_ms ?? json.birthMs ?? 0;
    const birthMs = typeof birthMsRaw === 'string' ? Number(birthMsRaw) : Number(birthMsRaw);
    const createdAt = birthMs > 0 ? new Date(birthMs).toISOString() : new Date().toISOString();

    const mediaAssets = mapMediaAssets(json.media_assets ?? [], createdAt);
    const coverAsset = mediaAssets.find((m) => m.imageUrl === json.image_url);
    const firstAsset = mediaAssets[0];

    return {
        id,
        nftOwner: ownerOverride ?? '',
        sagaId: unwrapOption(json.state?.saga_id),
        currentSceneId: unwrapOption(json.state?.current_scene_id),
        name: profile?.name ?? '無名',
        description: profile?.description ?? '',
        // Chain stores public identity as tags (e.g. `role:小生`). The
        // facade may still enrich from voucher hints for older untagged mints.
        role: roleStr as CharacterRole,
        gender: mapGender(physical?.gender ?? ''),
        age: Number(physical?.age_years ?? 0),
        physicalFacts: [physical?.species, physical?.body].filter(Boolean).join(' / ') || '—',
        publicTags: mapTags(json.tags ?? []),
        attributes: {
            constitution: attrMap.constitution ?? 50,
            disposition: attrMap.disposition ?? 50,
            acuity: attrMap.acuity ?? 50,
            appearance: attrMap.appearance ?? 50,
        },
        gallery: {
            anchor: {
                walrusBlobId: coverAsset?.walrusBlobId ?? firstAsset?.walrusBlobId ?? '',
                imageUrl: json.image_url ?? '',
                kind: 'anchor',
                mediaIndex: coverAsset?.mediaIndex,
                label: '封面',
                createdAt,
            },
            variants: mediaAssets,
            costume: mediaAssets.find((m) => m.kind === 'costume'),
            makeup: mediaAssets.find((m) => m.kind === 'makeup'),
            eventMoments: mediaAssets.filter((m) => m.kind === 'event_moment'),
        },
        survival: computeSurvival(json, attrMap, roleStr, narrativeDay, memoryCount),
        subscriberCount: json.subscriber_count != null ? Number(json.subscriber_count) : 0,
        createdAt,
    };
}

/**
 * Fetch one Character by object id. Returns null if id format is wrong,
 * chain unreachable, or decode fails. Caller falls back to mock.
 */
export async function fetchOnChainCharacter(id: string): Promise<Character | null> {
    if (!isSuiObjectId(id)) return null;
    const client = makeSuiClient({ network: resolveNetwork() });
    let res;
    try {
        res = await read.character.getCharacter(client, id);
    } catch {
        return null;
    }
    const json = res.json as unknown as ChainCharacter | undefined;
    if (!json) return null;
    // Resolve current owner via OwnerCap dynamic lookup. Chain
    // `Character` is a shared object (no owner field) — the actual
    // owner is whoever holds the matching OwnerCap. We trace it via
    // `CharacterMinted.owner_cap_id` + `sui_getObject({showOwner})`
    // so transferred caps surface the new owner. Best-effort: if any
    // step fails, fall back to empty string and the UI will degrade
    // to non-owner state.
    const owner = await resolveCurrentOwner(id);
    const narrativeDay = await fetchNarrativeDay(client);
    const memoryCount = await getMemoryCount(id);
    return mapChainCharacter(id, json, owner ?? undefined, narrativeDay, memoryCount ?? undefined);
}

/**
 * Trace a Character → its OwnerCap → current cap holder (= current
 * owner address). Returns null on miss (chain unreachable, no mint
 * event, cap burnt, etc).
 *
 * Why two hops: CharacterMinted gives the owner_cap_id, then we
 * getObject the cap with `showOwner` so we get the CURRENT holder,
 * not the mint-time one. Robust against cap transfers.
 */
async function resolveCurrentOwner(characterId: string): Promise<string | null> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return null;
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        // Newest-first event scan. There's exactly one CharacterMinted
        // per char, so we can short-circuit on first match.
        const summaries = await read.character.listMintedCharacterSummaries(client, pkg, {});
        const match = summaries.find((s) => s.characterId === characterId);
        if (!match || !match.ownerCapId) return null;
        // Pull current OwnerCap holder via showOwner.
        const capObj = await client.getObject({
            id: match.ownerCapId,
            options: { showOwner: true },
        });
        const ownerField = capObj.data?.owner;
        if (ownerField && typeof ownerField === 'object' && 'AddressOwner' in ownerField) {
            return (ownerField as { AddressOwner: string }).AddressOwner;
        }
        // Fall back to mint-time owner from event (still useful if
        // the cap is shared/immutable, which it shouldn't be).
        return match.owner || null;
    } catch (err) {
        console.warn('[character-read] resolveCurrentOwner failed:', err);
        return null;
    }
}

/**
 * Fetch every Character owned by `wallet` — uses SDK
 * `listCharactersForOwner` (paginated OwnerCap lookup + multi-get).
 * Empty array if not deployed or wallet has none.
 */
export async function fetchOnChainCharactersByOwner(wallet: string): Promise<Character[]> {
    if (!isSuiObjectId(wallet)) return [];
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const client = makeSuiClient({ network: resolveNetwork() });
    let result;
    try {
        result = await read.character.listCharactersForOwner(client, wallet, pkg);
    } catch (err) {
        console.warn('[character-read] listCharactersForOwner failed:', err);
        return [];
    }
    const narrativeDay = await fetchNarrativeDay(client);
    const out: Character[] = [];
    for (const c of result.characters) {
        const json = (c as { json?: unknown }).json as ChainCharacter | undefined;
        const charId = (c as { objectId?: string }).objectId;
        if (!json || !charId) continue;
        out.push(mapChainCharacter(charId, json, wallet, narrativeDay));
    }
    return out;
}

/**
 * Fetch all Characters ever minted from the deployed package — uses SDK's
 * CharacterMinted event log + multi-get. `opts.sagaId`:
 *   - undefined → everyone (saga + wild)
 *   - string    → only this saga
 *   - null      → only "wild" (saga_id == None on chain)
 *
 * Empty array if not deployed. Burned/transferred-out characters get
 * silently dropped (multi-get returns errors → skipped here).
 */
export async function fetchOnChainCharacters(opts: { sagaId?: string | null } = {}): Promise<Character[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const client = makeSuiClient({ network: resolveNetwork() });
    let result;
    try {
        result = await read.character.listMintedCharacters(client, pkg, { sagaId: opts.sagaId });
    } catch (err) {
        console.warn('[character-read] listMintedCharacters failed:', err);
        return [];
    }
    const narrativeDay = await fetchNarrativeDay(client);
    const out: Character[] = [];
    // summaries and characters are 1:1 by index; summaries carry the
    // `owner` we can stamp without an extra getObject roundtrip.
    result.characters.forEach((c, i) => {
        const json = (c as { json?: unknown }).json as ChainCharacter | undefined;
        const charId = (c as { objectId?: string }).objectId;
        if (!json || !charId) return; // burned / transferred → skip
        const owner = result.summaries[i]?.owner ?? '';
        out.push(mapChainCharacter(charId, json, owner, narrativeDay));
    });
    return out;
}

function roleFromTags(tags: ChainTag[]): string | null {
    for (const tag of tags) {
        const label = typeof tag?.label === 'string' ? tag.label : '';
        if (label.startsWith('role:')) return label.slice('role:'.length);
    }
    return null;
}

/**
 * Off-chain survival snapshot via the validated economy core (@endless-story/economy).
 * Stateless + deterministic: `lazySettle(null, …)` settles birth→today on every read, so it
 * needs NO persistence and works on serverless. `memory_count` uses an age proxy until the
 * self-hosted relayer's per-namespace count is wired. Uses DESIGN constants (the in-game
 * ENDLESS scale is a narrative lever, not the real ~$ cost).
 */
function computeSurvival(
    json: ChainCharacter,
    attrMap: Record<string, number>,
    role: string,
    narrativeDay: number,
    memoryCountOverride?: number,
): Character['survival'] {
    const today = Math.max(0, Math.round(narrativeDay));
    const { snapshot } = lazySettle(null, {
        role,
        constitution: attrMap.constitution ?? 50,
        appearance: attrMap.appearance ?? 50,
        acuity: attrMap.acuity ?? 50,
        ageYearsStart: Number(json.profile?.physical_facts?.age_years ?? 0),
        // real per-namespace count from the relayer when available; else an age proxy.
        memoryCount: memoryCountOverride ?? 5 + today * 3,
        // 設定集 image count (on-chain media_assets) — grows with event moments / evolve-portrait.
        imageCount: Array.isArray(json.media_assets) ? json.media_assets.length : 0,
        subscribers: json.subscriber_count != null ? Number(json.subscriber_count) : 0,
        today,
    });
    const r1 = (x: number) => Math.round(x * 10) / 10;
    return {
        funds: Math.round(snapshot.funds),
        dailyCost: r1(snapshot.dailyCost),
        salary: r1(snapshot.salary),
        daysLeft: snapshot.daysLeft,
        level: snapshot.level,
        memoryCount: snapshot.memoryCount,
        memoryRent: r1(snapshot.memoryRent),
        imageCount: snapshot.imageCount,
        imageRent: r1(snapshot.imageRent),
        vitality: Math.round(snapshot.vitality),
        vitalityState: snapshot.vitalityState,
        lifeStage: snapshot.lifeStage,
    };
}

/** Current narrative day from the World tick (chain). Falls back to 1. */
async function fetchNarrativeDay(client: ReturnType<typeof makeSuiClient>): Promise<number> {
    const worldId = ENDLESS_STORY_DEPLOYMENT.worldId;
    if (!worldId) return 1;
    try {
        const res = await read.world.getWorld(client, worldId);
        const j = res.json as unknown as {
            state?: { current_tick?: number | string };
            time_config?: { days_per_tick_bp?: number | string };
        };
        const tick = Number(j.state?.current_tick ?? 0);
        const bp = Number(j.time_config?.days_per_tick_bp ?? 1670) || 1670;
        return Math.floor((tick * bp) / 10_000) + 1;
    } catch {
        return 1;
    }
}

function mapTags(tags: ChainTag[]): Character['publicTags'] {
    const out: NonNullable<Character['publicTags']> = [];
    for (const tag of tags) {
        const label = typeof tag?.label === 'string' ? tag.label : '';
        if (!label) continue;
        out.push({
            label,
            sourceEventId: unwrapOption(tag.source_event_id),
            affirmedAtMs: tag.affirmed_at_ms != null ? String(tag.affirmed_at_ms) : undefined,
        });
    }
    return out;
}

function mapGender(raw: string): Character['gender'] {
    if (raw === '男' || raw.toLowerCase() === 'male') return 'male';
    if (raw === '女' || raw.toLowerCase() === 'female') return 'female';
    return 'other';
}

const textDecoder = new TextDecoder();

function mapMediaAssets(rawAssets: ChainMediaAsset[], createdAt: string): BlobRef[] {
    return rawAssets
        .map((asset, index): BlobRef | null => {
            const uri = typeof asset.uri === 'string' ? asset.uri : '';
            if (!uri) return null;
            const kindNum = Number(asset.kind ?? 0);
            const metadata = typeof asset.metadata_uri === 'string' ? asset.metadata_uri : '';
            return {
                walrusBlobId: decodeWalrusBlobId(asset.walrus_blob_id),
                imageUrl: uri,
                kind: mapMediaKind(kindNum, index),
                mediaIndex: index,
                label: labelForMediaKind(kindNum, index, metadata),
                createdAt,
            } satisfies BlobRef;
        })
        .filter((x): x is BlobRef => x != null);
}

function decodeWalrusBlobId(raw: unknown): string {
    if (typeof raw === 'string') return raw;
    if (raw instanceof Uint8Array) return textDecoder.decode(raw);
    if (Array.isArray(raw)) {
        const bytes = raw
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 255);
        return bytes.length > 0 ? textDecoder.decode(new Uint8Array(bytes)) : '';
    }
    return '';
}

function mapMediaKind(kind: number, index: number): BlobRef['kind'] {
    if (kind === 6) return 'setting_sheet';
    if (kind === 2) return 'costume';
    if (kind === 3) return 'makeup';
    if (kind === 4) return 'event_moment';
    if (kind === 5) return 'scene_clip';
    return index === 0 ? 'anchor' : 'portrait_variant';
}

function labelForMediaKind(kind: number, index: number, metadata: string): string {
    const fromMetadata = parseMetadataLabel(metadata);
    if (fromMetadata) return fromMetadata;
    if (kind === 6) return '設定形象';
    if (kind === 2) return '服裝設定';
    if (kind === 3) return '戲妝設定';
    if (kind === 4) return '事件瞬間';
    return index === 0 ? '初始形象' : '形象變體';
}

function parseMetadataLabel(metadata: string): string | null {
    // §11 img2img additional views carry `?view=frontal|art-sheet`.
    const viewMatch = metadata.match(/[?&]view=([^&]+)/);
    if (viewMatch) {
        const view = decodeURIComponent(viewMatch[1]);
        const viewLabels: Record<string, string> = {
            frontal: '正面形象',
            'art-sheet': '人物設定',
        };
        if (viewLabels[view]) return viewLabels[view];
    }
    const match = metadata.match(/[?&]kind=([^&]+)/);
    if (!match) return null;
    const kind = decodeURIComponent(match[1]);
    const labels: Record<string, string> = {
        reference: '設定形象',
        stage: '戲妝登台',
        finery: '盛裝華服',
        daily: '日常卸妝',
        youth: '少年青澀',
        aged: '老年蒼勁',
        illness: '病中清減',
        snow: '雪夜獨行',
        custom: '自訂情境',
    };
    return labels[kind] ?? null;
}

/* ── chain shape (minimal — matches `character::Character` MoveStruct) ── */

interface ChainCharacter {
    profile?: {
        name?: string;
        description?: string;
        physical_facts?: {
            species?: string;
            gender?: string;
            body?: string;
            age_years?: number | string;
        };
    };
    attributes?: Array<{ key?: string; value?: number | string }>;
    media_assets?: ChainMediaAsset[];
    tags?: ChainTag[];
    state?: { saga_id?: unknown; current_scene_id?: unknown };
    image_url?: string;
    birth_ms?: number | string;
    birthMs?: number | string;
    subscriber_count?: number | string;
}

interface ChainTag {
    label?: string;
    source_event_id?: unknown;
    affirmed_at_ms?: number | string;
}

interface ChainMediaAsset {
    kind?: number | string;
    uri?: string;
    walrus_blob_id?: unknown;
    metadata_uri?: string;
}
