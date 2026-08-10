/**
 * 作息節律 (state rhythm) — the daily-life state vector's advancement, keyed to
 * STORY TIME (時辰 buckets), never to heartbeats. Pure math, no I/O.
 *
 * Diagnosed failure (改曆之後): under mirror time a tick is only 演繹的心跳 —
 * many heartbeats can land inside one 時辰 (lab stepping, catch-up beats), and
 * whole 時辰 can pass with no heartbeat at all (停機、夜裡無人搬演). The old
 * per-tick advance charged a FULL 時辰 of fatigue/hunger on every heartbeat and
 * recovered only on heartbeats that happened to run at real night — so a lab
 * afternoon of eight beats drove the whole cast to 乏 1.00 with zero recovery,
 * and the doc's promise 「同一時辰偶然多打一拍無害」 was false for the body.
 *
 * The law here restores 「故事時間永不暫停」 for the body:
 *   · a SECOND heartbeat inside the same 時辰 charges nothing — the fiction says
 *     that afternoon was busy, not that it was eight afternoons long;
 *   · 時辰 that passed UN-RENDERED are settled exactly once each on the next
 *     heartbeat — including nights, so a run resumed in the morning wakes a
 *     RESTED cast instead of the cast the world froze at 黃昏;
 *   · a rendered DAY 時辰 spent NOT acting while at one's own home is a 小憩 —
 *     fatigue RECOVERS. This is the mechanical answer to 「累了也不休息嗎」:
 *     the stakes brief names the option (回家歇一歇), the nap makes it real.
 *
 * In tick mode every tick IS one new 時辰, so the walk is always exactly one
 * step and the old per-tick behavior is preserved (the 小憩 arm excepted, which
 * is the deliberate new mechanic).
 */

import { PARTS_OF_DAY } from '../ports.ts';
import type { StateVector } from '../world-state.ts';

/** Per-時辰 rates. The day/night numbers are the SAME values the per-tick
 *  advance used (calibrated on 6-拍 tick-mode days); 小憩 sits between the idle
 *  drift and the night sleep — a nap restores, a night restores more. */
export const STATE_RHYTHM = {
    /** fatigue gained over a DAY 時辰 the character ACTED in. */
    actCost: 0.12,
    /** fatigue gained over a DAY 時辰 spent idle, away from home. */
    idleDrift: 0.05,
    /** fatigue recovered over a NIGHT 時辰 (入夜/深宵 — the sleep window). */
    nightRest: 0.4,
    /** 小憩 — fatigue recovered over a rendered DAY 時辰 spent NOT acting at
     *  one's own home. The daytime answer to 「累了也不休息嗎」. */
    homeNap: 0.15,
    /** hunger gained per 時辰 (day and night alike). */
    hungerPerBucket: 0.12,
    /** hunger after the implicit morning meal (the 清晨 bucket's reset). */
    morningHunger: 0.15,
    /** Longest stretch settled in one pass, in DAYS. Past this the walk keeps
     *  only the most recent window — after a week offline the cast wakes rested
     *  and morning-hungry either way, so walking 42 buckets buys nothing. */
    maxCatchupDays: 2,
} as const;

/** One 時辰 the walk settles. `rendered` marks the single bucket THIS heartbeat
 *  performs in — the only one where acting (and the 小憩 nap) can apply; the
 *  un-rendered rest passed quietly (idle rates, nights recover). */
export interface RhythmStep {
    /** 0-based bucket within its day. */
    bucketOfDay: number;
    night: boolean;
    rendered: boolean;
}

/** Absolute 時辰 ordinal of a clock reading — the walk's monotonic axis. Works
 *  in both time modes: tick mode advances it by exactly 1 per tick; mirror mode
 *  jumps 0 (same 時辰 re-rendered) or N (時辰 passed un-rendered). */
export function bucketOrdinalOf(clock: { day: number; tickOfDay: number; ticksPerDay: number }): number {
    return (clock.day - 1) * clock.ticksPerDay + clock.tickOfDay;
}

/** Part-of-day label for a bucket — the same spread `makeClock` uses, so a
 *  synthetic clock built from it agrees with the live one on coarse rhythms. */
export function partOfBucket(bucketOfDay: number, perDay: number): (typeof PARTS_OF_DAY)[number] {
    const idx = Math.floor((bucketOfDay / Math.max(1, perDay)) * PARTS_OF_DAY.length);
    return PARTS_OF_DAY[Math.min(PARTS_OF_DAY.length - 1, idx)];
}

/**
 * The 時辰 that elapsed since the state vector last settled, oldest first.
 *
 *   · `prevOrdinal` undefined (fresh world, or a snapshot predating the field)
 *     ⇒ exactly the current bucket, rendered — the old per-tick behavior;
 *   · caught up (`ordinal ≤ prevOrdinal` — a second heartbeat inside the same
 *     時辰, or a wall clock stepped backwards) ⇒ no steps, charge nothing;
 *   · otherwise every crossed bucket once each, capped to the most recent
 *     `maxCatchupDays` worth; only the LAST step is `rendered`.
 *
 * Night-ness is delegated to the caller's predicate so the ClockPort stays the
 * single authority on what counts as night.
 */
export function elapsedBucketSteps(
    prevOrdinal: number | undefined,
    ordinal: number,
    perDay: number,
    isNightBucket: (bucketOfDay: number) => boolean,
): RhythmStep[] {
    const span = prevOrdinal === undefined ? 1 : ordinal - prevOrdinal;
    if (span <= 0) return [];
    const walk = Math.min(span, Math.max(1, perDay) * STATE_RHYTHM.maxCatchupDays);
    const steps: RhythmStep[] = [];
    for (let k = ordinal - walk + 1; k <= ordinal; k++) {
        const bucketOfDay = ((k % perDay) + perDay) % perDay;
        steps.push({ bucketOfDay, night: isNightBucket(bucketOfDay), rendered: k === ordinal });
    }
    return steps;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Settle one character's state vector through the elapsed 時辰. Returns a new
 * vector (mood untouched); an empty walk is the identity.
 *
 * Per bucket: night sleeps (recovery beats whatever else the 時辰 held — the
 * old `night ? -0.4` arm, unchanged); a rendered day bucket charges the act
 * cost, or naps if the character stayed home without acting; un-rendered day
 * buckets drift idle. Hunger climbs every 時辰 and the 清晨 bucket resets it —
 * the implicit morning meal the per-tick advance always had.
 */
export function advanceDailyState(
    state: StateVector,
    steps: ReadonlyArray<RhythmStep>,
    opts: { acted: boolean; atHome: boolean },
): StateVector {
    let { fatigue, hunger } = state;
    for (const step of steps) {
        if (step.night) fatigue -= STATE_RHYTHM.nightRest;
        else if (step.rendered && opts.acted) fatigue += STATE_RHYTHM.actCost;
        else if (step.rendered && opts.atHome) fatigue -= STATE_RHYTHM.homeNap;
        else fatigue += STATE_RHYTHM.idleDrift;
        fatigue = clamp01(fatigue);
        hunger = step.bucketOfDay === 0 ? STATE_RHYTHM.morningHunger : clamp01(hunger + STATE_RHYTHM.hungerPerBucket);
    }
    return { ...state, fatigue, hunger };
}
