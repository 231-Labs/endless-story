/**
 * Character view queries — Character / OwnerCap / ControlCap + list helpers.
 */
import * as gen from '../generated/endless_story/character.js';
import type { SuiClient } from '../client.js';

export { gen as raw };

export const getCharacter = (client: SuiClient, characterId: string) =>
  gen.Character.get({ client, objectId: characterId });

export const getOwnerCap = (client: SuiClient, ownerCapId: string) =>
  gen.OwnerCap.get({ client, objectId: ownerCapId });

export const getControlCap = (client: SuiClient, controlCapId: string) =>
  gen.ControlCap.get({ client, objectId: controlCapId });

export const getManyCharacters = (client: SuiClient, characterIds: string[]) =>
  gen.Character.getMany({ client, objectIds: characterIds });

/**
 * List all `OwnerCap` objects owned by an address — Sui doesn't have a
 * native index for "characters in saga X", but every minted Character
 * comes with an OwnerCap that flows to the recipient. Paginating those
 * is the cleanest "what does this wallet own" query.
 *
 * Returns the parsed OwnerCap json shape (the on-chain struct). Use
 * each entry's `character_id` to fetch the actual Character objects.
 */
export interface OwnerCapRef {
    capId: string;
    characterId: string;
    worldId: string;
    mintedAtMs: string;
    cumulativeRevenue: string;
}

/** One `ControlCap` owned by an address. `epoch` matters: a cap is only
 *  valid while `epoch === character.control_epoch` (revoke / reassign
 *  bumps the character's epoch, stranding older caps). */
export interface ControlCapRef {
    capId: string;
    characterId: string;
    epoch: number;
    sagaId: string | null;
}

/**
 * List `ControlCap` objects owned by an address. Used by the memory layer
 * to find the *current* cap (highest epoch) for a character — robust to
 * revoke / reassign which leave stale caps in the wallet.
 */
