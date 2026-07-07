'use server';

/**
 * DreamConfig read + write — admin price control.
 *
 * Server-side uses admin keypair (DreamAdminCap holder) to call
 * dream::set_dream_price / dream::set_paused. Read is server-anonymous
 * (anyone can read DreamConfig shared object).
 */

import { Transaction } from '@mysten/sui/transactions';
import {
    ENDLESS_STORY_DEPLOYMENT,
    read,
    tx as endlessTx,
} from '@endless-story/sdk';
import { getAdminContext, execAdminTx } from '@/lib/chain/admin-signer';

export interface DreamConfigSnapshot {
    price: string;   // raw u64 string (6 decimals)
    paused: boolean;
}

export interface SetDreamPriceInput {
    /** Raw amount including 6 decimals (e.g. 50_000_000 = 50 ENDLESS). */
    priceRaw: string;
}

export interface SetDreamPausedInput {
    paused: boolean;
}

export interface MutationResult {
    ok: boolean;
    digest?: string;
    error?: string;
}

export async function getDreamConfigSnapshot(): Promise<DreamConfigSnapshot | null> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.dreamConfigId) return null;
    try {
        const admin = getAdminContext();
        const res = await read.dream.getDreamConfig(admin.client, d.dreamConfigId);
        const json = res.json as { price?: string | number; paused?: boolean };
        return {
            price: String(json.price ?? '0'),
            paused: !!json.paused,
        };
    } catch (err) {
        console.warn('[dream-config] getDreamConfigSnapshot failed:', err);
        return null;
    }
}

export async function setDreamPriceAction(input: SetDreamPriceInput): Promise<MutationResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.dreamConfigId || !d.dreamAdminCapId) {
        return { ok: false, error: 'DreamConfig 尚未種子化' };
    }
    try {
        const admin = getAdminContext();
        const tx = new Transaction();
        tx.add(
            endlessTx.dream.setDreamPrice({
                admin: d.dreamAdminCapId,
                config: d.dreamConfigId,
                newPrice: BigInt(input.priceRaw),
            }),
        );
        const res = await execAdminTx(admin, tx);
        if (!res.success) {
            return {
                ok: false,
                error: res.error ?? '交易失敗',
                digest: res.digest,
            };
        }
        return { ok: true, digest: res.digest };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

export async function setDreamPausedAction(input: SetDreamPausedInput): Promise<MutationResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.dreamConfigId || !d.dreamAdminCapId) {
        return { ok: false, error: 'DreamConfig 尚未種子化' };
    }
    try {
        const admin = getAdminContext();
        const tx = new Transaction();
        tx.add(
            endlessTx.dream.setPaused({
                admin: d.dreamAdminCapId,
                config: d.dreamConfigId,
                paused: input.paused,
            }),
        );
        const res = await execAdminTx(admin, tx);
        if (!res.success) {
            return {
                ok: false,
                error: res.error ?? '交易失敗',
                digest: res.digest,
            };
        }
        return { ok: true, digest: res.digest };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
