/**
 * 票房利害：the night's takings no longer vanish wholly into 班庫. A frame-
 * configurable `castShareBps` splits a share among the performers actually on
 * the boards — credited to their OWN accounts, a lead counting double — so a
 * full house is a personal stake, not just the treasury's. The split conserves
 * money exactly (every 分 still enters from the same external box-office source),
 * the remainder from integer division lands in the troupe, and the percept makes
 * each troupe player FEEL the stake. Backward compat: no `castShareBps` ⇒ all to
 * 班庫, byte-identical to before (see season-production.test.ts for that path).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import {
    auditSeasonEconomy,
    bankRehearsalAttendance,
    economyPerceptFor,
    settleEveningPerformance,
} from '../src/core/season-economy.ts';
import type { WorldState } from '../src/world-state.ts';

const YUAN = 100n;

/** A staged evening whose takings share `castShareBps` among the performers.
 *  Mirrors season-production.test.ts's stageWorld, plus the cast-share knob. */
function shareStageWorld(castShareBps: number | undefined): WorldState {
    const frame = buildAnchunAcceptanceFrame();
    (frame as { economy: { performance?: object } }).economy.performance = {
        venueScene: '雲錦台戲台',
        leadNames: ['柳安春', '蘇映雪'],
        minCast: 4,
        fullHouseYuan: 30,
        ...(castShareBps !== undefined ? { castShareBps } : {}),
    };
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, frame);
    return world;
}

function venueId(world: WorldState): string {
    return world.data.scenes.find((scene) => scene.name === '雲錦台戲台')!.id;
}

function bal(world: WorldState, id: string): bigint {
    return BigInt(world.data.economy!.state.accounts[id].available);
}

/** Drive a rehearsed full house of the named cast onto the boards. */
function fullHouse(world: WorldState, names: string[]): string[] {
    const stage = venueId(world);
    const ids = names.map((name) => world.idByName(name)!);
    for (const id of ids) world.moveCharacter(id, stage);
    bankRehearsalAttendance(world, 1); // 日午 rehearsal → full draw, no 70% penalty
    return ids;
}

