/**
 * Chain-side fetcher for the World module.
 *
 * Right now we only need the time projection — derive UI `SagaWorldTime`
 * from `World.state.current_tick` + `World.time_config.days_per_tick_bp`.
 * Other World fields (locations, rules, currency display) are reached
 * through location-read / specific helpers, so don't pollute this file
 * with them until a consumer actually needs them.
 */

import type { DayPart, SagaWorldTime } from '@endless-story/shared';
import { makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';
import { cachedPublicRead, publicChainReadTtl } from './read-cache.js';
import { isSuiObjectId } from './ids.js';

interface ChainWorldJson {
    state?: {
        current_tick?: number | string;
    };
    time_config?: {
        days_per_tick_bp?: number | string;
    };
}

/**
 * Project chain world tick → narrative time. Returns null when chain
 * unreachable, world not deployed, or runner hasn't ticked yet (in
 * which case UI defaults — typically `partOfDay: 'noon'` — apply).
 *
 * **Why tick-based, not real-clock-based:** narrative time is a
 * storyteller statement ("the world has moved to dusk"), not a function
 * of real-world elapsed time. Faking progression from `created_at_ms`
 * would lie about what's actually happening in the saga. When runner
 * (or storyteller via admin tools) advances ticks, time moves; when
 * nothing moves, the world is honestly paused.
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
    if (!Number.isFinite(tick) || !Number.isFinite(bp) || bp <= 0) return null;

    const totalDays = (tick * bp) / 10000;
    const day = Math.floor(totalDays) + 1;
    const frac = totalDays - Math.floor(totalDays);
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
