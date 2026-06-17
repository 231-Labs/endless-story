/**
 * Storyteller chapter — pure-core tests (node --test, native strip-types).
 *
 * These prove the two guarantees the live saga needed, deterministically and
 * decoupled from chain/LLM: the gate NEVER waits on a resolve (anti-stuck) and
 * NEVER re-tells the same standoff (anti-repeat), while treating multi-event +
 * daily observations + card intents as material.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    arcKeyOf,
    groupIntoArcs,
    distinctVoices,
    advanceWatermark,
    emptyWatermark,
    type MaterialItem,
    type ArcWatermark,
} from '../src/services/storyteller-chapter/material.ts';
import {
    decideChapterReadiness,
    DEFAULT_THRESHOLDS,
    type ReadinessThresholds,
} from '../src/services/storyteller-chapter/gate.ts';
import {
    toChapterCompilerPayload,
    briefSummary,
} from '../src/services/storyteller-chapter/compose.ts';

// ── builders ────────────────────────────────────────────────────────────────
let seq = 0;
function pov(over: Partial<MaterialItem> = {}): MaterialItem {
    return {
        id: over.id ?? `pov-${seq++}`,
        kind: 'pov',
        day: 1,
        sceneId: 'scene-A',
        characterId: 'c1',
        characterName: '某人',
        contentionKind: 'spotlight',
        text: '一段視角散文。',
        ...over,
    };
}
function item(kind: MaterialItem['kind'], over: Partial<MaterialItem> = {}): MaterialItem {
    return pov({ kind, id: over.id ?? `${kind}-${seq++}`, ...over });
}

// ── arc grouping (multi-event + observations into one axis) ──────────────────
test('arc key groups by dramatic axis, scene as fallback', () => {
    assert.equal(arcKeyOf(pov({ contentionKind: 'spotlight' })), 'axis:spotlight');
    assert.equal(arcKeyOf(pov({ contentionKind: undefined, sceneId: 'scene-Z' })), 'scene:scene-Z');
});

test('material from DIFFERENT events + observations collapses into one arc', () => {
    const items = [
        pov({ eventId: '0xEV1', day: 1, characterId: 'c1' }),
        item('observation', { eventId: '0xEV2', day: 2, characterId: 'c2', text: '她看見班主上樓。' }),
        item('card_intent', { eventId: '0xEV2', day: 2, characterId: 'c3', text: '我要搶這個臺口。' }),
    ];
    const arcs = groupIntoArcs(items);
    assert.equal(arcs.size, 1, 'all spotlight material → one arc, spanning 2 events + an observation');
    assert.equal(arcs.get('axis:spotlight')!.length, 3);
    assert.equal(distinctVoices(items), 3);
});

// ── anti-repeat ──────────────────────────────────────────────────────────────
test('re-stating the SAME atoms → wait (no re-telling)', () => {
    const items = [pov({ id: 'a', characterId: 'c1' }), pov({ id: 'b', characterId: 'c2' })];
    // already told both atoms
    const wm: ArcWatermark = { toldIds: ['a', 'b'], lastToldDay: 1, lastSummary: '前情。' };
    const d = decideChapterReadiness(items, wm, /*day*/ 1);
    assert.equal(d.mode, 'wait');
    assert.equal(d.slice.length, 0);
});

test('same cast restating with NEW ids but no movement, day not yet stale → wait', () => {
    // told: c1,c2 on day1. new: c1,c2 again on day2 (no fresh char/scene/resolve).
    const told = [pov({ id: 't1', day: 1, characterId: 'c1' }), pov({ id: 't2', day: 1, characterId: 'c2' })];
    const fresh = [pov({ id: 'n1', day: 2, characterId: 'c1' }), pov({ id: 'n2', day: 2, characterId: 'c2' })];
    const items = [...told, ...fresh];
    const wm: ArcWatermark = { toldIds: ['t1', 't2'], lastToldDay: 1 };
    const d = decideChapterReadiness(items, wm, /*day*/ 2); // silentDays = 1 < maxSilentDays(3)
    assert.equal(d.mode, 'wait', d.reason);
    assert.equal(d.progressBeats, 0, 'no fresh char / scene / resolve = no movement');
});

