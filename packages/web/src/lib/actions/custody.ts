'use server';

/**
 * Custody / SEAL revocation demo actions.
 *
 * Proves the differentiated MemWal story: memory access is gated on-chain
 * by the character's ControlCap epoch.
 *   - revoke_all_control → bumps epoch → the saga's ControlCap is now
 *     stale → MemWal recall hits ENoAccess at the SEAL key server → the
 *     saga can no longer read the character's memories.
 *   - issue_control_cap → mints a fresh cap at the new epoch (to admin) →
 *     recall works again (memory.ts resolves the highest-epoch cap).
 *
 * Admin holds BOTH OwnerCap + ControlCap in the demo (redeem sent both),
 * so the admin keypair can authorize these owner-gated calls.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, read, tx as endlessTx } from '@endless-story/sdk';
import { getAdminContext, execAdminTx } from '@/lib/chain/admin-signer';

export interface CustodyResult {
    ok: boolean;
    digest?: string;
    error?: string;
}

async function resolveOwnerCapId(
    admin: Awaited<ReturnType<typeof getAdminContext>>,
    characterId: string,
): Promise<string | null> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return null;
    try {
        const caps = await read.character.listOwnerCapsForAddress(
            admin.client,
            admin.address,
            pkg,
        );
        return caps.find((c) => c.characterId === characterId)?.capId ?? null;
    } catch {
        return null;
    }
}

/** Revoke all ControlCaps for a character (epoch +1). Saga loses memory read. */
export async function revokeControlAction(characterId: string): Promise<CustodyResult> {
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'admin 載入失敗' };
    }
    const ownerCapId = await resolveOwnerCapId(admin, characterId);
    if (!ownerCapId) return { ok: false, error: '找不到此角色的 OwnerCap（admin 未持有？）' };

    try {
        const tx = new Transaction();
        tx.add(
            endlessTx.character.revokeAllControl({
                character: characterId,
                ownerCap: ownerCapId,
            }),
        );
        const res = await execAdminTx(admin, tx);
        if (!res.success) {
            return { ok: false, error: res.error ?? '撤銷失敗', digest: res.digest };
        }
        return { ok: true, digest: res.digest };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** Issue a fresh ControlCap (to admin) at the current epoch. Restores memory read. */
export async function reissueControlAction(characterId: string): Promise<CustodyResult> {
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'admin 載入失敗' };
    }
    const ownerCapId = await resolveOwnerCapId(admin, characterId);
    if (!ownerCapId) return { ok: false, error: '找不到此角色的 OwnerCap（admin 未持有？）' };

    try {
        const tx = new Transaction();
        // issue_control_cap returns the new ControlCap — transfer it to admin
        // so the saga (admin) holds it for MemWal recall.
        const cap = tx.add(
            endlessTx.character.issueControlCap({
                character: characterId,
                ownerCap: ownerCapId,
            }),
        );
        tx.transferObjects([cap], admin.address);
        const res = await execAdminTx(admin, tx);
        if (!res.success) {
            return { ok: false, error: res.error ?? '重新授權失敗', digest: res.digest };
        }
        return { ok: true, digest: res.digest };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
