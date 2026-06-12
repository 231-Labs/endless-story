/**
 * 劇照 Still read helpers — fetch individual Stills + list by owner.
 */
import * as gen from '../generated/endless_story/still.js';
import type { SuiClient } from '../client.js';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/shared/contract-ids';

export { gen as raw };

export const getStill = (client: SuiClient, stillId: string) =>
    gen.Still.get({ client, objectId: stillId });

export const getStillRegistry = (client: SuiClient, registryId: string) =>
    gen.StillRegistry.get({ client, objectId: registryId });

export interface StillRef {
    stillId: string;
    title: string;
    edition: number;
    walrusBlobId: string;
    imageUrl: string;
    characterId: string;
    sagaId: string;
}

/**
 * List all Still NFTs owned by a wallet address.
 * Paginated — fetches all pages.
 */
export async function listStillsForOwner(
    client: SuiClient,
    owner: string,
): Promise<StillRef[]> {
    const packageId = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!packageId) return [];
    const structType = `${packageId}::still::Still`;
    const out: StillRef[] = [];
    let cursor: string | null | undefined = null;
    for (;;) {
        const page = await client.getOwnedObjects({
            owner,
            filter: { StructType: structType },
            options: { showContent: true },
            cursor,
        });
        for (const item of page.data) {
            const content = item.data?.content;
            if (content?.dataType !== 'moveObject') continue;
            const f = (content as { fields: Record<string, unknown> }).fields;
            out.push({
                stillId: item.data!.objectId,
                title: f.title as string,
                edition: Number(f.edition),
                walrusBlobId: f.walrus_blob_id as string,
                imageUrl: f.image_url as string,
                characterId: f.character_id as string,
                sagaId: f.saga_id as string,
            });
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}
