// PERCEIVE core — pure assembly + scoping. `node --test --experimental-strip-types`.
//
// Doubles as the Step 1 WIRING proof: a character whose world changed last tick now
// receives a briefing that SAYS so — the cure for「意圖失明 / 計畫停滯」(PLAN ran blind).
// And it pins the scoping: the objective stage is shared by co-present souls (事件客觀)
// but never leaks off-scene secrets (no omniscience).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSituations, type PerceiveInput } from './perceive-core.ts';

// 花旦 burns for 唱片/頭牌, ignores 武戲; 武旦 the reverse. (matches §8c roleResourceAmbition shape.)
const ambitionFor = (role: string, kind: string): number => {
    if (role.includes('花旦')) return kind === 'recording' || kind === 'spotlight' ? 0.9 : kind === 'martial' ? 0 : 0.2;
    if (role.includes('武旦') || role.includes('刀馬')) return kind === 'martial' ? 0.9 : 0;
    return 0.3;
};

const STAGE = '0xstage';
const BACK = '0xback';
const roster = [
    { id: '映雪', name: '蘇映雪', role: '花旦', sceneId: STAGE, sceneName: '雲錦台' },
    { id: '聞鶴', name: '江聞鶴', role: '老生', sceneId: STAGE, sceneName: '雲錦台' },
    { id: '連翹', name: '連翹', role: '刀馬旦', sceneId: BACK, sceneName: '後台' },
];

const baseInput = (over: Partial<PerceiveInput> = {}): PerceiveInput => ({
    targets: [{ id: '映雪', name: '蘇映雪', role: '花旦', standingGoal: '保住頭牌' }],
    roster,
    resources: [],
    ambitionFor,
    ...over,
});

test('co-present is scene-scoped: 映雪 sees 聞鶴 (same stage), not 連翹 (backstage)', () => {
    const [r] = buildSituations(baseInput());
    assert.deepEqual(r.situation.place.coPresent.map((c) => c.id), ['聞鶴']);
});

test('WIRING PROOF: a resolution 映雪 took part in last tick reaches her briefing (PLAN no longer blind)', () => {
    const [r] = buildSituations(
        baseInput({
            resolvedLastTick: [
                { eventId: '0xE1', label: '唱片之爭', winner: '江聞鶴', stake: 'recording', participants: ['映雪', '聞鶴'] },
            ],
        }),
    );
    assert.equal(r.situation.news.resolvedSinceLastSeen.length, 1);
    assert.match(r.briefing, /唱片之爭已有分曉，江聞鶴拔得頭籌/);
});

test('a resolution 映雪 was NOT part of does not reach her (no omniscience)', () => {
    const [r] = buildSituations(
        baseInput({
            resolvedLastTick: [
                { eventId: '0xSECRET', label: '後台密戰', winner: '連翹', stake: 'martial', participants: ['連翹'] },
            ],
        }),
    );
    assert.equal(r.situation.news.resolvedSinceLastSeen.length, 0);
    assert.doesNotMatch(r.briefing, /密戰/);
});

test('private off-scene holder is hidden; co-present holder is shown', () => {
    const [r] = buildSituations(
        baseInput({
            resources: [
                { resourceId: 'r-deed', label: 'deed:把柄地契', heldBy: ['連翹'] }, // 連翹 backstage → hidden
                { resourceId: 'r-patron', label: 'patronage:堂會包銀', heldBy: ['聞鶴'] }, // 聞鶴 on stage → shown
            ],
        }),
    );
    const deed = r.situation.stakes.contested.find((c) => c.resourceId === 'r-deed');
    const patron = r.situation.stakes.contested.find((c) => c.resourceId === 'r-patron');
    assert.deepEqual(deed?.heldBy, [], 'off-scene private holder 連翹 must not be revealed');
    assert.deepEqual(patron?.heldBy, ['聞鶴'], 'co-present holder is revealed');
});

test('public-kind resource reveals its holder even off-scene (頭牌/唱片 are public titles)', () => {
    const [r] = buildSituations(
        baseInput({
            resources: [{ resourceId: 'r-spot', label: 'spotlight:壓軸', heldBy: ['連翹'] }], // 連翹 backstage but public title
        }),
    );
    const spot = r.situation.stakes.contested.find((c) => c.resourceId === 'r-spot');
    assert.deepEqual(spot?.heldBy, ['連翹'], 'public stage-title holder is common knowledge');
});

test('OBJECTIVE STAGE is shared by co-present souls (事件客觀): 映雪 & 聞鶴 see the same coPresent + stakes', () => {
    const input = baseInput({
        targets: [
            { id: '映雪', name: '蘇映雪', role: '花旦', standingGoal: '保住頭牌' },
            { id: '聞鶴', name: '江聞鶴', role: '老生', standingGoal: '取而代之' },
        ],
        resources: [{ resourceId: 'r-spot', label: 'spotlight:壓軸', heldBy: [] }],
    });
    const [a, b] = buildSituations(input);
    // Same objective stage (both on 雲錦台, same contested spotlight). Their DIVERGENCE
    // comes later from memory+persona at the LLM layer, never from the Situation.
    assert.deepEqual(
        a.situation.stakes.contested.map((c) => c.resourceId),
        b.situation.stakes.contested.map((c) => c.resourceId),
    );
    assert.equal(a.situation.place.sceneId, b.situation.place.sceneId);
    // …but each sees the OTHER as co-present (self excluded), so the stage isn't identical text.
    assert.deepEqual(a.situation.place.coPresent.map((c) => c.id), ['聞鶴']);
    assert.deepEqual(b.situation.place.coPresent.map((c) => c.id), ['映雪']);
});

test('ache is 行當-shaped: 花旦 burns for 唱片, a 武旦 would not', () => {
    const [hua] = buildSituations(
        baseInput({ resources: [{ resourceId: 'r-rec', label: 'recording:首本唱片', heldBy: [] }] }),
    );
    assert.ok((hua.situation.stakes.contested[0]?.myAche ?? 0) >= 0.9, '花旦 aches for 唱片');
    const [wu] = buildSituations(
        baseInput({
            targets: [{ id: '連翹', name: '連翹', role: '刀馬旦', standingGoal: '搶下武戲台口' }],
            // a PRIVATE-kind resource she has no ache for and no co-present holder → filtered.
            resources: [{ resourceId: 'r-pair', label: 'partnership:小生', heldBy: [] }],
        }),
    );
    assert.equal(wu.situation.stakes.contested.length, 0, '武旦 does not contest a 搭檔 she has no ache for');
});

test('arrivals/departures Δ from prevCoPresent', () => {
    const [r] = buildSituations(
        baseInput({
            prevCoPresentByChar: { 映雪: [{ id: '柳', name: '柳生春', role: '武生' }] }, // 柳 was here, now gone; 聞鶴 new
        }),
    );
    assert.deepEqual(r.situation.news.arrivals, ['江聞鶴']);
    assert.deepEqual(r.situation.news.departures, ['柳生春']);
});
