'use server';

/**
 * StillMintConfig read + write — admin control of the self-serve 劇照 mint fee.
 *
 * Mirrors dream-config: server-side uses the admin keypair (StorytellerCap
 * holder) to call still::set_mint_fee / still::set_mint_paused. Read is
 * server-anonymous (the StillMintConfig shared object is public).
 *
 * The config is created at bootstrap (cli `bootstrap.ts` Tx 6.6, default 1
 * ENDLESS) or via the one-off `create-mint-config` script for an existing
 * world. This panel only tunes the already-created config.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, read, tx as endlessTx } from '@endless-story/sdk';
import { getAdminContext, execAdminTx } from '@/lib/chain/admin-signer';

export interface MintConfigSnapshot {
    fee: string; // raw u64 string (6 decimals)
    paused: boolean;
}

export interface SetMintFeeInput {
    /** Raw amount including 6 decimals (e.g. 1_000_000 = 1 ENDLESS). */
    feeRaw: string;
}

export interface SetMintPausedInput {
    paused: boolean;
}

export interface MutationResult {
    ok: boolean;
    digest?: string;
    error?: string;
}

export async function getMintConfigSnapshot(): Promise<MintConfigSnapshot | null> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.stillMintConfigId) return null;
    try {
        const admin = getAdminContext();
        const ref = await read.still.getMintConfigRef(admin.client, d.stillMintConfigId);
        if (!ref) return null;
        return { fee: ref.fee.toString(), paused: ref.paused };
    } catch (err) {
        console.warn('[mint-config] getMintConfigSnapshot failed:', err);
        return null;
    }
}

export async function setMintFeeAction(input: SetMintFeeInput): Promise<MutationResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.stillMintConfigId || !d.storytellerCapId || !d.sagaId) {
        return { ok: false, error: 'StillMintConfig 尚未種子化' };
    }
    try {
        const admin = getAdminContext();
        const tx = new Transaction();
        tx.add(
            endlessTx.still.setMintFee({
                cap: d.storytellerCapId,
                saga: d.sagaId,
                config: d.stillMintConfigId,
                newFee: BigInt(input.feeRaw),
            }),
        );
        const res = await execAdminTx(admin, tx);
        if (!res.success) {
            return { ok: false, error: res.error ?? '交易失敗', digest: res.digest };
        }
        return { ok: true, digest: res.digest };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

export async function setMintPausedAction(input: SetMintPausedInput): Promise<MutationResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.stillMintConfigId || !d.storytellerCapId || !d.sagaId) {
        return { ok: false, error: 'StillMintConfig 尚未種子化' };
    }
    try {
        const admin = getAdminContext();
        const tx = new Transaction();
        tx.add(
            endlessTx.still.setMintPaused({
                cap: d.storytellerCapId,
                saga: d.sagaId,
                config: d.stillMintConfigId,
                paused: input.paused,
            }),
        );
        const res = await execAdminTx(admin, tx);
        if (!res.success) {
            return { ok: false, error: res.error ?? '交易失敗', digest: res.digest };
        }
        return { ok: true, digest: res.digest };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
