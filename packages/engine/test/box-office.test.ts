/**
 * Box-office unit test — the settlement is DETERMINISTIC (SEASON_ONE_SLICE §4:
 * the number never comes from an LLM). Fixed inputs → an expected number computed
 * here by hand, plus the same-seed-same-number guarantee.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    computeBoxOffice,
    computePlayQuality,
    DEFAULT_BOX_OFFICE_WEIGHTS,
    type BoxOfficeAudienceMember,
    type BoxOfficePlay,
} from '../src/core/box-office.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// Fixed inputs (hand-computed below against DEFAULT weights:
//   w1=0.4 w2=0.2 w3=0.4  ticket=10 repeatBonus=5 theta=0.6 qualityScale=10).
const PLAY: BoxOfficePlay = {
    contributions: [
        { characterId: 'a', ability: 0.8, rehearsalEffort: 6 }, // 4.8
        { characterId: 'b', ability: 0.6, rehearsalEffort: 4 }, // 2.4
        { characterId: 'c', ability: 0.5, rehearsalEffort: 2 }, // 1.0
    ],
};
// qualityRaw = 4.8 + 2.4 + 1.0 = 8.2 ; scaled = 8.2 / 10 = 0.82
const REPUTE = 0.5;
const AUDIENCE: BoxOfficeAudienceMember[] = [
    { id: 'bai', name: '白韻秋', warmth: 0.9 }, // w=0.4*0.9+0.2*0.5+0.4*0.82 = 0.788 → buy+repeat → 15
    { id: 's1', name: '散客甲', warmth: 0.5 }, //  0.4*0.5+0.1+0.328      = 0.628 → buy+repeat → 15
    { id: 's2', name: '散客乙', warmth: 0.2 }, //  0.08+0.1+0.328         = 0.508 → buy        → 10
    { id: 's3', name: '散客丙', warmth: 0.0 }, //  0+0.1+0.328            = 0.428 → buy        → 10
];
// total = 15 + 15 + 10 + 10 = 50 ; tickets = 4 ; repeats = 2

test('quality = Σ ability·effort, scaled into 0..1', () => {
    const q = computePlayQuality(PLAY);
    near(q.raw, 8.2);
    near(q.scaled, 0.82);
});

test('box office is deterministic and matches the hand computation', () => {
    const r = computeBoxOffice(AUDIENCE, PLAY, REPUTE);
    near(r.quality, 0.82);
    near(r.qualityRaw, 8.2);
    near(r.repute, 0.5);
    assert.equal(r.total, 50, 'box office total');
    assert.equal(r.tickets, 4, 'four willing buyers');
    assert.equal(r.repeats, 2, 'two delighted repeat buyers');

    // Per-audience willingness (hand-computed).
    const byName = new Map(r.perAudience.map((a) => [a.name, a]));
    near(byName.get('白韻秋')!.willingness, 0.788);
    near(byName.get('散客甲')!.willingness, 0.628);
    near(byName.get('散客乙')!.willingness, 0.508);
    near(byName.get('散客丙')!.willingness, 0.428);
    assert.equal(byName.get('白韻秋')!.repeat, true);
    assert.equal(byName.get('散客乙')!.repeat, false);
    assert.equal(byName.get('散客丙')!.bought, true);
});

test('same inputs → identical result (reproducible)', () => {
    const a = computeBoxOffice(AUDIENCE, PLAY, REPUTE);
    const b = computeBoxOffice(AUDIENCE, PLAY, REPUTE);
    assert.deepEqual(a, b);
});

test('weights are honoured (a zero-quality, zero-warmth play still sells on repute only)', () => {
    const dead: BoxOfficePlay = { contributions: [] };
    const cold: BoxOfficeAudienceMember[] = [{ id: 'x', name: '路人', warmth: 0 }];
    const r = computeBoxOffice(cold, dead, 0.5, DEFAULT_BOX_OFFICE_WEIGHTS);
    // willingness = 0 + 0.2*0.5 + 0 = 0.1 > 0 → buys one ticket, no repeat.
    near(r.perAudience[0].willingness, 0.1);
    assert.equal(r.total, 10);
    assert.equal(r.repeats, 0);
});
