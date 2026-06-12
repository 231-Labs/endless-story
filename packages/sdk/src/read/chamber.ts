/**
 * Chamber read helpers — PersonalVault + VaultTicket discovery.
 *
 * VaultTicket is an owned object in the user's wallet; querying it is a
 * single `getOwnedObjects` call and gives us both vault_id and kiosk_id
 * without any registry lookup.
 */
import type { SuiClient } from '../client.js';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/shared/contract-ids';

export interface VaultTicketRef {
    ticketId: string;
    vaultId: string;
    kioskId: string;
}

export interface PersonalVaultRef {
    vaultId: string;
    owner: string;
    kioskId: string;
    layoutBlobId: string | null;
    layoutVersion: number;
}

/**
 * Find the VaultTicket owned by `owner`.
 * Returns null if the user hasn't created a vault yet.
 */
export async function findVaultTicket(
    client: SuiClient,
    owner: string,
): Promise<VaultTicketRef | null> {
    const packageId = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!packageId) return null;
    const structType = `${packageId}::chamber::VaultTicket`;
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
            const f = (content as { fields: Record<string, string> }).fields;
            return {
                ticketId: item.data!.objectId,
                vaultId: f.vault_id,
                kioskId: f.kiosk_id,
            };
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return null;
}

/**
 * Fetch the on-chain fields of a PersonalVault by object ID.
 * Returns null if the object doesn't exist or isn't a PersonalVault.
 */
export async function getPersonalVault(
    client: SuiClient,
    vaultId: string,
): Promise<PersonalVaultRef | null> {
    const res = await client.getObject({
        id: vaultId,
        options: { showContent: true },
    });
    const content = res.data?.content;
    if (content?.dataType !== 'moveObject') return null;
    const f = (content as any).fields as Record<string, unknown>;
    // layout_blob_id is Option<String>: on-chain it's either null or { fields: { vec: [value] } }
    let layoutBlobId: string | null = null;
    if (f.layout_blob_id) {
        const opt = f.layout_blob_id as any;
        const vec = opt?.fields?.vec ?? opt?.vec ?? null;
        if (Array.isArray(vec) && vec.length > 0) layoutBlobId = String(vec[0]);
    }
    return {
        vaultId,
        owner: f.owner as string,
        kioskId: f.kiosk_id as string,
        layoutBlobId,
        layoutVersion: Number(f.layout_version ?? 0),
    };
}
