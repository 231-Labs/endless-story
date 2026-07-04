/**
 * Unit tests for state.ts. Run directly: <tsx> state.test.ts
 * (single-file node:test, per research §6).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    type CharacterState,
    NEUTRAL_STATE,
    clampState,
    evolveState,
    driftState,
    buildStateBlock,
    shouldSleep,
} from './state.js';

test('buildStateBlock: absent / neutral state injects nothing (regression-safe)', () => {
    assert.equal(buildStateBlock(undefined), '');
    // NEUTRAL_STATE sits below every notable band ⇒ '' ⇒ byte-identical prompt.
    assert.equal(buildStateBlock(NEUTRAL_STATE), '');
});

test('buildStateBlock: hunger / fatigue / mood cross their bands', () => {
    assert.match(buildStateBlock({ hunger: 0.85, fatigue: 0.2, mood: 0 }), /餓得前胸貼後背/);
    assert.match(buildStateBlock({ hunger: 0.2, fatigue: 0.85, mood: 0 }), /累得骨頭都快散/);
    assert.match(buildStateBlock({ hunger: 0.2, fatigue: 0.2, mood: -0.7 }), /堵得發慌/);
    assert.match(buildStateBlock({ hunger: 0.2, fatigue: 0.2, mood: 0.8 }), /舒暢/);
    // Just-ate (very low hunger) is itself notable.
    assert.match(buildStateBlock({ hunger: 0.05, fatigue: 0.2, mood: 0 }), /剛吃過/);
});

test('buildStateBlock: note renders as 緣由, and frames as background not event', () => {
    const block = buildStateBlock({ hunger: 0.2, fatigue: 0.85, mood: -0.7, note: '班主冷臉' });
    assert.match(block, /緣由：班主冷臉/);
    assert.match(block, /不要當成事件來寫/);
});

test('buildStateBlock: a note alone (no notable scalars) still emits', () => {
    const block = buildStateBlock({ hunger: 0.2, fatigue: 0.2, mood: 0, note: '收到家書' });
    assert.notEqual(block, '');
    assert.match(block, /收到家書/);
});

test('evolveState: additive deltas, clamped to range', () => {
    const fed = evolveState({ hunger: 0.8, fatigue: 0.5, mood: 0 }, { hunger: -0.7 });
    assert.ok(Math.abs(fed.hunger - 0.1) < 1e-9, `hunger ${fed.hunger}`);
    assert.equal(evolveState({ hunger: 0.9, fatigue: 0, mood: 0 }, { hunger: 0.5 }).hunger, 1);
    assert.equal(evolveState({ hunger: 0.1, fatigue: 0, mood: 0 }, { hunger: -0.5 }).hunger, 0);
    assert.equal(evolveState({ hunger: 0, fatigue: 0, mood: 0.8 }, { mood: 0.6 }).mood, 1);
    assert.equal(evolveState({ hunger: 0, fatigue: 0, mood: -0.8 }, { mood: -0.6 }).mood, -1);
});

test('evolveState: note replaces when given, persists when omitted', () => {
    const base: CharacterState = { hunger: 0.3, fatigue: 0.3, mood: 0, note: '舊事' };
    assert.equal(evolveState(base, { mood: 0.1 }).note, '舊事'); // omitted => kept
    assert.equal(evolveState(base, { note: '新事' }).note, '新事'); // given => replaced
    assert.equal(evolveState(base, { note: '' }).note, undefined); // '' => cleared
});

test('driftState: hunger creeps up, fatigue eases down (a quiet tick is rest), mood eases to calm', () => {
    const after = driftState({ hunger: 0.2, fatigue: 0.6, mood: 0.8, note: '餘味' });
    assert.ok(after.hunger > 0.2, 'hunger rises');
    assert.ok(after.fatigue < 0.6, 'fatigue recovers — work tires, rest restores');
    assert.ok(Math.abs(after.mood) < 0.8, 'mood decays toward 0');
    assert.equal(after.note, '餘味', 'note carried through drift');
});

test('clampState: out-of-range values pulled back into bounds', () => {
    const c = clampState({ hunger: 1.5, fatigue: -0.3, mood: -2, note: '  x  ' });
    assert.equal(c.hunger, 1);
    assert.equal(c.fatigue, 0);
    assert.equal(c.mood, -1);
    assert.equal(c.note, 'x');
});

test('shouldSleep: fatigue gates, night lowers the bar, memory floor blocks', () => {
    // memory floor: nothing to consolidate ⇒ never sleep, even exhausted at night
    assert.equal(shouldSleep({ fatigue: 1, isNight: true, scatteredCount: 1 }), false);
    // night bar (0.5): tired enough at night sleeps; the SAME fatigue by day does not
    assert.equal(shouldSleep({ fatigue: 0.6, isNight: true, scatteredCount: 3 }), true);
    assert.equal(shouldSleep({ fatigue: 0.6, isNight: false, scatteredCount: 3 }), false);
    // day bar (0.85): only real exhaustion forces a daytime nap
    assert.equal(shouldSleep({ fatigue: 0.9, isNight: false, scatteredCount: 3 }), true);
    // not tired ⇒ no sleep even at night with a modest backlog
    assert.equal(shouldSleep({ fatigue: 0.3, isNight: true, scatteredCount: 5 }), false);
    // memory-pressure override: a big backlog forces consolidation even un-tired by day
    assert.equal(shouldSleep({ fatigue: 0.1, isNight: false, scatteredCount: 6 }), true);
});
