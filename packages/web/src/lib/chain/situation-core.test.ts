// Situation core — the PERCEIVE step's pure assembler. `node --test`.
//   node --test --experimental-strip-types src/lib/chain/situation-core.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    assembleSituation,
    assertPerceivable,
    renderSituationBriefing,
    type SituationParts,
    type CoPresent,
} from './situation-core.ts';

const self = { id: '0xSELF', name: '沈雪笙', role: '青衣', standingGoal: '保住頭牌' };
const liu: CoPresent = { id: '0xLIU', name: '柳生春', role: '武生' };
const jiang: CoPresent = { id: '0xJIANG', name: '江聞鶴', role: '老生' };
const su: CoPresent = { id: '0xSU', name: '蘇映雪', role: '花旦' };

const base = (over: Partial<SituationParts> = {}): SituationParts => ({
    self,
    sceneId: '0xS1',
    sceneName: '雲錦台',
    occupants: [{ id: self.id, name: self.name, role: self.role }, liu, jiang],
    contested: [],
    ...over,
});

test('co-present excludes self', () => {
    const s = assembleSituation(base());
    assert.deepEqual(
        s.place.coPresent.map((c) => c.id),
        ['0xLIU', '0xJIANG'],
    );
});

test('arrivals + departures are the set delta vs the previous snapshot', () => {
    const s = assembleSituation(
        base({
            occupants: [{ id: self.id, name: self.name, role: self.role }, liu, su],
            prevCoPresent: [liu, jiang], // jiang left, su arrived; liu stayed
        }),
    );
    assert.deepEqual(s.news.arrivals, ['蘇映雪']);
    assert.deepEqual(s.news.departures, ['江聞鶴']);
});

test('no previous snapshot → no arrivals/departures noise', () => {
    const s = assembleSituation(base());
    assert.deepEqual(s.news.arrivals, []);
    assert.deepEqual(s.news.departures, []);
});

test('contested stakes sort strongest-ache-first, tie-break by label', () => {
    const s = assembleSituation(
        base({
            contested: [
                { resourceId: '0xR1', label: 'recording:首本唱片', heldBy: [], myAche: 0.2 },
                { resourceId: '0xR2', label: 'patronage:堂會包銀', heldBy: ['0xJIANG'], myAche: 0.9 },
                { resourceId: '0xR3', label: 'spotlight:壓軸', heldBy: [], myAche: 0.9 },
            ],
        }),
    );
    assert.deepEqual(
        s.stakes.contested.map((c) => c.resourceId),
        ['0xR2', '0xR3', '0xR1'], // 0.9 patronage before 0.9 spotlight (label tiebreak), then 0.2
    );
});

test('director beat + resolved news are carried as first-class facts', () => {
    const s = assembleSituation(
        base({
            resolvedSinceLastSeen: [
                { eventId: '0xE1', label: '唱片之爭', winner: '江聞鶴', stake: 'recording' },
            ],
            directorBeat: { text: '百代公司逼宮，限三分鐘交出母盤', phase: 'act_2' },
        }),
    );
    assert.equal(s.news.resolvedSinceLastSeen[0].winner, '江聞鶴');
    assert.equal(s.news.directorBeat?.phase, 'act_2');
});

test('briefing is objective stage only — no recalled memory, but carries goal/stakes/beat', () => {
    const s = assembleSituation(
        base({
            contested: [{ resourceId: '0xR2', label: 'patronage:堂會包銀', heldBy: ['0xJIANG'], myAche: 0.9 }],
            openEvent: { eventId: '0xE9', label: '堂會包銀之爭', cast: ['0xSELF', '0xJIANG'] },
            directorBeat: { text: '百代逼宮' },
        }),
    );
    const text = renderSituationBriefing(s);
    assert.match(text, /雲錦台/);
    assert.match(text, /柳生春|江聞鶴/);
    assert.match(text, /保住頭牌/); // standing goal surfaced as explicit field
    assert.match(text, /堂會包銀/); // stake
    assert.match(text, /正在上演/); // open event
    assert.match(text, /百代逼宮/); // director beat reaches perception
});

test('alone in a scene reads cleanly', () => {
    const s = assembleSituation(
        base({ occupants: [{ id: self.id, name: self.name, role: self.role }] }),
    );
    assert.equal(s.place.coPresent.length, 0);
    assert.match(renderSituationBriefing(s), /只有你一人/);
});

// ── omniscience guard (客觀 ≠ 全域) ──────────────────────────────────────────────

test('assertPerceivable: a co-present holder is fine', () => {
    // jiang is in occupants → co-present → knowing he holds the slot is legitimate.
    const s = assembleSituation(
        base({ contested: [{ resourceId: '0xR2', label: 'patronage:堂會包銀', heldBy: ['0xJIANG'], myAche: 0.9 }] }),
    );
    assert.doesNotThrow(() => assertPerceivable(s));
});

test('assertPerceivable: an OFF-SCENE secret holder throws (the 暗持把柄 leak)', () => {
    // 0xSU (蘇映雪) is NOT in this scene; the character must not know she holds it.
    const s = assembleSituation(
        base({ contested: [{ resourceId: '0xR2', label: 'deed:地契', heldBy: ['0xSU'], myAche: 0.9 }] }),
    );
    assert.throws(() => assertPerceivable(s), /全知洩漏.*0xSU/);
});

test('assertPerceivable: an off-scene holder of a PUBLIC resource is allowed', () => {
    const s = assembleSituation(
        base({ contested: [{ resourceId: '0xR9', label: 'spotlight:壓軸名分', heldBy: ['0xSU'], myAche: 0 }] }),
    );
    assert.doesNotThrow(() => assertPerceivable(s, { publicResourceIds: new Set(['0xR9']) }));
});

test('assertPerceivable: an openEvent the character is neither cast in nor in-scene throws', () => {
    const s = assembleSituation(
        base({ openEvent: { eventId: '0xELSE', label: '別場的戲', cast: ['0xLIU'] } }),
    );
    assert.throws(() => assertPerceivable(s, { castEventIds: new Set(), sceneEventIds: new Set() }), /openEvent 0xELSE/);
    // …but allowed once it's staged in the character's scene
    assert.doesNotThrow(() => assertPerceivable(s, { sceneEventIds: new Set(['0xELSE']) }));
});

test('assertPerceivable: a resolved event neither witnessed nor public throws', () => {
    const s = assembleSituation(
        base({ resolvedSinceLastSeen: [{ eventId: '0xSECRET', label: '別場密戰', winner: '蘇映雪', stake: 'deed' }] }),
    );
    assert.throws(() => assertPerceivable(s), /已結算事件 0xSECRET/);
    assert.doesNotThrow(() => assertPerceivable(s, { publicResolvedIds: new Set(['0xSECRET']) }));
    assert.doesNotThrow(() => assertPerceivable(s, { castEventIds: new Set(['0xSECRET']) }));
});
