/**
 * scene-routing: addressed stickiness, fatigue-driven handover (the 金鳳
 * monopoly fix), and two-person unaffectedness.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTING, pickNextActor, type NextActorCandidate } from './scene-routing.ts';

const c = (characterId: string, tension: number, beatsTaken = 0, isAddressed = false): NextActorCandidate => ({
    characterId, tension, beatsTaken, isAddressed,
});

test('fresh scene: addressed wins over slightly hotter bystander', () => {
    assert.equal(pickNextActor([c('liu', 0.8, 0, true), c('su', 0.9, 0, false)]), 'liu');
});

test('monopoly breaks: worn duelist loses to hot bystander', () => {
    // 金鳳 scenario — the addressed duelist has taken 4 beats, the bystander none:
    // duelist 0.84 − 4×0.12 + 0.15 = 0.51 < bystander 0.72.
    const duelist = c('liu', 0.84, 4, true);
    const bystander = c('su', 0.72, 0, false);
    assert.equal(pickNextActor([duelist, bystander]), 'su');
    // ...but at 1 beat taken the duel legitimately continues (0.87 > 0.72).
    assert.equal(pickNextActor([c('liu', 0.84, 1, true), bystander]), 'liu');
});

test('two-person scene: the only candidate always wins regardless of fatigue', () => {
    assert.equal(pickNextActor([c('liu', 0.3, 9, true)]), 'liu');
});

test('no live wants (tension −1) loses to anyone with a want', () => {
    assert.equal(pickNextActor([c('idle', -1, 0, true), c('busy', 0.2, 3, false)]), 'busy');
});

test('exact tie goes to the addressed candidate', () => {
    assert.equal(pickNextActor([c('a', 0.5, 0, false), c('b', 0.5 - ROUTING.addressedBonus, 0, true)]), 'b');
});

test('empty candidate list returns null', () => {
    assert.equal(pickNextActor([]), null);
});
