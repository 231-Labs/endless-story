// Event-spine core — pure lifecycle + settlement planning. `node --test`.
//   pnpm --filter @endless-story/web test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    decideSpineStep,
    decideSpineSteps,
    buildAxisCandidates,
    resourceForContention,
    chooseSettlementWinner,
    planResourceTransfer,
    type SpineOpenEvent,
    type SpineDecisionInput,
    type AllocationView,
    type AxisCandidate,
} from './spine-core.ts';

const baseOpen: SpineOpenEvent = {
    eventId: '0xEV',
    sceneId: '0xS',
    templateId: 'contention:recording',
    label: 'L',
    participantIds: ['a', 'b'],
    openedAtTick: 10,
};
const input = (over: Partial<SpineDecisionInput>): SpineDecisionInput => ({
    open: null,
    nowTick: 0,
    minTicks: 2,
    maxTicks: 4,
    contention: { templateId: 'contention:recording', label: '唱片之爭' },
    occupancy: [],
    minCast: 2,
    ...over,
});

/* ── lifecycle ───────────────────────────────────────────────────────────── */

test('opens on the busiest quorum scene; cast = its occupants', () => {
    const step = decideSpineStep(
        input({
            occupancy: [
                { characterId: 'a', sceneId: 's1' },
                { characterId: 'b', sceneId: 's2' },
                { characterId: 'c', sceneId: 's2' },
                { characterId: 'd', sceneId: 's2' },
            ],
        }),
    );
    assert.equal(step.action, 'open');
    if (step.action !== 'open') return;
    assert.equal(step.sceneId, 's2');
    assert.deepEqual(step.participantIds.sort(), ['b', 'c', 'd']);
    assert.equal(step.templateId, 'contention:recording');
});

test('idles when no scene meets quorum', () => {
    const step = decideSpineStep(input({ occupancy: [{ characterId: 'a', sceneId: 's1' }] }));
    assert.equal(step.action, 'idle');
});

test('idles when there is no contention to stage', () => {
    const step = decideSpineStep(input({ contention: null, occupancy: [
        { characterId: 'a', sceneId: 's1' }, { characterId: 'b', sceneId: 's1' },
    ] }));
    assert.equal(step.action, 'idle');
});

test('lingers an open event until it has aged minTicks', () => {
    const step = decideSpineStep(input({ open: baseOpen, nowTick: 11 })); // age 1 < min 2
    assert.equal(step.action, 'continue');
    if (step.action === 'continue') assert.equal(step.age, 1);
});

test('resolves (settled) once aged >= minTicks', () => {
    const step = decideSpineStep(input({ open: baseOpen, nowTick: 12 })); // age 2 == min
    assert.equal(step.action, 'resolve');
    if (step.action === 'resolve') assert.equal(step.reason, 'settled');
});

test('force-resolves (maxAge) at the cap even though it would settle anyway', () => {
    const step = decideSpineStep(input({ open: baseOpen, nowTick: 14 })); // age 4 == max
    assert.equal(step.action, 'resolve');
    if (step.action === 'resolve') assert.equal(step.reason, 'maxAge');
});

/* ── settlement ──────────────────────────────────────────────────────────── */

const recording: AllocationView = {
    resourceId: '0xR',
    label: 'recording:首張唱片灌錄權',
    capacity: 1n,
    allocations: { b: 1n },
};

test('resourceForContention matches by label keyword', () => {
    const r = resourceForContention([recording], 'contention:recording');
    assert.equal(r?.resourceId, '0xR');
    assert.equal(resourceForContention([recording], 'contention:spotlight'), null);
});

test('winner = highest-tension participant wanting THIS resource', () => {
    const w = chooseSettlementWinner(
        ['a', 'b'],
        [
            { characterId: 'a', statement: '爭得「recording:首張唱片灌錄權」', tension: 0.9 },
            { characterId: 'b', statement: '爭得「recording:首張唱片灌錄權」', tension: 0.3 },
            { characterId: 'c', statement: '爭得「recording:首張唱片灌錄權」', tension: 1.0 }, // not a participant
        ],
        'recording',
    );
    assert.equal(w, 'a');
});

test('no winner on a tie (do not move a contested slot arbitrarily)', () => {
    const w = chooseSettlementWinner(
        ['a', 'b'],
        [
            { characterId: 'a', statement: 'recording', tension: 0.5 },
            { characterId: 'b', statement: 'recording', tension: 0.5 },
        ],
        'recording',
    );
    assert.equal(w, null);
});

test('no winner when nobody pushes for it', () => {
    assert.equal(chooseSettlementWinner(['a'], [{ characterId: 'a', statement: 'recording', tension: 0 }], 'recording'), null);
});

test('transfer draws from free capacity when the resource is not full', () => {
    const r: AllocationView = { ...recording, capacity: 2n, allocations: { b: 1n } };
    const plan = planResourceTransfer(r, 'a');
    assert.deepEqual(plan, { resourceId: '0xR', from: null, to: 'a', amount: 1n });
});

test('transfer reallocates from the largest other holder when full', () => {
    const r: AllocationView = { ...recording, capacity: 1n, allocations: { b: 1n } };
    const plan = planResourceTransfer(r, 'a');
    assert.deepEqual(plan, { resourceId: '0xR', from: 'b', to: 'a', amount: 1n });
});