// ── progressed (the good case) ───────────────────────────────────────────────
test('new voices + movement (fresh char + resolve) → progressed', () => {
    const told = [pov({ id: 't1', day: 1, characterId: 'c1' })];
    const fresh = [
        pov({ id: 'n1', day: 2, characterId: 'c2', text: '新角色的視角。' }), // fresh char
        item('event_resolve', { id: 'r1', day: 2, characterId: undefined, text: '臺口定了。' }), // settled
    ];
    const wm: ArcWatermark = { toldIds: ['t1'], lastToldDay: 1 };
    const d = decideChapterReadiness([...told, ...fresh], wm, 2);
    assert.equal(d.mode, 'progressed', d.reason);
    assert.ok(d.newVoices >= 1 && d.progressBeats >= 2);
    // the resolve atom is non-substantive → not in the woven slice, but the new POV is
    assert.ok(d.slice.some((s) => s.id === 'n1'));
    assert.ok(!d.slice.some((s) => s.id === 'r1'));
});

// ── anti-stuck: resolve-independence + starvation ────────────────────────────
test('ANTI-STUCK: never resolves, silent past floor → overview anyway', () => {
    // An event that opened day 1 and just accumulates POVs, never resolving.
    const items = [
        item('event_open', { id: 'o1', day: 1, characterId: undefined }),
        pov({ id: 'p1', day: 1, characterId: 'c1' }),
        pov({ id: 'p2', day: 2, characterId: 'c1' }), // same single voice, no movement
    ];
    const wm = emptyWatermark(); // never told
    const d = decideChapterReadiness(items, wm, /*day*/ 4); // silence from day1 = 3 >= maxSilentDays
    assert.equal(d.mode, 'overview', d.reason);
    assert.ok(d.silentDays >= DEFAULT_THRESHOLDS.maxSilentDays);
    assert.ok(d.slice.length >= 1, 'writes from whatever the cast knows');
});

test('ANTI-STUCK: no resolve atom anywhere still produces chapters', () => {
    const items = [
        pov({ id: 'p1', day: 1, characterId: 'c1' }),
        pov({ id: 'p2', day: 1, characterId: 'c2' }),
        item('observation', { id: 'ob1', day: 1, characterId: 'c3', sceneId: 'scene-B', text: '另一處的觀察。' }),
    ];
    const d = decideChapterReadiness(items, emptyWatermark(), 1);
    // 3 voices + fresh chars + fresh scene ⇒ progressed, with zero event_resolve present
    assert.equal(d.mode, 'progressed', d.reason);
    assert.ok(!items.some((i) => i.kind === 'event_resolve'));
});

test('ANTI-STARVATION by volume: a long standoff with no movement → overview, not endless wait', () => {
    // told: c1,c2 already chaptered on day 1. New: the SAME two voices keep
    // restating the SAME standoff (no fresh char/scene, no resolve) but it piles
    // up — 6 atoms on day 2. Day floor not yet hit (silentDays 1), progress 0,
    // so only the volume rule saves it from waiting forever.
    const told = [pov({ id: 't1', day: 1, characterId: 'c1' }), pov({ id: 't2', day: 1, characterId: 'c2' })];
    const fresh = Array.from({ length: 6 }, (_, i) =>
        pov({ id: `v${i}`, day: 2, characterId: i % 2 === 0 ? 'c1' : 'c2' }),
    );
    const wm: ArcWatermark = { toldIds: ['t1', 't2'], lastToldDay: 1 };
    const d = decideChapterReadiness([...told, ...fresh], wm, 2);
    assert.equal(d.mode, 'overview', d.reason);
    assert.equal(d.progressBeats, 0, 'no movement — pure restatement');
});

