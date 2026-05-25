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
