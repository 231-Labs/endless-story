'use server';

/**
 * Read + write FaucetConfig (drip_amount / cooldown_ms / supply_cap / paused).
 *
 * Server action uses the admin keypair so it works regardless of which
 * wallet (if any) the operator has connected in the browser. The admin
 * keypair holds the FaucetAdminCap.
 */

import { Transaction } from '@mysten/sui/transactions';
import {
    ENDLESS_STORY_DEPLOYMENT,
    read,
    tx as endlessTx,
} from '@endless-story/sdk';
import { getAdminContext } from '@/lib/chain/admin-signer';

export interface FaucetSnapshot {
    drip_amount: string;
    cooldown_ms: string;
    total_supply_cap: string;
    total_minted: string;
    paused: boolean;
}

export interface SetFaucetConfigInput {
    drip_amount: string; // raw amount (with 6 decimals)
    cooldown_ms: string; // ms
    total_supply_cap: string; // 0 = unlimited
    paused: boolean;
}

export interface SetFaucetConfigResult {
    ok: boolean;
    digest?: string;
    error?: string;
}

export async function getFaucetSnapshot(): Promise<FaucetSnapshot | null> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.faucetId) return null;
    const admin = getAdminContext();
    try {
        const res = await read.faucet.getFaucet(admin.client, d.faucetId);
        const j = res.json as unknown as {
            drip_amount: string | number;
            cooldown_ms: string | number;
            total_supply_cap: string | number;
            total_minted: string | number;
            paused: boolean;
        };
        return {
            drip_amount: String(j.drip_amount),
            cooldown_ms: String(j.cooldown_ms),
            total_supply_cap: String(j.total_supply_cap),
            total_minted: String(j.total_minted),
            paused: !!j.paused,
        };
    } catch (err) {
        console.warn('[faucet-config] getFaucetSnapshot failed:', err);
        return null;
    }
}

export async function setFaucetConfig(input: SetFaucetConfigInput): Promise<SetFaucetConfigResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.faucetId || !d.faucetAdminCapId) {
        return { ok: false, error: 'faucet 尚未種子化' };
    }
    try {
        const admin = getAdminContext();
        const tx = new Transaction();
        tx.add(
            endlessTx.faucet.setConfig({
                admin: d.faucetAdminCapId,
                faucet: d.faucetId,
                dripAmount: BigInt(input.drip_amount),
                cooldownMs: BigInt(input.cooldown_ms),
                totalSupplyCap: BigInt(input.total_supply_cap),
                paused: input.paused,
            }),
        );
        const res = await admin.client.signAndExecuteTransaction({
            transaction: tx,
            signer: admin.signer,
            options: { showEffects: true },
        });
        if (res.effects?.status?.status !== 'success') {
            return { ok: false, error: res.effects?.status?.error ?? '交易失敗', digest: res.digest };
        }
        return { ok: true, digest: res.digest };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
