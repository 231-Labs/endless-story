/**
 * 劇照 Still read helpers — fetch individual Stills + list by owner.
 */
import * as gen from '../generated/endless_story/still.js';
import type { SuiClientTypes } from '@mysten/sui/client';
import type { SuiClient } from '../client.js';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/shared/contract-ids';

export { gen as raw };

export const getStill = (client: SuiClient, stillId: string) =>
    gen.Still.get({ client, objectId: stillId });

export const getStillRegistry = (client: SuiClient, registryId: string) =>
    gen.StillRegistry.get({ client, objectId: registryId });

export const getMintConfig = (client: SuiClient, configId: string) =>
    gen.StillMintConfig.get({ client, objectId: configId });

export interface MintConfigRef {
    configId: string;
    /** self-serve fee in ENDLESS base units (currency = 6 decimals) */
    fee: bigint;
    paused: boolean;
    sagaId: string;
}

/**
 * Read the self-serve mint config (fee + pause state). Returns null if the
 * object is missing — e.g. the upgrade ran but `create_mint_config` hasn't,
 * so callers can fall back to the free admin path / hide the paid affordance.
 */
export async function getMintConfigRef(
    client: SuiClient,
    configId: string,
): Promise<MintConfigRef | null> {
    let f: Record<string, unknown> | null = null;
    try {
        const res = await client.core.getObject({ objectId: configId, include: { json: true } });
        f = res.object.json as Record<string, unknown> | null;
    } catch {
        return null; // object missing
    }
    if (!f) return null;
    return {
        configId,
        fee: BigInt(f.fee as string | number),
        paused: Boolean(f.paused),
        sagaId: f.saga_id as string,
    };
}

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
    let cursor: string | null = null;
    for (;;) {
        const page: SuiClientTypes.ListOwnedObjectsResponse<{ json: true }> = await client.core.listOwnedObjects({
            owner,
            type: structType,
            cursor,
            include: { json: true },
        });
        for (const item of page.objects) {
            const f = item.json as Record<string, unknown> | null;
            if (!f) continue;
            out.push({
                stillId: item.objectId,
                title: f.title as string,
                edition: Number(f.edition),
                walrusBlobId: f.walrus_blob_id as string,
                imageUrl: f.image_url as string,
                characterId: f.character_id as string,
                sagaId: f.saga_id as string,
            });
        }
        if (!page.hasNextPage || !page.cursor) break;
        cursor = page.cursor;
    }
    return out;
}
