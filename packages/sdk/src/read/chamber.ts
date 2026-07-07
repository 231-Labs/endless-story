/**
 * Chamber read helpers — PersonalVault + VaultTicket discovery.
 *
 * VaultTicket is an owned object in the user's wallet; querying it is a
 * single `getOwnedObjects` call and gives us both vault_id and kiosk_id
 * without any registry lookup.
 */
import type { SuiClientTypes } from '@mysten/sui/client';
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
 * Find the VaultTicket owned by `owner` (one PersonalVault per wallet).
 * Returns null if the user hasn't created a vault yet; stops at the first hit.
 */
export async function findVaultTicket(
    client: SuiClient,
    owner: string,
): Promise<VaultTicketRef | null> {
    const packageId = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!packageId) return null;
    const structType = `${packageId}::chamber::VaultTicket`;
    let cursor: string | null = null;
    for (;;) {
        const page: SuiClientTypes.ListOwnedObjectsResponse<{ json: true }> = await client.core.listOwnedObjects({
            owner,
            type: structType,
            cursor,
            include: { json: true },
        });
        for (const item of page.objects) {
            const f = item.json as Record<string, string> | null;
            if (!f) continue;
            return { ticketId: item.objectId, vaultId: f.vault_id, kioskId: f.kiosk_id };
        }
        if (!page.hasNextPage || !page.cursor) break;
        cursor = page.cursor;
    }
    return null;
}

/**
 * Find the `0x2::kiosk::KioskOwnerCap` held by `owner` for a specific kiosk
 * (matched on its `for` field). Needed to place / list / delist Stills in that
 * vault's kiosk. Returns null if the wallet doesn't hold the cap.
 */
export async function findKioskOwnerCap(
    client: SuiClient,
    owner: string,
    kioskId: string,
): Promise<string | null> {
    let cursor: string | null = null;
    for (;;) {
        const page: SuiClientTypes.ListOwnedObjectsResponse<{ json: true }> = await client.core.listOwnedObjects({
            owner,
            type: '0x2::kiosk::KioskOwnerCap',
            cursor,
            include: { json: true },
        });
        for (const item of page.objects) {
            const f = item.json as Record<string, string> | null;
            if (!f) continue;
            if (f.for === kioskId) return item.objectId;
        }
        if (!page.hasNextPage || !page.cursor) break;
        cursor = page.cursor;
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
    let f: Record<string, unknown> | null = null;
    try {
        const res = await client.core.getObject({ objectId: vaultId, include: { json: true } });
        f = res.object.json as Record<string, unknown> | null;
    } catch {
        return null; // object does not exist
    }
    if (!f) return null;
    // layout_blob_id is Option<String>: gRPC json renders it as { vec: [value] } (or
    // { vec: [] } / null for None); older shapes nested it under `fields`.
    let layoutBlobId: string | null = null;
    if (f.layout_blob_id) {
        const opt = f.layout_blob_id as any;
        if (typeof opt === 'string') {
            layoutBlobId = opt;
        } else {
            const vec = opt?.vec ?? opt?.fields?.vec ?? null;
            if (Array.isArray(vec) && vec.length > 0) layoutBlobId = String(vec[0]);
        }
    }
    return {
        vaultId,
        owner: f.owner as string,
        kioskId: f.kiosk_id as string,
        layoutBlobId,
        layoutVersion: Number(f.layout_version ?? 0),
    };
}