// ── watermark prevents re-consumption across chapters ────────────────────────
test('advanceWatermark stops told atoms re-firing next round', () => {
    const round1 = [pov({ id: 'a', characterId: 'c1' }), pov({ id: 'b', characterId: 'c2' })];
    const d1 = decideChapterReadiness(round1, emptyWatermark(), 1);
    assert.notEqual(d1.mode, 'wait');
    const wm2 = advanceWatermark(emptyWatermark(), d1.slice, 1, '第一回摘要。');
    assert.deepEqual(new Set(wm2.toldIds), new Set(['a', 'b']));
    assert.equal(wm2.lastSummary, '第一回摘要。');

    // next round: same two atoms, nothing new → wait (no repeat)
    const d2 = decideChapterReadiness(round1, wm2, 2);
    assert.equal(d2.mode, 'wait');
});

// ── thresholds are tunable (config-driven, no code change) ────────────────────
test('thresholds override changes the floor', () => {
    const strict: ReadinessThresholds = { ...DEFAULT_THRESHOLDS, maxSilentDays: 10 };
    const items = [pov({ id: 'p1', day: 1, characterId: 'c1' }), pov({ id: 'p2', day: 2, characterId: 'c1' })];
    // default would overview at day 4; strict floor (10) keeps waiting
    assert.equal(decideChapterReadiness(items, emptyWatermark(), 4, strict).mode, 'wait');
});

// ── slice → compiler payload mapping ─────────────────────────────────────────
test('payload maps POVs/observations/intents and picks latest scene to anchor', () => {
    const items = [
        pov({ id: 'p1', day: 1, characterId: 'c1', characterName: '蘇映雪', sceneId: 'scene-A', sceneName: '妝閣' }),
        pov({ id: 'p2', day: 2, characterId: 'c2', characterName: '柳生春', sceneId: 'scene-B', sceneName: '書寓', eventId: '0xEV2', label: '誰壓軸' }),
        item('observation', { id: 'ob', day: 2, characterId: 'c3', characterName: '連翹', sceneId: 'scene-B', text: '她看見班主上樓。' }),
        item('card_intent', { id: 'ci', day: 2, characterId: 'c2', characterName: '柳生春', sceneId: 'scene-B', text: '我得搶在江聞鶴前站位。' }),
    ];
    const d = decideChapterReadiness(items, emptyWatermark(), 2);
    assert.notEqual(d.mode, 'wait');
    const payload = toChapterCompilerPayload(d, { toldIds: [], lastSummary: '前一回。' })!;
    assert.ok(payload);
    assert.equal(payload.povs.length, 2);
    assert.equal(payload.observations.length, 1);
    assert.equal(payload.intents.length, 1);
    assert.equal(payload.intents[0].name, '柳生春');
    assert.equal(payload.sceneId, 'scene-B', 'anchors on the latest POV scene');
    assert.equal(payload.eventLabel, '誰壓軸');
    assert.equal(payload.prevChapterSummary, '前一回。');
    assert.equal(payload.minVoices, d.mode === 'overview' ? 1 : 2);
});

test('wait decision → no payload (stream simply waits, never an empty chapter)', () => {
    const d = decideChapterReadiness([pov({ id: 'x' })], { toldIds: ['x'] }, 1);
    assert.equal(d.mode, 'wait');
    assert.equal(toChapterCompilerPayload(d, { toldIds: ['x'] }), null);
});

test('briefSummary strips heading and compacts first paragraph', () => {
    const s = briefSummary('## 第十六回　坤生勻粉\n\n二樓書寓的窗格將霞飛路的霓虹切成細長條子。\n\n第二段。');
    assert.ok(!s.includes('#'));
    assert.ok(s.startsWith('二樓書寓'));
    assert.ok(!s.includes('第二段'));
});
