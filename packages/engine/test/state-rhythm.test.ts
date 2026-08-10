/**
 * 作息節律 (state-rhythm) — the state vector advances by STORY TIME, not by
 * heartbeats. Pins the mirror-time diagnosis from the 2026-08-10 lab scroll:
 * eight afternoon heartbeats drove the whole cast to 乏 1.00 because every
 * heartbeat charged a full 時辰 and no real night ever arrived to recover.
 *
 * The contract, per case below:
 *   · tick mode is untouched — one tick = one 時辰 = one step, old rates;
 *   · a second heartbeat inside the same 時辰 charges NOTHING;
 *   · 時辰 that passed un-rendered settle once each — nights recover, so an
 *     overnight gap wakes a rested cast;
 *   · the catch-up walk is capped (a week offline ≠ a week of arithmetic);
 *   · 小憩 — a rendered day 時辰 spent idle at home RECOVERS fatigue.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    STATE_RHYTHM,
    advanceDailyState,
    bucketOrdinalOf,
    elapsedBucketSteps,
    partOfBucket,
} from '../src/core/state-rhythm.ts';

const PER_DAY = 6;
/** The canonical night verdict for a 6-拍 day: 入夜(4)/深宵(5). */
const night6 = (bucketOfDay: number): boolean => bucketOfDay >= 4;

const vec = (fatigue: number, hunger: number) => ({ fatigue, hunger, mood: 0 });

test('tick mode is one step per tick — acted/idle/night rates unchanged', () => {
    // day 1 bucket 1 → day 1 bucket 2: exactly one rendered day step.
    const steps = elapsedBucketSteps(1, 2, PER_DAY, night6);
    assert.equal(steps.length, 1);
    assert.deepEqual(steps[0], { bucketOfDay: 2, night: false, rendered: true });

    const acted = advanceDailyState(vec(0.3, 0.2), steps, { acted: true, atHome: false });
    assert.ok(Math.abs(acted.fatigue - 0.42) < 1e-9, 'acting a day 時辰 costs 0.12');
    assert.ok(Math.abs(acted.hunger - 0.32) < 1e-9, 'hunger climbs 0.12 per 時辰');

    const idle = advanceDailyState(vec(0.3, 0.2), steps, { acted: false, atHome: false });
    assert.ok(Math.abs(idle.fatigue - 0.35) < 1e-9, 'idling away from home drifts +0.05');

    const nightStep = elapsedBucketSteps(3, 4, PER_DAY, night6);
    assert.equal(nightStep[0].night, true);
    const slept = advanceDailyState(vec(0.9, 0.2), nightStep, { acted: true, atHome: false });
    assert.ok(Math.abs(slept.fatigue - 0.5) < 1e-9, 'a night 時辰 recovers 0.4 even for an actor');
});

test('a second heartbeat inside the same 時辰 charges nothing (mirror lab stepping)', () => {
    const steps = elapsedBucketSteps(2, 2, PER_DAY, night6);
    assert.equal(steps.length, 0, 'same bucket ⇒ no steps');
    const same = advanceDailyState(vec(0.42, 0.32), steps, { acted: true, atHome: false });
    assert.deepEqual(same, vec(0.42, 0.32), 'empty walk is the identity');
    // A wall clock stepped backwards is also a no-op, never a refund.
    assert.equal(elapsedBucketSteps(4, 2, PER_DAY, night6).length, 0);
});

test('an un-rendered night settles on the next heartbeat — the cast wakes rested', () => {
    // Last settled at 黃昏 (bucket 3, day d); next heartbeat at 清晨 (bucket 0, d+1):
    // crossed 入夜(4)、深宵(5)、清晨(0) — two nights recover, morning resets hunger.
    const prev = bucketOrdinalOf({ day: 2, tickOfDay: 3, ticksPerDay: PER_DAY });
    const now = bucketOrdinalOf({ day: 3, tickOfDay: 0, ticksPerDay: PER_DAY });
    const steps = elapsedBucketSteps(prev, now, PER_DAY, night6);
    assert.deepEqual(steps.map((s) => s.bucketOfDay), [4, 5, 0]);
    assert.deepEqual(steps.map((s) => s.night), [true, true, false]);
    assert.deepEqual(steps.map((s) => s.rendered), [false, false, true]);

    const woke = advanceDailyState(vec(1, 0.8), steps, { acted: true, atHome: false });
    // 1.0 − 0.4 − 0.4, then the rendered 清晨 acts (+0.12): a worked morning, not a spent one.
    assert.ok(Math.abs(woke.fatigue - 0.32) < 1e-9, 'two crossed nights recover 0.8');
    assert.equal(woke.hunger, STATE_RHYTHM.morningHunger, '清晨 resets hunger — the implicit breakfast');
});

test('the catch-up walk is capped at maxCatchupDays', () => {
    const steps = elapsedBucketSteps(0, 100, PER_DAY, night6);
    assert.equal(steps.length, PER_DAY * STATE_RHYTHM.maxCatchupDays, 'a long stoppage settles only the recent window');
    assert.equal(steps.filter((s) => s.rendered).length, 1, 'only the current bucket is rendered');
    const back = advanceDailyState(vec(1, 1), steps, { acted: false, atHome: false });
    assert.ok(back.fatigue < 0.2, 'a week offline returns a rested cast, not an exhausted one');
});

test('小憩 — a rendered day 時辰 spent idle at home recovers fatigue', () => {
    const steps = elapsedBucketSteps(1, 2, PER_DAY, night6);
    const napped = advanceDailyState(vec(0.8, 0.2), steps, { acted: false, atHome: true });
    assert.ok(Math.abs(napped.fatigue - 0.65) < 1e-9, 'napping at home recovers 0.15');
    // Acting still costs, even at home — the nap is for a beat SAT OUT.
    const workedAtHome = advanceDailyState(vec(0.8, 0.2), steps, { acted: true, atHome: true });
    assert.ok(Math.abs(workedAtHome.fatigue - 0.92) < 1e-9);
});

test('a fresh world (no settled mark) behaves like the old per-tick advance', () => {
    const steps = elapsedBucketSteps(undefined, 2, PER_DAY, night6);
    assert.equal(steps.length, 1);
    assert.deepEqual(steps[0], { bucketOfDay: 2, night: false, rendered: true });
});

test('partOfBucket mirrors the clock spread (6-拍 day maps 1:1 onto the 時辰)', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((b) => partOfBucket(b, 6)), ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵']);
    // Coarse rhythms still land on sane labels (2 拍/日: morning + night halves).
    assert.equal(partOfBucket(0, 2), '清晨');
    assert.equal(partOfBucket(1, 2), '黃昏');
});
