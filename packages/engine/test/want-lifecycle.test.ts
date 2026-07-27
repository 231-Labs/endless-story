/**
 * 願望生命週期 — the exit lanes a write-only want board was missing.
 *
 * The diagnosed number: 58 live wants, 4 resolved, over 13 ticks. Wants had one
 * way in and effectively no way out, so the resolved rate — the story's heartbeat
 * — flatlined and the 願榜 became a landfill. These tests pin both new exits and,
 * just as importantly, pin that a want with NEITHER a completion test nor a
 * deadline is left alone (a world that authors no lifecycle behaves exactly as it
 * did before).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { completionHolds, forecloseDueWants, resolvedRate, runWantLifecycle, settleCompletedWants } from '../src/core/want-lifecycle.ts';
import { newWant, type Want } from '../src/core/want-core.ts';
import { WorldState } from '../src/world-state.ts';

const YUAN = 100n;

function seasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    world.data.economy!.bills = [];
    world.data.wants = [];
    return world;
}

function plant(world: WorldState, characterId: string, over: Partial<Want> = {}): Want {
    const want = newWant({
        id: world.nextWantId(),
        characterId,
        layer: '事務',
        desc: '一樁擱著的事',
        weight: 0.6,
        sat: 0.2,
        resistance: 4,
        kind: 'narrative',
        source: 'aftermath',
        bornTick: 0,
    });
    Object.assign(want, over);
    world.data.wants.push(want);
    return want;
}

// ── lane 1: completion ───────────────────────────────────────────────────────

test('bill-cleared: a want pinned to a debt resolves the moment the debt is paid — no model call', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    world.data.economy!.bills = [{ id: 'tab', label: '賒帳', amountSubunits: '600', paidSubunits: '0', dueDay: 9 }];
    const want = plant(world, liu, { desc: '把趙阿福那筆帳還了', completion: { kind: 'bill-cleared', billId: 'tab' } });

    assert.equal(completionHolds(world, want), false);
    assert.deepEqual(settleCompletedWants(world, 5).resolved, [], 'an unpaid debt resolves nothing');

    world.data.economy!.bills![0].paidSubunits = '600';
    const report = settleCompletedWants(world, 6);

    assert.deepEqual(report.resolved.map((w) => w.id), [want.id]);
    assert.equal(want.retired, true);
    assert.equal(want.resolutionCause, 'resolved', 'it counts toward the heartbeat, not against it');
    assert.equal(want.resolvedTick, 6);
    assert.equal(report.notices[0].characterId, liu, 'and its owner is told');
});

test('purse-atleast: a saving want resolves when the purse actually reaches the figure', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const state = world.data.economy!.state;
    const setPurse = (yuan: bigint): void => {
        state.injected = (BigInt(state.injected) + yuan * YUAN - BigInt(state.accounts[liu]!.available)).toString();
        state.accounts[liu]!.available = (yuan * YUAN).toString();
    };
    setPurse(5n);
    const want = plant(world, liu, { desc: '攢夠十圓', completion: { kind: 'purse-atleast', yuan: 10 } });

    assert.equal(completionHolds(world, want), false);
    setPurse(10n);
    assert.equal(completionHolds(world, want), true);
    assert.equal(settleCompletedWants(world, 3).resolved.length, 1);
});

test('flowers-caught: an envy want resolves when the tally is level again', () => {
    const world = seasonWorld();
    const lian = world.idByName('連翹')!;
    const su = world.idByName('蘇映雪')!;
    world.data.patronage = { gifts: [], flowersByChar: { [su]: 3, [lian]: 0 }, tipsByChar: {}, ticketsSubunits: '0', seq: 0 };
    const want = plant(world, lian, { layer: '妒', desc: '這口氣要爭回來', completion: { kind: 'flowers-caught', rivalId: su } });

    assert.equal(completionHolds(world, want), false);
    world.data.patronage.flowersByChar[lian] = 3;
    assert.equal(completionHolds(world, want), true);
});

test('an unknown subject never resolves and never crashes — it simply waits for its 死線', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const want = plant(world, liu, { completion: { kind: 'bill-cleared', billId: 'no-such-bill' }, dueDay: 2 });

    assert.equal(completionHolds(world, want), false);
    assert.deepEqual(settleCompletedWants(world, 1).resolved, []);
    assert.equal(forecloseDueWants(world, 3, 18).foreclosed.length, 1, 'the deadline is the backstop');
});

// ── lane 2: deadline ─────────────────────────────────────────────────────────

test('a want past its 死線 forecloses, with ONE line to its owner', () => {
    const world = seasonWorld();
    const fang = world.idByName('方競西')!;
    const want = plant(world, fang, { desc: '這條發不發', dueDay: 3 });

    assert.deepEqual(forecloseDueWants(world, 3, 17).foreclosed, [], 'the due day itself is still in play');
    const report = forecloseDueWants(world, 4, 23);

    assert.deepEqual(report.foreclosed.map((w) => w.id), [want.id]);
    assert.equal(want.resolutionCause, 'foreclosed');
    assert.equal(report.notices.length, 1, 'exactly one percept — the owner learns it once');
    assert.match(report.notices[0].text, /擱下/);
});

test('a want with neither a completion test nor a 死線 is untouched (backward compatible)', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const want = plant(world, liu, { desc: '一輩子的志向' });

    const report = runWantLifecycle(world, 99, 500);

    assert.deepEqual(report.resolved, []);
    assert.deepEqual(report.foreclosed, []);
    assert.equal(want.retired, undefined, 'the old world is exactly as it was');
});

test('completion wins over the deadline on the same day — a want that JUST landed is not a foreclosure', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    world.data.economy!.bills = [{ id: 'tab', label: '賒帳', amountSubunits: '600', paidSubunits: '600', dueDay: 9 }];
    const want = plant(world, liu, { completion: { kind: 'bill-cleared', billId: 'tab' }, dueDay: 1 });

    const report = runWantLifecycle(world, 5, 30);

    assert.deepEqual(report.resolved.map((w) => w.id), [want.id]);
    assert.deepEqual(report.foreclosed, [], 'it is not counted as both');
    assert.equal(want.resolutionCause, 'resolved');
});

// ── the heartbeat ────────────────────────────────────────────────────────────

test('resolvedRate separates real answers from giving up — the number the diagnosis needed', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    plant(world, liu, { retired: true, resolutionCause: 'resolved' });
    plant(world, liu, { retired: true, resolutionCause: 'resolved' });
    plant(world, liu, { retired: true, resolutionCause: 'faded' });
    plant(world, liu, { retired: true, resolutionCause: 'foreclosed' });
    plant(world, liu); // live

    const beat = resolvedRate(world.data.wants);

    assert.equal(beat.resolved, 2);
    assert.equal(beat.retired, 4);
    assert.equal(beat.live, 1);
    assert.equal(beat.rate, 0.5);
});

test('resolvedRate reads LEGACY runs too — a retired want with no cause is judged by its note', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    // Pre-lifecycle runs never stamped `resolutionCause`; the two "gave up" notes
    // are the only signal available, and everything else was a real resolution.
    plant(world, liu, { retired: true, resolvedNote: '（日子久了，淡了）' });
    plant(world, liu, { retired: true, resolvedNote: '（一時好奇，過去了）' });
    plant(world, liu, { retired: true, resolvedNote: '她終於把話說出口了' });

    const beat = resolvedRate(world.data.wants);
    assert.equal(beat.resolved, 1);
    assert.equal(beat.retired, 3);
});
