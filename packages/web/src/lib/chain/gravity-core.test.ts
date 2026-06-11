// Gravity core — mechanism-level proof (deterministic, no randomness). Shows the
// rule is a *transient* attractor: while a contest is active a full cluster is a
// fixed point (nobody leaves) and scattered contenders converge to ONE scene;
// once the desire settles the pull vanishes. Runs under `node --test`.
//
//   pnpm --filter @endless-story/web test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attractorScene, gravityTarget, type ActiveDesire } from './gravity-core.ts';

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