test('a full house shares 30% among the performers; a lead earns double; money conserves', () => {
    const world = shareStageWorld(3000);
    const [liu, su, jiang, lian] = fullHouse(world, ['柳安春', '蘇映雪', '江聞鶴', '連翹']);
    const troupe = 'troupe';

    const before = { troupe: bal(world, troupe), liu: bal(world, liu), su: bal(world, su), jiang: bal(world, jiang), lian: bal(world, lian) };
    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;

    assert.equal(evening.performed, true);
    assert.equal(evening.takingsSubunits, 30n * YUAN); // 滿座 30 圓
    // 30% of 30 圓 = 9 圓 to the cast; 21 圓 (70%) to the troupe
    assert.equal(evening.castShareSubunits, 9n * YUAN);
    assert.equal(evening.troupeShareSubunits, 21n * YUAN);

    // troupe banks 70%, each performer's OWN account grew
    assert.equal(bal(world, troupe) - before.troupe, 21n * YUAN);
    const dLiu = bal(world, liu) - before.liu;
    const dSu = bal(world, su) - before.su;
    const dJiang = bal(world, jiang) - before.jiang;
    const dLian = bal(world, lian) - before.lian;
    assert.equal(dLiu, 3n * YUAN, 'lead 柳安春 takes a double share (weight 2)');
    assert.equal(dSu, 3n * YUAN, 'lead 蘇映雪 takes a double share (weight 2)');
    assert.equal(dJiang, 150n, 'a non-lead takes a single share (1.5 圓)');
    assert.equal(dLian, 150n);
    assert.equal(dLiu, 2n * dJiang, 'a lead earns exactly twice a non-lead');

    // conservation: takings == troupe cut + Σ cast shares, to the 分
    assert.equal(evening.takingsSubunits, evening.troupeShareSubunits! + (dLiu + dSu + dJiang + dLian));
    assert.equal(dLiu + dSu + dJiang + dLian, evening.castShareSubunits);

    // the settle notice names the split
    assert.match(evening.line, /班庫得 21 圓/);
    assert.match(evening.line, /登台的 4 人分了 9 圓/);

    // the cut is real ledger money from the external box office, and it audits clean
    const shareTxns = world.data.economy!.state.ledger.filter((txn) => txn.memo.includes('登台分紅'));
    assert.equal(shareTxns.length, 4);
    assert.ok(shareTxns.every((txn) => txn.from === 'external' && txn.kind === 'external-in'));
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('the integer-division remainder lands in the troupe — nothing minted or lost', () => {
    const world = shareStageWorld(3000);
    // 5 performers → weight 2+2+1+1+1 = 7; 9 圓 (900 分) / 7 does NOT divide evenly
    const ids = fullHouse(world, ['柳安春', '蘇映雪', '江聞鶴', '連翹', '何阿喜']);
    const before = Object.fromEntries(ids.map((id) => [id, bal(world, id)]));
    const beforeTroupe = bal(world, 'troupe');

    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.castShareSubunits, 9n * YUAN); // 30% of 30 圓

    // 柳 900*2/7=257、蘇 257、江/連/何 900/7=128 each → paid 898；remainder 2 分 → troupe
    const paid = ids.reduce((sum, id) => sum + (bal(world, id) - before[id]), 0n);
    assert.equal(paid, 898n, 'the performers share the divisible part');
    assert.equal(evening.troupeShareSubunits! - (evening.castShareSubunits! - paid), 21n * YUAN, 'troupe base is 70%');
    assert.equal(bal(world, 'troupe') - beforeTroupe, 21n * YUAN + 2n, 'troupe gets 70% PLUS the 2 分 remainder');

    // total conserves to the 分: takings == troupe cut + everything the cast got
    assert.equal(evening.takingsSubunits, (bal(world, 'troupe') - beforeTroupe) + paid);
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('backward compat: with no castShareBps ALL takings go to the troupe, byte-identical', () => {
    const world = shareStageWorld(undefined);
    const ids = fullHouse(world, ['柳安春', '蘇映雪', '江聞鶴', '連翹']);
    const before = Object.fromEntries(ids.map((id) => [id, bal(world, id)]));
    const beforeTroupe = bal(world, 'troupe');

    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(bal(world, 'troupe') - beforeTroupe, 30n * YUAN, 'all 30 圓 to the troupe');
    assert.ok(ids.every((id) => bal(world, id) === before[id]), 'no performer earns a cut');
    assert.equal(evening.castShareSubunits, 0n);
    assert.match(evening.line, /票房 30 圓 入春雪社班庫/); // the original notice, unchanged
    assert.equal(world.data.economy!.state.ledger.filter((txn) => txn.memo.includes('登台分紅')).length, 0);
    assert.equal(world.data.economy!.performance!.castShareBps, undefined, 'the key is omitted when unset');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('停鑼: no lead / under-cast means zero takings and zero shares, no crash', () => {
    const world = shareStageWorld(3000);
    const backstage = world.data.scenes.find((scene) => scene.name === '後台妝閣')!.id;
    // both leads leave the boards → no lead on stage → the evening 停鑼
    for (const name of ['柳安春', '蘇映雪']) world.moveCharacter(world.idByName(name)!, backstage);
    const beforeTroupe = bal(world, 'troupe');

    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.performed, false);
    assert.match(evening.line, /停鑼/);
    assert.equal(bal(world, 'troupe'), beforeTroupe, 'no takings, nothing moves');
    assert.equal(world.data.economy!.state.ledger.filter((txn) => txn.memo.includes('票房')).length, 0);
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('the percept makes troupe players feel the stake; a non-troupe outsider does not', () => {
    const world = shareStageWorld(3000);
    const liu = world.idByName('柳安春')!; // lead + troupe wage
    const lian = world.idByName('連翹')!;   // troupe player, not a lead
    const jin = world.idByName('金鳳')!;    // 長三堂子 歌女 — never on the troupe payroll

    const liuPercept = economyPerceptFor(world, liu, world.data.roster[liu])!;
    assert.match(liuPercept, /你是今晚的台柱/);
    assert.match(liuPercept, /缺你這台戲就塌/);
    assert.match(liuPercept, /圓/); // states an illustrative share figure

    const lianPercept = economyPerceptFor(world, lian, world.data.roster[lian])!;
    assert.match(lianPercept, /上台就有份/);
    assert.match(lianPercept, /你到場才分得到/);

    // 金鳳 draws from 長三堂子, not the box office — she gets NO cast-share line
    const jinPercept = economyPerceptFor(world, jin, world.data.roster[jin])!;
    assert.doesNotMatch(jinPercept, /台柱/);
    assert.doesNotMatch(jinPercept, /上台就有份/);
});
