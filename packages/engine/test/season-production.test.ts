/**
 * 排戲→上燈→票房：the troupe's own trade as world physics. Box office is the
 * ledger's INCOME side, so a season is never "sign the contract or die"; the
 * evening settles deterministically on who the movement phase brought to the
 * boards, and daylight rehearsal is what earns a full house.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import {
    auditSeasonEconomy,
    bankRehearsalAttendance,
    economyPerceptFor,
    settleEveningPerformance,
} from '../src/core/season-economy.ts';
import { runTick } from '../src/tick.ts';
import type { WorldState } from '../src/world-state.ts';
import type { ArchivePort } from '../src/ports.ts';

const YUAN = 100n;
const nullArchive: ArchivePort = { commit: async () => {} };

function stageWorld(): WorldState {
    const frame = buildAnchunAcceptanceFrame();
    (frame as { economy: { performance?: object } }).economy.performance = {
        venueScene: '雲錦台戲台',
        leadNames: ['柳安春', '蘇映雪'],
        minCast: 4,
        fullHouseYuan: 30,
        boosts: [
            { objectId: 'worn-huqin', stateIncludes: '可上台', pct: 10 },
            { objectId: 'new-xiaosheng-costume', pct: 5 },
        ],
    };
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, frame);
    return world;
}

function venueId(world: WorldState): string {
    return world.data.scenes.find((scene) => scene.name === '雲錦台戲台')!.id;
}

function troupeFunds(world: WorldState): bigint {
    return BigInt(world.data.economy!.state.accounts.troupe.available);
}

test('a rehearsed full house pays the treasury; the evening is idempotent', () => {
    const world = stageWorld();
    const stage = venueId(world);
    const cast = ['柳安春', '蘇映雪', '江聞鶴', '連翹'].map((name) => world.idByName(name)!);
    for (const id of cast) world.moveCharacter(id, stage);

    bankRehearsalAttendance(world, 1); // 日午排過
    const before = troupeFunds(world);
    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.performed, true);
    assert.match(evening.line, /滿座/);
    assert.equal(troupeFunds(world) - before, 30n * YUAN);
    assert.equal(settleEveningPerformance(world, { day: 1, partIndex: 3 }), null, 'one show a night');
    assert.equal(world.data.economy!.performance!.rehearsedToday.length, 0, 'the bank resets');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('no lead on the boards means 停鑼 and zero income', () => {
    const world = stageWorld();
    const stage = venueId(world);
    const backstage = world.data.scenes.find((scene) => scene.name === '後台妝閣')!.id;
    for (const name of ['柳安春', '蘇映雪']) world.moveCharacter(world.idByName(name)!, backstage);
    for (const name of ['江聞鶴', '連翹', '何阿喜', '金鳳']) world.moveCharacter(world.idByName(name)!, stage);
    const before = troupeFunds(world);
    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.performed, false);
    assert.match(evening.line, /停鑼/);
    assert.match(evening.line, /領銜/);
    assert.equal(troupeFunds(world), before);
});

test('half the leads and no rehearsal thins the house; a mended huqin lifts it', () => {
    const world = stageWorld();
    const stage = venueId(world);
    const backstage = world.data.scenes.find((scene) => scene.name === '後台妝閣')!.id;
    world.moveCharacter(world.idByName('蘇映雪')!, backstage);
    for (const name of ['柳安春', '江聞鶴', '連翹', '何阿喜']) world.moveCharacter(world.idByName(name)!, stage);
    // 蘇映雪 absent (60%), nobody rehearsed (×70%) → 30 × 0.42 = 12.6 圓
    const before = troupeFunds(world);
    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.performed, true);
    assert.equal(troupeFunds(world) - before, 1260n); // 12 圓 60 分

    // day 2: same cast, rehearsed, huqin mended → 60% + 10 boost = 70% of 30 = 21 圓
    const huqin = world.objectById('worn-huqin')!;
    huqin.state = '換上新弦、修整如初，可上台伴奏';
    bankRehearsalAttendance(world, 2);
    const before2 = troupeFunds(world);
    const evening2 = settleEveningPerformance(world, { day: 2, partIndex: 3 })!;
    assert.equal(troupeFunds(world) - before2, 21n * YUAN);
    assert.match(evening2.line, /七成座/);
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('the percept tells the cast the show is tonight and the lead that it rests on her', () => {
    const world = stageWorld();
    const liu = world.idByName('柳安春')!;
    const he = world.idByName('何阿喜')!;
    // 戲佔定檔: the daylight run-up now also names the 黃昏、入夜 戲檔 for the lead.
    assert.match(economyPerceptFor(world, liu, world.data.roster[liu])!, /你是領銜，.*你不上台這戲就塌/);
    assert.match(economyPerceptFor(world, liu, world.data.roster[liu])!, /黃昏、入夜這兩格是你的戲檔/);
    assert.match(economyPerceptFor(world, he, world.data.roster[he])!, /今日黃昏【雲錦台戲台】開鑼/);
});

test('the tick wires the evening: a 黃昏 tick logs an outcome into the day accum', async () => {
    const world = stageWorld();
    world.data.clock = makeClock(6, 3); // day 1 黃昏
    const stage = venueId(world);
    for (const member of world.data.cast) world.moveCharacter(member.id, stage);
    await runTick(world, {
        agent: new FakeSceneAgent(),
        recall: new LocalRecall(),
        archive: nullArchive,
        clock: new LocalClock(),
        economy: new LocalEconomy(),
    }, { log: () => {} });
    assert.ok(
        world.data.dayAccum.lines.some((line) => line.includes('上燈開鑼') || line.includes('停鑼')),
        `evening outcome missing from day log: ${world.data.dayAccum.lines.join(' / ')}`,
    );
    assert.ok((world.data.scheduledEvents ?? []).some((event) => event.id.startsWith('boxoffice-')));
});
