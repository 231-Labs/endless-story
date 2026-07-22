/**
 * 戲佔定檔 + 規劃避讓 —— a performance occupies a DEFINED on-stage span (黃昏、入夜),
 * and the character learns those 時段 are a fixed booking so they schedule everything
 * else around the show. Two surfaces, both LLM-free + deterministic:
 *   1. performanceDutyLine — the PLAN-time line fed into planDay's livelihood framing:
 *      names 黃昏、入夜 as committed for a lead / troupe player, undefined for outsiders.
 *   2. economyPerceptFor — the MOVE-time situation: present-tense「人正該在臺上」at 黃昏
 *      (開鑼此刻), future「今日黃昏開鑼、演到入夜」in the daylight run-up.
 * This is the fix for leads walking off their own show at 開鑼 (停鑼): the show is a
 * known block, stated as a fact; how to fill the rest of the day stays the character's.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { economyPerceptFor, performanceDutyLine } from '../src/core/season-economy.ts';
import { makeClock } from '../src/adapters/local/clock.ts';
import type { WorldState } from '../src/world-state.ts';

function showWorld(): WorldState {
    const frame = buildAnchunAcceptanceFrame();
    (frame as { economy: { performance?: object } }).economy.performance = {
        venueScene: '雲錦台戲台',
        leadNames: ['柳安春', '蘇映雪'],
        minCast: 4,
        fullHouseYuan: 30,
    };
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, frame);
    return world;
}

test('1) performanceDutyLine names 黃昏、入夜 as a fixed booking for a lead; nothing for an outsider', () => {
    const world = showWorld();
    const liu = performanceDutyLine(world, world.idByName('柳安春')!);
    assert.ok(liu, '柳安春 (a billed lead) gets a duty line');
    assert.match(liu!, /定檔/, 'it is framed as a fixed booking');
    assert.match(liu!, /黃昏、入夜/, 'it names the two committed on-stage 時段');
    assert.match(liu!, /領銜/, 'a lead is told they lead');
    assert.match(liu!, /挪不動/, 'the committed slots cannot be moved');
    assert.match(liu!, /清晨|日午|晡時|深宵/, 'it points personal business to the OTHER slots — plan around the show');

    // 金鳳 is 長三堂子 (not on the 班庫 payroll, not a lead) — no troupe duty.
    assert.equal(performanceDutyLine(world, world.idByName('金鳳')!), undefined, 'an outsider carries no show duty');
});

test('2) economyPerceptFor is present-tense at 開鑼 (黃昏) and future in the daylight run-up', () => {
    const world = showWorld();
    const liuId = world.idByName('柳安春')!;
    const backstage = world.data.scenes.find((s) => s.name === '後台妝閣')!.id;

    world.data.clock = makeClock(6, 3); // 黃昏 — 開鑼此刻
    const atCurtain = economyPerceptFor(world, liuId, backstage) ?? '';
    assert.match(atCurtain, /此刻正是.*開鑼/, 'at 黃昏 the reminder is present-tense: the show is on NOW');
    assert.match(atCurtain, /人得在臺上|不是辦別的事的時候/, 'a lead is told to be on the boards, not off doing other things');

    world.data.clock = makeClock(6, 1); // 日午 — run-up
    const atNoon = economyPerceptFor(world, liuId, backstage) ?? '';
    assert.match(atNoon, /今日黃昏.*開鑼、演到入夜/, 'in the daylight run-up it previews the 黃昏→入夜 show block');
});