test('no transfer when the winner already holds a full resource alone', () => {
    const r: AllocationView = { ...recording, capacity: 1n, allocations: { a: 1n } };
    assert.equal(planResourceTransfer(r, 'a'), null);
});

/* ── Stage 1: parallel events ────────────────────────────────────────────── */

const occ = (entries: Array<[string, string]>) => entries.map(([characterId, sceneId]) => ({ characterId, sceneId }));
const framingOf = (s?: string) =>
    (s ?? '').includes('recording')
        ? { templateId: 'contention:recording', label: '唱片之爭' }
        : (s ?? '').includes('搭戲')
          ? { templateId: 'contention:partnership', label: '搭戲之爭' }
          : { templateId: 'storylet:tension', label: '較量' };

test('buildAxisCandidates groups orthogonal axes, each staged where most desirers sit', () => {
    const rows = [
        { characterId: 'liu', statement: '爭得「recording:唱片」', tension: 0.6 },
        { characterId: 'bai', statement: '爭得「recording:唱片」', tension: 0.5 },
        { characterId: 'liu', statement: '與孟搭戲', tension: 0.4 },
        { characterId: 'meng', statement: '與孟搭戲', tension: 0.45 },
    ];
    const occupancy = occ([['liu', 'S1'], ['bai', 'S1'], ['meng', 'S1']]);
    const cands = buildAxisCandidates(rows, occupancy, framingOf);
    assert.equal(cands.length, 2);
    assert.equal(cands[0].templateId, 'contention:recording'); // priority 0.6 first
    assert.deepEqual(cands[0].participantIds.sort(), ['bai', 'liu']);
    const partner = cands.find((c) => c.templateId === 'contention:partnership')!;
    assert.deepEqual(partner.participantIds.sort(), ['liu', 'meng']);
});

test('buildAxisCandidates skips desirers who are nowhere / zero tension', () => {
    const rows = [
        { characterId: 'liu', statement: '爭得「recording:唱片」', tension: 0.6 },
        { characterId: 'ghost', statement: '爭得「recording:唱片」', tension: 0.6 }, // not co-located
        { characterId: 'bai', statement: '爭得「recording:唱片」', tension: 0 }, // no tension
    ];
    const cands = buildAxisCandidates(rows, occ([['liu', 'S1'], ['bai', 'S1']]), framingOf);
    assert.deepEqual(cands[0].participantIds, ['liu']);
});

const cand = (templateId: string, sceneId: string, participantIds: string[], priority: number): AxisCandidate => ({
    templateId,
    label: templateId,
    sceneId,
    participantIds,
    priority,
});

test('decideSpineSteps opens orthogonal axes concurrently up to the cap', () => {
    const steps = decideSpineSteps({
        openEvents: [],
        nowTick: 1,
        minTicks: 2,
        maxTicks: 4,
        maxConcurrent: 2,
        minCast: 2,
        candidates: [
            cand('contention:recording', 'S1', ['liu', 'bai'], 0.6),
            cand('contention:partnership', 'S1', ['liu', 'meng'], 0.45),
            cand('contention:spotlight', 'S2', ['a', 'b'], 0.3),
        ],
    });
    const opened = steps.filter((s) => s.action === 'open');
    assert.equal(opened.length, 2, 'capped at maxConcurrent');
    assert.deepEqual(opened.map((s) => (s.action === 'open' ? s.templateId : '')), [
        'contention:recording',
        'contention:partnership',
    ]);
});

test('decideSpineSteps lingers / resolves each open event independently by age', () => {
    const openEvents: SpineOpenEvent[] = [
        { ...baseOpen, eventId: '0xA', templateId: 'contention:recording', openedAtTick: 0 }, // age 3 → resolve
        { ...baseOpen, eventId: '0xB', templateId: 'contention:partnership', openedAtTick: 2 }, // age 1 → continue
    ];
    const steps = decideSpineSteps({
        openEvents,
        nowTick: 3,
        minTicks: 2,
        maxTicks: 4,
        maxConcurrent: 2,
        minCast: 2,
        candidates: [],
    });
    assert.deepEqual(
        steps.map((s) => s.action).sort(),
        ['continue', 'resolve'],
    );
});

test('decideSpineSteps will not open a second event on an already-open axis', () => {
    const steps = decideSpineSteps({
        openEvents: [{ ...baseOpen, eventId: '0xA', templateId: 'contention:recording', openedAtTick: 3 }], // age 0 → continue
        nowTick: 3,
        minTicks: 2,
        maxTicks: 4,
        maxConcurrent: 3,
        minCast: 2,
        candidates: [cand('contention:recording', 'S1', ['liu', 'bai'], 0.9)],
    });
    assert.equal(steps.filter((s) => s.action === 'open').length, 0);
});

test('decideSpineSteps frees a slot when an event resolves this tick', () => {
    const steps = decideSpineSteps({
        openEvents: [{ ...baseOpen, eventId: '0xA', templateId: 'contention:recording', openedAtTick: 0 }], // age 4 → resolve
        nowTick: 4,
        minTicks: 2,
        maxTicks: 4,
        maxConcurrent: 1,
        minCast: 2,
        candidates: [cand('contention:partnership', 'S1', ['liu', 'meng'], 0.5)],
    });
    assert.ok(steps.some((s) => s.action === 'resolve'));
    assert.ok(steps.some((s) => s.action === 'open'), 'resolving frees the single slot for a new axis');
});
