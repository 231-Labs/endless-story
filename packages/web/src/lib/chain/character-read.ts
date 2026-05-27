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

import type { Character, CharacterRole } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';

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

function mapChainCharacter(id: string, json: ChainCharacter, ownerOverride?: string): Character {
    const profile = json.profile;
    const physical = profile?.physical_facts;
    const attrs = json.attributes ?? [];
    const attrMap: Record<string, number> = {};
    for (const a of attrs) {
        if (typeof a?.key === 'string' && typeof a?.value !== 'undefined') {
            attrMap[a.key] = Number(a.value);
        }
    }

    const birthMsRaw = json.birth_ms ?? json.birthMs ?? 0;
    const birthMs = typeof birthMsRaw === 'string' ? Number(birthMsRaw) : Number(birthMsRaw);
    const createdAt = birthMs > 0 ? new Date(birthMs).toISOString() : new Date().toISOString();

    return {
        id,
        nftOwner: ownerOverride ?? '',
        sagaId: unwrapOption(json.state?.saga_id),
        name: profile?.name ?? '無名',
        description: profile?.description ?? '',
        // Chain doesn't store role — placeholder; facade enriches from
        // voucher hint → Recruitment.specialty before returning to UI.
        role: '看客' as CharacterRole,
        gender: mapGender(physical?.gender ?? ''),
        age: Number(physical?.age_years ?? 0),
        physicalFacts: [physical?.species, physical?.body].filter(Boolean).join(' / ') || '—',
        attributes: {
            constitution: attrMap.constitution ?? 50,
            disposition: attrMap.disposition ?? 50,
            acuity: attrMap.acuity ?? 50,
            appearance: attrMap.appearance ?? 50,
        },
        gallery: {
            anchor: {
                walrusBlobId: '',
                imageUrl: json.image_url ?? '',
                kind: 'anchor',
                createdAt,
            },
            eventMoments: [],
        },
        survival: {
            funds: 0,
            dailyCost: 1,
            salary: 0,
            daysLeft: 0,
            level: 'stable',
        },
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
    return mapChainCharacter(id, json, owner ?? undefined);
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
    const out: Character[] = [];
    for (const c of result.characters) {
        const json = (c as { json?: unknown }).json as ChainCharacter | undefined;
        const charId = (c as { objectId?: string }).objectId;
        if (!json || !charId) continue;
        out.push(mapChainCharacter(charId, json, wallet));
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
    const out: Character[] = [];
    // summaries and characters are 1:1 by index; summaries carry the
    // `owner` we can stamp without an extra getObject roundtrip.
    result.characters.forEach((c, i) => {
        const json = (c as { json?: unknown }).json as ChainCharacter | undefined;
        const charId = (c as { objectId?: string }).objectId;
        if (!json || !charId) return; // burned / transferred → skip
        const owner = result.summaries[i]?.owner ?? '';
        out.push(mapChainCharacter(charId, json, owner));
    });
    return out;
}

function mapGender(raw: string): Character['gender'] {
    if (raw === '男' || raw.toLowerCase() === 'male') return 'male';
    if (raw === '女' || raw.toLowerCase() === 'female') return 'female';
    return 'other';
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
    state?: { saga_id?: string | null };
    image_url?: string;
    birth_ms?: number | string;
    birthMs?: number | string;
    subscriber_count?: number | string;
}
