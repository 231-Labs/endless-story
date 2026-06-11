// Gravity core — mechanism-level proof (deterministic, no randomness). Shows the
// rule is a *transient* attractor: while a contest is active a full cluster is a
// fixed point (nobody leaves) and scattered contenders converge to ONE scene;
// once the desire settles the pull vanishes. Runs under `node --test`.
//
//   pnpm --filter @endless-story/web test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    attractorScene,
    gravityTarget,
    gravityTargetsForContenders,
    coolResource,
    tickResourceCooldowns,
    resourceOnCooldown,
    _resetResourceCooldowns,
    type ActiveDesire,
} from './gravity-core.ts';

test('attractorScene: plurality wins, ties break to the smallest sceneId, empty → null', () => {
    assert.equal(attractorScene(['s1', 's2', 's2']), 's2');
    assert.equal(attractorScene(['s2', 's1']), 's1'); // 1-1 tie → smallest
    assert.equal(attractorScene(['s3', 's3', 's1', 's1', 's2']), 's1'); // 2-2 tie → smallest
    assert.equal(attractorScene([]), null);
});

const desire = (resourceId: string, tension: number, scenes: string[]): ActiveDesire => ({
    resourceId,
    tension,
    contenderScenes: scenes,
});

test('COHESION: a full cluster is a fixed point — every contender stays', () => {
    // all three contenders already in s2, contest active.
    const scenes = ['s2', 's2', 's2'];
    for (const here of scenes) {
        const t = gravityTarget(here, [desire('spotlight', 0.8, scenes)], 0.25);
        assert.equal(t, 's2'); // target == current scene ⇒ no move
    }
});

test('CONVERGENCE: scattered contenders all compute the SAME target (the plurality)', () => {
    const scenes = ['s1', 's2', 's2']; // plurality s2
    const targets = scenes.map((here) => gravityTarget(here, [desire('spotlight', 0.6, scenes)], 0.25));
    assert.deepEqual(targets, ['s2', 's2', 's2']); // identical → they collapse onto s2 in one hop
});

test('NO OSCILLATION: a 1-1 split sends BOTH to the same tiebreak scene (they meet, not swap)', () => {
    const scenes = ['s0', 's1'];
    const targets = scenes.map((here) => gravityTarget(here, [desire('spotlight', 0.5, scenes)], 0.25));
    assert.deepEqual(targets, ['s0', 's0']); // both → s0; the s1 agent moves in, the s0 agent stays
    // next tick both are at s0 → still s0 (stable), never s0↔s1 chasing.
    const after = ['s0', 's0'].map((here) => gravityTarget(here, [desire('spotlight', 0.5, ['s0', 's0'])], 0.25));
    assert.deepEqual(after, ['s0', 's0']);
});

test('DISPERSAL: once the desire settles (below threshold / gone) the pull vanishes', () => {
    // tension below threshold → not a pull.
    assert.equal(gravityTarget('s3', [desire('spotlight', 0.1, ['s2', 's2'])], 0.25), null);
    // no active desires at all → null (caller falls back to idle motion).
    assert.equal(gravityTarget('s3', [], 0.25), null);
});

test('DOMINANT desire: an agent torn between two contests is pulled by the higher tension', () => {
    const t = gravityTarget(
        's0',
        [desire('spotlight', 0.4, ['s0', 's1']), desire('recording', 0.9, ['s2', 's2'])],
        0.25,
    );
    assert.equal(t, 's2'); // recording (0.9) dominates → its attractor
});

/* ── live binding: contenders → attractor, with holder + cooldown exclusion ── */

test('gravityTargetsForContenders: two rivals converge on their plurality scene', () => {
    _resetResourceCooldowns();
    const out = gravityTargetsForContenders({
        sceneByChar: new Map([['liu', 's1'], ['bai', 's2'], ['x', 's2']]),
        contendersByResource: new Map([['spotlight', ['liu', 'bai']]]),
        heldByChar: new Map(),
    });
    // contenders liu(s1)+bai(s2): plurality tie → smallest s1; both targeted there.
    assert.equal(out.get('liu'), 's1'); // already there → stay
    assert.equal(out.get('bai'), 's1'); // pulled across
    assert.equal(out.has('x'), false); // x doesn't contend spotlight
});

test('gravityTargetsForContenders: a holder is NOT pulled', () => {
    _resetResourceCooldowns();
    const out = gravityTargetsForContenders({
        sceneByChar: new Map([['liu', 's1'], ['bai', 's2']]),
        contendersByResource: new Map([['spotlight', ['liu', 'bai']]]),
        heldByChar: new Map([['liu', new Set(['spotlight'])]]), // liu holds it
    });
    assert.equal(out.has('liu'), false); // holder: no pull
    assert.equal(out.get('bai'), 's1'); // bai still wants it → drawn to liu's scene
});

test('a resource on cooldown exerts no pull (relief term #1)', () => {
    _resetResourceCooldowns();
    coolResource('spotlight', 2);
    assert.equal(resourceOnCooldown('spotlight'), true);
    const cooled = gravityTargetsForContenders({
        sceneByChar: new Map([['liu', 's1'], ['bai', 's2']]),
        contendersByResource: new Map([['spotlight', ['liu', 'bai']]]),
        heldByChar: new Map(),
    });
    assert.equal(cooled.size, 0, 'nobody pulled while the resource is settled/cooling');
    tickResourceCooldowns(); // 2 → 1
    assert.equal(resourceOnCooldown('spotlight'), true);
    tickResourceCooldowns(); // 1 → expired
    assert.equal(resourceOnCooldown('spotlight'), false);
    const back = gravityTargetsForContenders({
        sceneByChar: new Map([['liu', 's1'], ['bai', 's2']]),
        contendersByResource: new Map([['spotlight', ['liu', 'bai']]]),
        heldByChar: new Map(),
    });
    assert.equal(back.size, 2, 'pull returns after the cooldown'); // re-contest later
    _resetResourceCooldowns();
});

test('an agent torn between two contests is pulled by its dominant (first-listed, equal tension here)', () => {
    _resetResourceCooldowns();
    const out = gravityTargetsForContenders({
        sceneByChar: new Map([['liu', 's0'], ['bai', 's3'], ['meng', 's3']]),
        contendersByResource: new Map([
            ['spotlight', ['liu', 'bai']], // attractor s0 (tie→smallest)
            ['recording', ['liu', 'meng']], // attractor s3 (both? meng s3, liu s0 → tie s0)
        ]),
        heldByChar: new Map(),
    });
    // tension is binary (=1) for both → tiebreak by resourceId: 'recording' < 'spotlight'.
    // recording contenders liu(s0),meng(s3) → tie → s0. So liu stays s0.
    assert.equal(out.get('liu'), 's0');
});
