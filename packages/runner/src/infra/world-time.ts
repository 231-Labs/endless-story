/**
 * World time — two-layer narrative clock, chain-canonical.
 *
 * Layer 1 (World epoch): `WorldState.current_tick` is the single source
 * of truth, advanced via `world::advance_tick`. We never cache it in a
 * local file (the old repo did; the new repo is chain-first).
 *
 * Layer 2 (Saga part-of-day): derived from the tick position within a
 * day. `days_per_tick_bp` (basis-points, 1/10000) sets the rhythm:
 *   1670 bp = 0.167 day/tick ≈ 6 ticks/day (戲班 default)
 *   10000 bp = 1.0 day/tick (one tick = one whole day)
 *
 * Day number is 1-indexed: tick 0 → 第 1 日.
 */

import { read, type SuiClient } from '@endless-story/sdk';

const BP_DENOM = 10_000;

/** Six 時辰-style parts for a 6-tick day; index clamps for other rhythms. */
const PARTS_OF_DAY = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'] as const;
export type PartOfDay = (typeof PARTS_OF_DAY)[number];

export interface WorldTime {
    /** Raw chain tick (WorldState.current_tick). */
    currentTick: number;
    /** Chain basis-points rhythm (WorldTimeConfig.days_per_tick_bp). */
    daysPerTickBp: number;
    /** Whole ticks that make up one day (round(10000 / bp), min 1). */
    ticksPerDay: number;
    /** 1-indexed narrative day. tick 0 → 1. */
    day: number;
    /** Which slice of the current day this tick falls in. */
    partOfDay: PartOfDay;
    /** 0-based tick position within the current day. */
    tickOfDay: number;
}

/** Whole ticks per day from the basis-points rhythm. Always ≥ 1. */
export function ticksPerDay(daysPerTickBp: number): number {
    if (!Number.isFinite(daysPerTickBp) || daysPerTickBp <= 0) return 1;
    return Math.max(1, Math.round(BP_DENOM / daysPerTickBp));
}

/** 1-indexed narrative day for a given tick. */
export function deriveDay(currentTick: number, daysPerTickBp: number): number {
    const elapsedDays = Math.floor((currentTick * daysPerTickBp) / BP_DENOM);
    return elapsedDays + 1;
}

/** Part-of-day label for a tick within its day. */
export function derivePartOfDay(currentTick: number, daysPerTickBp: number): PartOfDay {
    const perDay = ticksPerDay(daysPerTickBp);
    const tickOfDay = ((currentTick % perDay) + perDay) % perDay;
    // Map the day's slices across the 6-part palette so a coarser rhythm
    // (e.g. 2 ticks/day) still lands on sensible labels.
    const idx = Math.floor((tickOfDay / perDay) * PARTS_OF_DAY.length);
    return PARTS_OF_DAY[Math.min(idx, PARTS_OF_DAY.length - 1)];
}

/**
 * Fetch the live World time. Returns sensible defaults (tick 0 → day 1,
 * 清晨) if the World object can't be read so callers degrade gracefully.
 */
export async function fetchWorldTime(
    client: SuiClient,
    worldId: string,
): Promise<WorldTime> {
    let currentTick = 0;
    let daysPerTickBp = 1670;
    try {
        const res = await read.world.getWorld(client, worldId);
        const json = res.json as unknown as {
            state?: { current_tick?: number | string };
            time_config?: { days_per_tick_bp?: number | string };
        };
        currentTick = Number(json.state?.current_tick ?? 0);
        const bp = Number(json.time_config?.days_per_tick_bp ?? 0);
        if (Number.isFinite(bp) && bp > 0) daysPerTickBp = bp;
    } catch {
        // fall through to defaults
    }
    const perDay = ticksPerDay(daysPerTickBp);
    return {
        currentTick,
        daysPerTickBp,
        ticksPerDay: perDay,
        day: deriveDay(currentTick, daysPerTickBp),
        partOfDay: derivePartOfDay(currentTick, daysPerTickBp),
        tickOfDay: ((currentTick % perDay) + perDay) % perDay,
    };
}
