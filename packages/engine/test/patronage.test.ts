/**
 * 觀眾注資 — the outside-in half of the money loop.
 *
 * The rule this module exists to enforce: an operator NEVER edits a balance. They
 * fire a channel, and three things must happen together — a real ledger row, a
 * perceivable world event, and a tally the drama can read. A silent balance edit
 * would teach the cast nothing, which is the whole reason the diagnosed world's
 * income felt imaginary.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { flowerStallAccountOf, flowerStandings, injectPatronage, FLOWER_ENVY_GAP } from '../src/core/patronage.ts';
import { auditSeasonEconomy, ledgerRows } from '../src/core/season-economy.ts';
import { WorldState } from '../src/world-state.ts';

const YUAN = 100n;

function seasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    world.data.wants = [];
    return world;
}

const balance = (world: WorldState, id: string): bigint => BigInt(world.data.economy!.state.accounts[id]!.available);

test('買票: money enters the world through a real ledger row, and the house is told', () => {
    const world = seasonWorld();
    const troupeId = world.data.economy!.troupeAccountId;
    const before = balance(world, troupeId);

    const out = injectPatronage(world, { channel: 'ticket', amountYuan: 5, day: 1, tick: 3 });

    assert.ok(out.ok, out.reason);
    assert.equal(balance(world, troupeId) - before, 5n * YUAN);
    const row = ledgerRows(world).find((r) => r.memo === '看客買票');
    assert.ok(row, 'an auditor can point at it');
    assert.equal(row!.kind, 'external-in', 'outside money enters as external-in, so conservation still holds');
    // Not a silent edit: the cast learns about it next tick.
    const percept = world.data.scheduledEvents!.find((event) => event.id.startsWith('patronage-'));
    assert.ok(percept, 'a world event was scheduled');
    assert.equal(percept!.atTick, 4);
    assert.equal(percept!.visibility, 'public');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('買花: the money reaches the STALL and the flower reaches the performer — one coin, two gains', () => {
    const world = seasonWorld();
    const lian = world.idByName('連翹')!;
    const stall = flowerStallAccountOf(world)!;
    const stallBefore = balance(world, stall);
    const performerBefore = balance(world, lian);

    const out = injectPatronage(world, { channel: 'flower', amountYuan: 2, target: '連翹', day: 1, tick: 3 });

    assert.ok(out.ok, out.reason);
    assert.equal(balance(world, stall) - stallBefore, 2n * YUAN, '殷阿婆的花攤 took the cash');
    assert.equal(balance(world, lian), performerBefore, 'the performer got the flower, not the money');
    assert.equal(world.data.patronage!.flowersByChar[lian], 1, 'the tally is world state, not a log line');
    assert.match(out.line!, /連翹/);
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('打賞: a tip goes straight into the performer\'s own purse', () => {
    const world = seasonWorld();
    const su = world.idByName('蘇映雪')!;
    const before = balance(world, su);

    injectPatronage(world, { channel: 'tip', amountYuan: 4, target: '蘇映雪', day: 1, tick: 3 });

    assert.equal(balance(world, su) - before, 4n * YUAN);
    assert.equal(BigInt(world.data.patronage!.tipsByChar[su]), 4n * YUAN);
});

test('誰的花多誰的花少 is jealousy MATERIAL: a lead falling behind gets one 妒 want, once', () => {
    const world = seasonWorld();
    // Envy is scoped to the people who share a bill — the acceptance fixture bills
    // nobody, so the test states the two leads it is about.
    const leadA = world.idByName('蘇映雪')!;
    const leadB = world.idByName('柳安春')!;
    world.data.economy!.performance = {
        venueSceneName: '雲錦台戲台',
        leadIds: [leadA, leadB],
        minCast: 2,
        fullHouseSubunits: '3000',
        rehearsedToday: [],
    };

    // One flower is a difference; FLOWER_ENVY_GAP flowers is a fact the dressing room notices.
    const first = injectPatronage(world, { channel: 'flower', amountYuan: 2, target: leadA, day: 1, tick: 3 });
    assert.deepEqual(first.spawnedWants, [], 'one flower ahead stirs nothing');

    const second = injectPatronage(world, { channel: 'flower', amountYuan: 2, target: leadA, day: 1, tick: 4 });
    assert.equal(second.spawnedWants.length, 1, `${FLOWER_ENVY_GAP} clear is what the room notices`);
    assert.equal(second.spawnedWants[0].characterId, leadB, 'it lands on the one who fell behind');
    assert.equal(second.spawnedWants[0].layer, '妒');
    assert.equal(second.spawnedWants[0].target, leadA);

    const third = injectPatronage(world, { channel: 'flower', amountYuan: 2, target: leadA, day: 1, tick: 5 });
    assert.deepEqual(third.spawnedWants, [], 'a third flower does not mint a third grudge');
});

test('refusals are loud and leave the world untouched', () => {
    const world = seasonWorld();
    const injectedBefore = world.data.economy!.state.injected;

    assert.equal(injectPatronage(world, { channel: 'flower', amountYuan: 2, day: 1, tick: 0 }).ok, false, '買花 needs a name');
    assert.equal(injectPatronage(world, { channel: 'tip', amountYuan: 2, target: '不在卷中的人', day: 1, tick: 0 }).ok, false);
    assert.equal(injectPatronage(world, { channel: 'ticket', amountYuan: 0, day: 1, tick: 0 }).ok, false, 'zero is not a gift');
    assert.equal(injectPatronage(world, { channel: 'ticket', amountYuan: -5, day: 1, tick: 0 }).ok, false);

    assert.equal(world.data.economy!.state.injected, injectedBefore, 'no refused call moved money');
    assert.equal(world.data.patronage, undefined, 'and none of them opened a tally');
});

test('the flower standings read back richest-first, deterministically', () => {
    const world = seasonWorld();
    injectPatronage(world, { channel: 'flower', amountYuan: 1, target: '蘇映雪', day: 1, tick: 0 });
    injectPatronage(world, { channel: 'flower', amountYuan: 1, target: '蘇映雪', day: 1, tick: 1 });
    injectPatronage(world, { channel: 'flower', amountYuan: 1, target: '連翹', day: 1, tick: 2 });

    const standings = flowerStandings(world);
    assert.deepEqual(standings.map((row) => [row.name, row.flowers]), [['蘇映雪', 2], ['連翹', 1]]);
});

test('gift ids and ledger txn ids are replay-stable', () => {
    const build = (): WorldState => seasonWorld();
    const a = build();
    const b = build();
    for (const world of [a, b]) {
        injectPatronage(world, { channel: 'ticket', amountYuan: 3, day: 1, tick: 0 });
        injectPatronage(world, { channel: 'tip', amountYuan: 2, target: '柳安春', day: 1, tick: 1 });
    }
    assert.deepEqual(
        a.data.patronage!.gifts.map((gift) => [gift.id, gift.amountSubunits, gift.line]),
        b.data.patronage!.gifts.map((gift) => [gift.id, gift.amountSubunits, gift.line]),
    );
});
