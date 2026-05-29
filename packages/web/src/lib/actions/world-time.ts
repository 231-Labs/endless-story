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
import { getAdminContext } from '@/lib/chain/admin-signer';

const BP_DENOM = 10_000;
const PARTS_OF_DAY = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'] as const;

export interface WorldTimeSnapshot {
    currentTick: number;
    daysPerTickBp: number;
    ticksPerDay: number;
    day: number;
    partOfDay: string;
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
    return {
        currentTick,
        daysPerTickBp,
        ticksPerDay: perDay,
        day: Math.floor((currentTick * daysPerTickBp) / BP_DENOM) + 1,
        partOfDay: PARTS_OF_DAY[idx],
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
        const res = await admin.client.signAndExecuteTransaction({
            transaction: tx,
            signer: admin.signer,
            options: { showEffects: true },
        });
        if (res.effects?.status?.status !== 'success') {
            return {
                ok: false,
                error: res.effects?.status?.error ?? '交易失敗',
                digest: res.digest,
            };
        }
        // Wait for the fullnode to index the new tick before re-reading —
        // otherwise read-after-write lag returns the OLD tick and the panel
        // looks like it didn't advance until a manual reload.
        try {
            await admin.client.waitForTransaction({ digest: res.digest });
        } catch {
            // best-effort; snapshot read below may still lag, panel reload covers it
        }
        const snapshot = await getWorldTimeSnapshot();
        return { ok: true, digest: res.digest, snapshot: snapshot ?? undefined };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
