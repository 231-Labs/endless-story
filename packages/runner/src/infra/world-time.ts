/**
 * World time — two-layer narrative clock, chain-canonical.
 *
 * Layer 1 (World epoch): `WorldState.current_tick` is the single source
 * of truth, advanced via `world::advance_tick`. We never cache it in a
 * local file (the old repo did; the new repo is chain-first).
 *
 * Layer 2 (Saga part-of-day): derived from the tick position within a
 * day. `days_per_tick_bp` (basis-points, 1/10000) sets the rhythm:
 *   1670 bp = 0.167 day/tick ≈ 6 ticks/day (troupe default)
 *   10000 bp = 1.0 day/tick (one tick = one whole day)
 *
 * Day number is 1-indexed: tick 0 → day 1.
 *
 * Mirror 模式（見 docs/narrative/WORLD_TIME_MIRROR.md）：時間權威反轉——
 * 敘事時刻 = 真實時刻（UTC+8）年份減一百，tick 降為「演繹的心跳」，只記
 * 「有人在演」而不再定義時間。此時 layer 2 由牆鐘投影：`ticksPerDay` 固定
 * 為 6、`tickOfDay` 即時辰 bucket index、`day` 以 `WorldState.created_at_ms`
 * 為 epoch 的故事日序。六拍語義原封不動，消費者（gazette-compiler 等）不用改。
 *
 * 法則與所有時間數學都住在 `@endless-story/shared/world-clock`；本檔只做
 * 鏈讀、模式分歧與公開 API 的薄轉發。
 */

import { read, type SuiClient } from '@endless-story/sdk';
import {
    PARTS_OF_DAY,
    formatStoryDate,
    resolveWorldClockConfig,
    storyDayIndex,
    storyNow,
    tickDerivedDay,
    tickOfDay as deriveTickOfDay,
    tickPartOfDay,
    ticksPerDay as deriveTicksPerDay,
    type PartOfDay,
    type StoryDate,
    type WorldTimeMode,
} from '@endless-story/shared/world-clock';

export type { PartOfDay };

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
    /** 時間權威：'tick' 由心跳推導，'mirror' 由牆鐘投影。 */
    mode?: WorldTimeMode;
    /** 以下僅 mirror 模式填寫。 */
    date?: StoryDate;
    /** 「民國十五年八月五日」。 */
    dateLabel?: string;
}

/** Whole ticks per day from the basis-points rhythm. Always ≥ 1. */
export function ticksPerDay(daysPerTickBp: number): number {
    return deriveTicksPerDay(daysPerTickBp);
}

/** 1-indexed narrative day for a given tick. */
export function deriveDay(currentTick: number, daysPerTickBp: number): number {
    return tickDerivedDay(currentTick, daysPerTickBp);
}

/** Part-of-day label for a tick within its day. */
export function derivePartOfDay(currentTick: number, daysPerTickBp: number): PartOfDay {
    return tickPartOfDay(currentTick, daysPerTickBp);
}

/**
 * Fetch the live World time. Returns sensible defaults (tick 0 → day 1,
 * first part-of-day) if the World object can't be read so callers degrade gracefully.
 * Mirror 之下鏈讀失敗只讓心跳數未知——時間仍由牆鐘給出。
 */
export async function fetchWorldTime(
    client: SuiClient,
    worldId: string,
): Promise<WorldTime> {
    let currentTick = 0;
    let daysPerTickBp = 1670;
    let tickIntervalMs: number | undefined;
    let createdAtMs: number | undefined;
    try {
        const res = await read.world.getWorld(client, worldId);
        const json = res.json as unknown as {
            state?: { current_tick?: number | string; created_at_ms?: number | string };
            time_config?: {
                days_per_tick_bp?: number | string;
                tick_interval_ms?: number | string;
            };
        };
        currentTick = Number(json.state?.current_tick ?? 0);
        const bp = Number(json.time_config?.days_per_tick_bp ?? 0);
        if (Number.isFinite(bp) && bp > 0) daysPerTickBp = bp;
        tickIntervalMs = Number(json.time_config?.tick_interval_ms ?? 0) || undefined;
        createdAtMs = Number(json.state?.created_at_ms ?? 0) || undefined;
    } catch {
        // fall through to defaults
    }

    const cfg = resolveWorldClockConfig(process.env, tickIntervalMs);
    if (cfg.mode === 'mirror') {
        const nowMs = Date.now();
        const m = storyNow(nowMs, cfg.mirror);
        return {
            currentTick,
            daysPerTickBp,
            // 六拍語義保留：一日六時辰，tickOfDay 即 bucket index。
            ticksPerDay: PARTS_OF_DAY.length,
            day: storyDayIndex(nowMs, createdAtMs ?? nowMs, cfg.mirror),
            partOfDay: m.partOfDay,
            tickOfDay: m.partIndex,
            mode: 'mirror',
            date: m.date,
            dateLabel: formatStoryDate(m.date),
        };
    }

    return {
        currentTick,
        daysPerTickBp,
        ticksPerDay: deriveTicksPerDay(daysPerTickBp),
        day: tickDerivedDay(currentTick, daysPerTickBp),
        partOfDay: tickPartOfDay(currentTick, daysPerTickBp),
        tickOfDay: deriveTickOfDay(currentTick, daysPerTickBp),
        mode: 'tick',
    };
}
