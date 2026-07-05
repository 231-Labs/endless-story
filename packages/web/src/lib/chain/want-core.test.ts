/**
 * want-core unit test — the §2.36–2.43 engine properties as assertions:
 * salience picks by fatigue-adjusted tension, forcing is a resistance gate
 * (not a timer, not a class), resolution cools siblings, ripples mutate
 * rather than restate, decay pulls toward baseline.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/chain/want-core.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    WANT,
    applyBeat,
    applyDreamStirToWants,
    applyRipples,
    decayWants,
    fadeStaleWants,
    forcingLevel,
    newWant,
    pickSalient,
    tension,
    type Want,
} from './want-core.ts';

const mk = (characterId: string, desc: string, weight: number, sat: number, resistance = 6): Want =>
    newWant({ characterId, layer: 'test', desc, weight, sat, resistance, kind: 'narrative', source: 'genesis', bornTick: 0 });

test('salience: highest tension wins; fatigue rotates the winner', () => {
    const wants = [mk('bai', '留在身邊', 0.9, 0.2), mk('zheng', '守住戲份', 0.8, 0.25)];
    assert.equal(pickSalient(wants, {})!.characterId, 'bai');
    const tired = pickSalient(wants, { bai: 1 })!;
    assert.equal(tired.characterId, 'zheng', 'a spent 0.72 floor loses to a rested 0.6 (§2.51)');
});

test('forcing is a resistance gate, not a timer: quiet wants never reach edge', () => {
    const w = mk('liu', '暗戀', 0.9, 0.3, 6);
    for (let i = 0; i < 20; i++) decayWants([w]);
    assert.equal(forcingLevel(w), 'idle', '20 quiet ticks do not force (§2.31 semantics)');
    w.heat = 4;
    w.frust = 1;
    assert.equal(forcingLevel(w), 'pressing');
    w.frust = 2;
    assert.equal(forcingLevel(w), 'edge', 'pressure ≥ resistance opens the gate');
});

test('resistance ladder: low breaks early, high holds (§2.42 continuous gate)', () => {
    const low = mk('a', '收料子', 0.7, 0.2, 2);
    const high = mk('a', '暗戀', 0.9, 0.2, 8);
    low.heat = high.heat = 2;
    assert.equal(forcingLevel(low), 'edge');
    assert.equal(forcingLevel(high), 'idle');
});

test('resolution retires the want and cools same-character standing siblings', () => {
    const all = [mk('liu', '去留', 0.9, 0.3, 3), mk('liu', '暗戀', 0.9, 0.3, 8), mk('su', '默契', 0.9, 0.3, 8)];
    applyBeat(all[0], all, { gain: '大', resolved: true, resolvedNote: '留下' }, 5);
    assert.equal(all[0].retired, true);
    assert.equal(all[0].resolvedTick, 5);
    assert.ok(all[1].sat > 0.3, 'sibling standing want cooled (+sat)');
    assert.equal(all[2].sat, 0.3, 'other characters untouched');
});

test('acting gains sat by reported 進展; saturation bump after a hot streak', () => {
    const w = mk('liu', '演對手戲', 0.9, 0.2);
    const all = [w];
    applyBeat(w, all, { gain: '中', resolved: false }, 1);
    assert.ok(Math.abs(w.sat - (0.2 + WANT.gain.中)) < 1e-9);
    applyBeat(w, all, { gain: '小', resolved: false }, 2);
    applyBeat(w, all, { gain: '小', resolved: false }, 3);
    assert.ok(w.sat > 0.2 + WANT.gain.中 + 2 * WANT.gain.小, 'third recent act adds the saturation bump');
});

test('decay pulls sat back toward baseline, never past it', () => {
    const w = mk('liu', '演對手戲', 0.9, 0.2);
    w.sat = 0.8;
    decayWants([w]);
    assert.ok(Math.abs(w.sat - (0.2 + 0.6 * 0.6)) < 1e-9);
    for (let i = 0; i < 30; i++) decayWants([w]);
    assert.ok(Math.abs(w.sat - 0.2) < 1e-3);
});

test('ripples: tighten hits the hottest want; newThread spawns once, no restatements', () => {
    const wants = [mk('su', '守住默契', 0.9, 0.3), mk('su', '撐門面', 0.5, 0.3)];
    const spawned = applyRipples(
        wants,
        [
            { characterId: 'su', shift: 'tighten', newThread: '那籠包子到底誰送的', layer: '疑心' },
            { characterId: 'su', shift: 'none', newThread: '守住默契' }, // restatement → dropped
        ],
        3,
    );
    assert.equal(wants[0].sat, 0.3 - WANT.tighten, 'hottest (守住默契) tightened');
    assert.equal(wants[1].sat, 0.3);
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0].source, 'ripple');
    assert.equal(wants.length, 3);
});

test('dream stir = one tighten on the dreamer hottest want (§2.51 dose)', () => {
    const wants = [mk('tian', '保住戲班', 0.78, 0.3), mk('tian', '平虧空', 0.45, 0.2)];
    const hit = applyDreamStirToWants(wants, 'tian');
    assert.equal(hit!.desc, '保住戲班');
    assert.ok(Math.abs(hit!.sat - (0.3 - WANT.tighten)) < 1e-9);
    assert.equal(applyDreamStirToWants(wants, 'nobody'), null);
});

test('spawn brake: a full heart takes no new thread (§2.55)', () => {
    const wants = Array.from({ length: WANT.maxLivePerCharacter }, (_, i) => mk('su', `心事${i}`, 0.7, 0.3));
    const spawned = applyRipples(wants, [{ characterId: 'su', shift: 'none', newThread: '全新的一縷' }], 3);
    assert.equal(spawned.length, 0);
    wants[0].retired = true; // one resolves → room again
    const again = applyRipples(wants, [{ characterId: 'su', shift: 'none', newThread: '全新的一縷' }], 4);
    assert.equal(again.length, 1);
});

test('fade lane: old cold picked-up threads retire; genesis and warm ones never (§2.55)', () => {
    const genesis = mk('liu', '要她要的是我', 0.9, 0.95); // cold but genesis → stays
    const picked = newWant({ characterId: 'liu', layer: '疑心', desc: '那籠包子誰送的', weight: 0.6, sat: 0.8, resistance: 3, kind: 'narrative', source: 'ripple', bornTick: 0 });
    const young = newWant({ characterId: 'liu', layer: '疑心', desc: '新冒出來的', weight: 0.6, sat: 0.8, resistance: 3, kind: 'narrative', source: 'ripple', bornTick: 9 });
    const hot = newWant({ characterId: 'liu', layer: '愛', desc: '還燙著的', weight: 0.9, sat: 0.1, resistance: 6, kind: 'narrative', source: 'aftermath', bornTick: 0 });
    assert.ok(tension(picked) < WANT.fadeTensionBelow);
    const faded = fadeStaleWants([genesis, picked, young, hot], 10);
    assert.deepEqual(faded.map((w) => w.desc), ['那籠包子誰送的']);
    assert.equal(picked.retired, true);
    assert.equal(picked.resolvedNote, '（日子久了，淡了）');
    assert.ok(!genesis.retired && !young.retired && !hot.retired);
});

test('economic wants never force (settlement lane owns them)', () => {
    const w = newWant({ characterId: 'a', layer: '頭牌', desc: '掛頭牌', weight: 1, sat: 0, resistance: 1, kind: 'economic', source: 'genesis', bornTick: 0 });
    w.heat = 99;
    assert.equal(forcingLevel(w), 'idle');
    assert.equal(tension(w), 1);
});
