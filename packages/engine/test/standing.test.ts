/**
 * 處境 — 「打死不還」的代價，全部由既有機制承擔。
 *
 * The design claim under test: the engine did NOT get a new reputation system.
 * What the street thinks of somebody lives where every other social fact already
 * lives — the tonal `edges` graph, the numeric `bonds` graph, and public 名頭 —
 * and `core/standing.ts` only READS them. If any of these tests start needing a
 * stored field, the parallel ledger has grown back.
 *
 * The chain being pinned:
 *   關係轉冷 → 既有的門一扇一扇關上（夜訪 / 賒帳 / 名頭引座）→ 社會性死亡
 * and the way back out, which is not free but is real.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { applySeasonFrame, buildWorldState, loadPresetFile, loadSeasonFrameFile } from '../src/preset.ts';
import { BOND, bondOf, bondsToJSON, chillBond, seedBond, type BondGraph } from '../src/core/bond-graph.ts';
import {
    DEBT_GRIEVANCE_MARK,
    fadeHearsay,
    grievedAgainst,
    HEARSAY_MARK,
    NIGHT_DOOR_WARMTH,
    socialStandingOf,
    standingBoard,
    standingPerceptFor,
    tabTrust,
    TAB_TRUST_FLOOR,
} from '../src/core/standing.ts';
import { WorldState } from '../src/world-state.ts';

function seasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, loadSeasonFrameFile('spring-snow-market'));
    return world;
}

// ── 交惡 (the one primitive that was genuinely missing) ──────────────────────

test('chillBond is DIRECTED, unlike bumpBond — being stiffed cools only the stiffed', () => {
    const g: BondGraph = new Map();
    seedBond(g, 'a', 'b', 0.6);
    seedBond(g, 'b', 'a', 0.6);

    chillBond(g, 'a', 'b', 'shamed');

    assert.ok(bondOf(g, 'a', 'b') < 0.6, 'the wronged side cooled');
    assert.equal(bondOf(g, 'b', 'a'), 0.6, 'the other side is untouched — 單向 is a real shape');
});

test('a grievance erodes the PEAK, which is what makes an earned relationship losable', () => {
    const g: BondGraph = new Map();
    seedBond(g, 'a', 'b', 0.9); // a long, deep bond
    const peakBefore = g.get('a→b')!.peak;

    chillBond(g, 'a', 'b', 'betrayed');

    const after = g.get('a→b')!;
    assert.ok(after.peak < peakBefore, 'the high-water mark itself came down');
    // Time-based cooling can never pass floorOfPeak · peak; a grievance can,
    // because it moved the floor. Without this, nothing anybody DID could ever
    // cost them a relationship they had already earned.
    assert.ok(after.v < BOND.floorOfPeak * peakBefore || after.peak < peakBefore);
    assert.ok(after.v >= 0, 'but a bond never goes negative');
});

test('chilling saturates toward zero and stays there — no runaway', () => {
    const g: BondGraph = new Map();
    seedBond(g, 'a', 'b', 0.5);
    for (let i = 0; i < 200; i++) chillBond(g, 'a', 'b', 'betrayed');
    assert.ok(bondOf(g, 'a', 'b') >= 0);
    assert.ok(bondOf(g, 'a', 'b') < 0.01);
});

// ── the lens stores nothing ─────────────────────────────────────────────────

test('standing is DERIVED: writing an edge is the whole mechanism', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const zhao = world.idByName('趙阿福')!;
    assert.equal(standingPerceptFor(world, liu), undefined, 'a clean name derives nothing');
    assert.deepEqual(grievedAgainst(world, liu), []);

    // The ONLY write. No ledger, no mark, no knower list.
    world.setEdge(zhao, liu, `${DEBT_GRIEVANCE_MARK}到期不還，我心裡冷了`, 'cold');

    assert.deepEqual(grievedAgainst(world, liu), [zhao]);
    assert.match(standingPerceptFor(world, liu)!, /暫時只有一個人/);
    assert.match(standingPerceptFor(world, liu)!, /趙阿福/, 'and he can see WHO, so he can act on it');
});

test('賒帳 reads the vendor\'s own warmth — credit is trust, not a rule', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const zhao = world.idByName('趙阿福')!;
    assert.equal(tabTrust(world, liu, '前街食肆').face, zhao, 'the stall has a human face');
    assert.equal(tabTrust(world, liu, '前街食肆').allowed, true);

    world.setEdge(zhao, liu, `${DEBT_GRIEVANCE_MARK}不還，心冷了`, 'cold');

    const gate = tabTrust(world, liu, '前街食肆');
    assert.equal(gate.allowed, false);
    assert.ok(world.welcome(zhao, liu) < TAB_TRUST_FLOOR, 'through the SAME warmth function the night doors use');
    assert.match(gate.reason!, /趙阿福/, 'and the refusal names whose decision it was');
    // Nobody else's stall closed, because nobody else changed their mind.
    assert.equal(tabTrust(world, world.idByName('何阿喜')!, '前街食肆').allowed, true);
});

test('a faceless house has no relationship to consult, so it judges by 名頭', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    world.data.economy!.state.accounts['前街食肆']!.authorizedSpenderIds = [];

    world.castById(liu)!.renown = 0.6;
    assert.equal(tabTrust(world, liu, '前街食肆').allowed, true);
    world.castById(liu)!.renown = 0.1;
    assert.equal(tabTrust(world, liu, '前街食肆').allowed, false, 'a name that low buys nothing on credit');
});

// ── 社會性死亡 emerges; nobody declares it ───────────────────────────────────

test('社會性死亡 is a description of every gate being shut at once', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const before = socialStandingOf(world, liu);
    assert.equal(before.sociallyDead, false);

    // Turn the whole room cold, one edge at a time. Nothing writes a "dead" flag.
    for (const member of world.activeCast()) {
        if (member.id === liu) continue;
        world.setEdge(member.id, liu, `${HEARSAY_MARK}他${DEBT_GRIEVANCE_MARK}不還，冷著點`, 'cold');
    }
    world.castById(liu)!.renown = 0.1;

    const after = socialStandingOf(world, liu);
    assert.equal(after.warm, 0, 'not one warm face left');
    assert.ok(after.cold >= Math.ceil((world.activeCast().length - 1) * 0.6));
    assert.equal(after.doorsOpen, 0);
    assert.equal(after.sociallyDead, true);

    // And it un-happens the moment the relationships do — because it is derived.
    for (const member of world.activeCast()) {
        if (member.id === liu) continue;
        world.setEdge(member.id, liu, '照過面，沒什麼過節', 'warm');
    }
    world.castById(liu)!.renown = 0.6;
    assert.equal(socialStandingOf(world, liu).sociallyDead, false);
});

test('the standing board ranks the cast by how many doors are open to them', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    for (const member of world.activeCast()) {
        if (member.id === liu) continue;
        world.setEdge(member.id, liu, '欠帳不還，冷著點', 'cold');
    }

    const board = standingBoard(world);
    assert.equal(board.length, world.activeCast().length, 'the whole cast is censused');
    // Most of the cast has no open door by default (an unseeded edge reads 0.5,
    // under the night gate), so doorsOpen alone does not single anybody out —
    // what marks him is that the room has actively gone COLD toward him.
    const worst = [...board].sort((a, b) => b.cold - a.cold)[0];
    assert.equal(worst.characterId, liu);
    assert.equal(worst.cold, world.activeCast().length - 1, 'everyone');
    assert.ok(board.every((row) => row.warm >= 0 && row.renown >= 0 && row.doorsOpen >= 0));
});

// ── the way back ────────────────────────────────────────────────────────────

test('街談會淡: hearsay softens for the people he actually faces — first-hand does not', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const zhao = world.idByName('趙阿福')!;   // the one actually owed: first-hand
    const su = world.idByName('蘇映雪')!;     // only heard about it
    const jin = world.idByName('金鳳')!;      // heard, and avoids him
    world.setEdge(zhao, liu, `${DEBT_GRIEVANCE_MARK}不還，我當眾說了，心是冷的`, 'cold');
    world.setEdge(su, liu, `${HEARSAY_MARK}他${DEBT_GRIEVANCE_MARK}不還，冷著點`, 'cold');
    world.setEdge(jin, liu, `${HEARSAY_MARK}他${DEBT_GRIEVANCE_MARK}不還，冷著點`, 'cold');

    // He spent the day in the same rooms as 蘇映雪 and 趙阿福, but not 金鳳.
    const together = new Set([[liu, su].sort().join('|'), [liu, zhao].sort().join('|')]);
    const softened = fadeHearsay(world, together);

    assert.deepEqual(softened, [{ fromId: su, toId: liu }], 'only the second-hand one that met him');
    assert.ok(world.welcome(su, liu) >= NIGHT_DOOR_WARMTH - 0.3, '蘇映雪 stopped holding gossip');
    assert.equal(world.data.edges[zhao][liu].disposition, 'cold', 'the man he actually owes is not softened by familiarity');
    assert.equal(world.data.edges[jin][liu].disposition, 'cold', 'and somebody he avoided still has not seen him');
});

test('the whole chain survives a snapshot round-trip, because it is just edges and bonds', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const zhao = world.idByName('趙阿福')!;
    world.setEdge(zhao, liu, `${DEBT_GRIEVANCE_MARK}不還，心冷了`, 'cold');
    const bonds = world.bondGraph();
    chillBond(bonds, zhao, liu, 'shamed');
    world.setBonds(bonds);

    const restored = new WorldState(JSON.parse(JSON.stringify(world.data)));

    assert.deepEqual(grievedAgainst(restored, liu), [zhao]);
    assert.equal(tabTrust(restored, liu, '前街食肆').allowed, false);
    assert.deepEqual(restored.data.bonds, bondsToJSON(bonds));
    // The point of the correction: there is no separate ledger to forget to carry.
    assert.equal((restored.data as unknown as Record<string, unknown>).reputation, undefined);
});
