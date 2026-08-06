/**
 * Chain-side fetcher for the World module.
 *
 * Right now we only need the time projection — derive UI `SagaWorldTime`
 * from the World object. Other World fields (locations, rules, currency
 * display) are reached through location-read / specific helpers, so don't
 * pollute this file with them until a consumer actually needs them.
 */

import type { DayPart, SagaWorldTime } from '@endless-story/shared';
import {
    resolveWorldClockConfig,
    storyDayIndex,
    storyNow,
    tickDerivedDay,
    tickOfDay,
    ticksPerDay,
    toDayPart,
} from '@endless-story/shared/world-clock';
import { makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';
import { cachedPublicRead, publicChainReadTtl } from './read-cache.js';
import { isSuiObjectId } from './ids.js';

interface ChainWorldJson {
    state?: {
        current_tick?: number | string;
        created_at_ms?: number | string;
    };
    time_config?: {
        days_per_tick_bp?: number | string;
        tick_interval_ms?: number | string;
    };
}

/**
 * Project the chain World → narrative time. Returns null when chain
 * unreachable, world not deployed, or (tick mode) the rhythm is unreadable —
 * in which case UI defaults, typically `partOfDay: 'noon'`, apply.
 *
 * **哪個時鐘說了算**（docs/narrative/WORLD_TIME_MIRROR.md）：
 *   - tick 模式：敘事時間是說書人的陳述（「世界推到黃昏了」），不是真實
 *     時間的函數。此時從 `created_at_ms` 擬造推進就是說謊——沒人搬演，
 *     世界就誠實地停著。
 *   - mirror 模式：權威反轉。牆鐘本身就是故事時刻（真實時刻 UTC+8 減一百
 *     年），tick 只是「有人在演」的心跳。世界真的活在真實時間裡，所以從
 *     真實毫秒投影不但不是說謊，而是唯一誠實的讀法；runner 停機一週，
 *     世界就靜靜活過了無事的一週。
 *
 * **Two-layer time TODO**: this is currently the ONLY time source the
 * UI consumes (lanterns, daypart wash, "Day N" badge). A future
 * refactor may split:
 *   - World tick      → narrative years for aging / death mechanics
 *   - Saga partOfDay  → storyteller-pushed lighting state (separate
 *                       chain field on Saga or runner-emitted blob)
 * See the saga page handscroll comments.
 */
export async function fetchOnChainWorldTime(worldId: string): Promise<SagaWorldTime | null> {
    if (!isSuiObjectId(worldId)) return null;
    return cachedPublicRead(
        `world-time:${resolveNetwork()}:${worldId}`,
        publicChainReadTtl(10_000),
        () => fetchOnChainWorldTimeFresh(worldId),
    );
}

async function fetchOnChainWorldTimeFresh(worldId: string): Promise<SagaWorldTime | null> {
    const client = makeSuiClient({ network: resolveNetwork() });
    let res;
    try {
        res = await read.world.getWorld(client, worldId);
    } catch (err) {
        console.warn('[world-read] fetchOnChainWorldTime failed:', err);
        return null;
    }
    const json = res.json as unknown as ChainWorldJson | undefined;
    if (!json) return null;
    const tick = Number(json.state?.current_tick ?? 0);
    const bp = Number(json.time_config?.days_per_tick_bp ?? 0);
    const tickIntervalMs = Number(json.time_config?.tick_interval_ms ?? 0) || undefined;
    const cfg = resolveWorldClockConfig(process.env, tickIntervalMs);

    if (cfg.mode === 'mirror') {
        const nowMs = Date.now();
        const m = storyNow(nowMs, cfg.mirror);
        const createdAtMs = Number(json.state?.created_at_ms ?? 0) || nowMs;
        return {
            day: storyDayIndex(nowMs, createdAtMs, cfg.mirror),
            partOfDay: toDayPart(m.partOfDay),
            // 真實民用時刻直推的地支加刻，不再從 tick 比例擬造。
            label: m.shichen,
            date: m.date,
        };
    }

    if (!Number.isFinite(tick) || !Number.isFinite(bp) || bp <= 0) return null;

    // Canonical 整數節律（shared/world-clock）：與 cockpit 的 Day N 同源。
    // 舊 `floor(tick·bp/10000)+1` 在 1670 bp 下每約 60 拍提早跨日，兩面分岔。
    const perDay = ticksPerDay(bp);
    const day = tickDerivedDay(tick, bp);
    const frac = tickOfDay(tick, bp) / perDay;
    const partOfDay = bucketPartOfDay(frac);

    return {
        day,
        partOfDay,
        label: timeLabel(partOfDay, frac),
    };
}

function bucketPartOfDay(frac: number): DayPart {
    if (frac < 0.25) return 'morning';
    if (frac < 0.5) return 'noon';
    if (frac < 0.75) return 'dusk';
    return 'night';
}

/** tick 模式的擬造時刻標籤——沒有真牆鐘可讀時的權宜刻度。 */
function timeLabel(partOfDay: DayPart, frac: number): string {
    const subPhase = Math.floor((frac % 0.25) * 4 * 4);
    const marks = ['初刻', '一刻', '二刻', '三刻'];
    switch (partOfDay) {
        case 'morning':
            return `卯時${marks[subPhase] ?? ''}`;
        case 'noon':
            return `午時${marks[subPhase] ?? ''}`;
        case 'dusk':
            return `戌時${marks[subPhase] ?? ''}`;
        case 'night':
            return `子時${marks[subPhase] ?? ''}`;
    }
}
