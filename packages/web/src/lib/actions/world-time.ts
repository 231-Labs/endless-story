'use server';

/**
 * World time — read snapshot + admin-signed tick advance.
 *
 * `WorldState.current_tick` is the chain-canonical narrative clock. The
 * admin keypair holds the World AdminCap, so advancing is a server
 * action (no wallet sign). Day / part-of-day are derived from the tick
 * + `days_per_tick_bp` (basis-points rhythm).
 */

import { Transaction } from '@mysten/sui/transactions';
import {
    ENDLESS_STORY_DEPLOYMENT,
    read,
    tx as endlessTx,
} from '@endless-story/sdk';
import { getAdminContext, execAdminTx } from '@/lib/chain/admin-signer';

const BP_DENOM = 10_000;
const PARTS_OF_DAY = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'] as const;
/** The night buckets — when characters sleep / consolidate (REFLECT step). Kept beside
 *  PARTS_OF_DAY so the night test stays anchored to the actual labels and can't drift
 *  against an external literal. */
const NIGHT_PARTS: ReadonlySet<string> = new Set(['入夜', '深宵']);

export interface WorldTimeSnapshot {
    currentTick: number;
    daysPerTickBp: number;
    ticksPerDay: number;
    day: number;
    partOfDay: string;
    /** True when partOfDay is a night bucket (入夜 / 深宵) — the sleep/REFLECT window.
     *  Derived here rather than compared by callers: the previous caller test
     *  `partOfDay === 'night'` never matched the Chinese labels, silently disabling
     *  the whole nightly consolidation step. */
    isNight: boolean;
    tickOfDay: number;
}

export interface AdvanceTickResult {
    ok: boolean;
    digest?: string;
    snapshot?: WorldTimeSnapshot;
    error?: string;
}

function ticksPerDay(bp: number): number {
    if (!Number.isFinite(bp) || bp <= 0) return 1;
    return Math.max(1, Math.round(BP_DENOM / bp));
}

function deriveSnapshot(currentTick: number, daysPerTickBp: number): WorldTimeSnapshot {
    const perDay = ticksPerDay(daysPerTickBp);
    const tickOfDay = ((currentTick % perDay) + perDay) % perDay;
    const idx = Math.min(
        Math.floor((tickOfDay / perDay) * PARTS_OF_DAY.length),
        PARTS_OF_DAY.length - 1,
    );
    const partOfDay = PARTS_OF_DAY[idx];
    return {
        currentTick,
        daysPerTickBp,
        ticksPerDay: perDay,
        day: Math.floor((currentTick * daysPerTickBp) / BP_DENOM) + 1,
        partOfDay,
        isNight: NIGHT_PARTS.has(partOfDay),
        tickOfDay,
    };
}

export async function getWorldTimeSnapshot(): Promise<WorldTimeSnapshot | null> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.worldId) return null;
    try {
        const admin = getAdminContext();
        const res = await read.world.getWorld(admin.client, d.worldId);
        const json = res.json as unknown as {
            state?: { current_tick?: number | string };
            time_config?: { days_per_tick_bp?: number | string };
        };
        const currentTick = Number(json.state?.current_tick ?? 0);
        const bp = Number(json.time_config?.days_per_tick_bp ?? 1670) || 1670;
        return deriveSnapshot(currentTick, bp);
    } catch (err) {
        console.warn('[world-time] getWorldTimeSnapshot failed:', err);
        return null;
    }
}

export async function advanceTickAction(): Promise<AdvanceTickResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.worldId || !d.adminCapId) {
        return { ok: false, error: 'World 尚未種子化（缺 worldId / adminCapId）' };
    }
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    try {
        const tx = new Transaction();
        // advance_tick(admin_cap, world, clock) — the generated wrapper
        // auto-injects the 0x6 Clock, so we only pass cap + world.
        tx.add(
            endlessTx.world.advanceTick({
                adminCap: d.adminCapId,
                world: d.worldId,
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
        // execAdminTx waits for finality inside the admin lock, so the fullnode
        // has indexed the new tick before we re-read — otherwise read-after-write
        // lag returns the OLD tick and the panel looks like it didn't advance.
        const snapshot = await getWorldTimeSnapshot();
        return { ok: true, digest: res.digest, snapshot: snapshot ?? undefined };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