export async function listControlCapsForAddress(
    client: SuiClient,
    owner: string,
    packageId: string,
): Promise<ControlCapRef[]> {
    const structType = `${packageId}::character::ControlCap`;
    const out: ControlCapRef[] = [];
    let cursor: string | null | undefined = null;
    for (;;) {
        const page = await client.getOwnedObjects({
            owner,
            cursor,
            limit: 50,
            filter: { StructType: structType },
            options: { showType: true, showContent: true },
        });
        for (const obj of page.data) {
            const content = obj.data?.content;
            if (!content || content.dataType !== 'moveObject') continue;
            const fields = content.fields as Record<string, unknown>;
            const characterId = typeof fields.character_id === 'string' ? fields.character_id : '';
            if (!characterId || !obj.data?.objectId) continue;
            const sagaRaw = fields.saga_id;
            const sagaId =
                typeof sagaRaw === 'string'
                    ? sagaRaw
                    : sagaRaw && typeof sagaRaw === 'object' && 'fields' in (sagaRaw as object)
                      ? null
                      : null;
            out.push({
                capId: obj.data.objectId,
                characterId,
                epoch: Number(fields.epoch ?? 0),
                sagaId,
            });
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}

export async function listOwnerCapsForAddress(
    client: SuiClient,
    owner: string,
    packageId: string,
): Promise<OwnerCapRef[]> {
    const structType = `${packageId}::character::OwnerCap`;
    const out: OwnerCapRef[] = [];
    let cursor: string | null | undefined = null;
    for (;;) {
        const page = await client.getOwnedObjects({
            owner,
            cursor,
            limit: 50,
            filter: { StructType: structType },
            options: { showType: true, showContent: true },
        });
        for (const obj of page.data) {
            const data = obj.data;
            const content = data?.content;
            if (!content || content.dataType !== 'moveObject') continue;
            const fields = content.fields as Record<string, unknown>;
            const characterId = typeof fields.character_id === 'string' ? fields.character_id : '';
            if (!characterId || !data.objectId) continue;
            out.push({
                capId: data.objectId,
                characterId,
                worldId: typeof fields.world_id === 'string' ? fields.world_id : '',
                mintedAtMs: String(fields.minted_at_ms ?? '0'),
                cumulativeRevenue: String(fields.cumulative_revenue ?? '0'),
            });
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}

/**
 * Convenience: list every Character object owned by `address`.
 * Composes `listOwnerCapsForAddress` + `getManyCharacters`.
 *
 * Use this when you want UI-ready Character data; use the lower-level
 * `listOwnerCapsForAddress` when you only need ids (cheaper).
 */
export async function listCharactersForOwner(
    client: SuiClient,
    owner: string,
    packageId: string,
) {
    const caps = await listOwnerCapsForAddress(client, owner, packageId);
    if (caps.length === 0) return { caps, characters: [] as Awaited<ReturnType<typeof getManyCharacters>> };
    const characters = await getManyCharacters(client, caps.map((c) => c.characterId));
    return { caps, characters };
}

/**
 * One row of the `CharacterMinted` event log (mirrors the on-chain
 * `character::CharacterMinted` struct, see codegen).
 */
export interface CharacterMintedSummary {
    characterId: string;
    worldId: string;
    sagaId: string | null;
    sceneId: string | null;
    ownerCapId: string;
    controlCapId: string;
    name: string;
    owner: string;
    mintedAtMs: string;
}

export interface ListMintedOptions {
    /**
     * Filter by saga membership:
     *   - undefined → all characters (any saga + wild)
     *   - string    → only this saga
     *   - null      → only "wild" characters (saga_id == None on chain)
     */
    sagaId?: string | null;
    /** Cap on events scanned. Default unlimited (paginate to end). */
    maxEvents?: number;
}

/**
 * List every Character ever minted from this package, via event log.
 *
 * Sui has no "all characters" index, but `CharacterMinted` events form
 * a complete log we can scan. Latest-first, deduplicated by character_id
 * (a mint event fires exactly once per character so dedup is just a
 * safety net for any future re-publish edge cases).
 *
 * **Caveats**: events from BURNED / TRANSFERRED-OUT characters still
 * appear; caller should treat `getManyCharacters` errors as "no longer
 * exists" and drop those rows.
 */
export async function listMintedCharacterSummaries(
    client: SuiClient,
    packageId: string,
    opts: ListMintedOptions = {},
): Promise<CharacterMintedSummary[]> {
    const eventType = `${packageId}::character::CharacterMinted`;
    const out: CharacterMintedSummary[] = [];
    const seen = new Set<string>();
    let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
    const cap = opts.maxEvents ?? Infinity;

    for (;;) {
        const page = await client.queryEvents({
            query: { MoveEventType: eventType },
            cursor,
            limit: 50,
            order: 'descending',
        });
        for (const ev of page.data) {
            const parsed = ev.parsedJson as Partial<{
                character_id: string;
                world_id: string;
                saga_id: string | { Some: string } | null;
                scene_id: string | { Some: string } | null;
                owner_cap_id: string;
                control_cap_id: string;
                name: string;
                owner: string;
                minted_at_ms: string | number;
            }>;
            const characterId = parsed.character_id;
            if (!characterId || seen.has(characterId)) continue;

            // Move Option<ID> serializes as string | null in event JSON
            // (Sui's parsedJson collapses Some/None). Defensive parse below.
            const sagaIdRaw = parsed.saga_id;
            const sagaId =
                sagaIdRaw == null ? null : typeof sagaIdRaw === 'string' ? sagaIdRaw : sagaIdRaw.Some ?? null;
            const sceneIdRaw = parsed.scene_id;
            const sceneId =
                sceneIdRaw == null ? null : typeof sceneIdRaw === 'string' ? sceneIdRaw : sceneIdRaw.Some ?? null;

            // saga filter
            if (opts.sagaId !== undefined && opts.sagaId !== sagaId) continue;

            seen.add(characterId);
            out.push({
                characterId,
                worldId: parsed.world_id ?? '',
                sagaId,
                sceneId,
                ownerCapId: parsed.owner_cap_id ?? '',
                controlCapId: parsed.control_cap_id ?? '',
                name: parsed.name ?? '',
                owner: parsed.owner ?? '',
                mintedAtMs: String(parsed.minted_at_ms ?? '0'),
            });
            if (out.length >= cap) return out;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}

/**
 * Composes `listMintedCharacterSummaries` + `getManyCharacters`.
 * Returns the live Character objects in event-mint order (newest first).
 */
export async function listMintedCharacters(
    client: SuiClient,
    packageId: string,
    opts: ListMintedOptions = {},
) {
    const summaries = await listMintedCharacterSummaries(client, packageId, opts);
    if (summaries.length === 0)
        return { summaries, characters: [] as Awaited<ReturnType<typeof getManyCharacters>> };
    const characters = await getManyCharacters(client, summaries.map((s) => s.characterId));
    return { summaries, characters };
}
