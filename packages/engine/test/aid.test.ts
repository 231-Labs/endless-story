/**
 * 資助搭救 (decideAid) — a character holding CLEAR SURPLUS coin, co-present with
 * someone in REAL hardship, autonomously decides whether to give some of their
 * OWN money to help. Emotion + economy together (it fills the "financially
 * aid/rescue" gap in WANTS_WITHOUT_MECHANISM).
 *
 * The give/no-give judgment is the capability's (runner aid.ts); the FakeSceneAgent
 * OMITS decideAid, so the tick's DETERMINISTIC fallback voices it — a small,
 * surplus-clamped gift to the neediest WARMLY-BONDED co-present peer. Every test
 * here drives that deterministic path (no LLM, no key).
 *
 * The money moves ONLY through the conserving `pay` economy command (giver
 * debited, recipient credited, SAME ledger, no mint), so auditSeasonEconomy stays
 * [] and conservation holds. All tests author their state on top of the shared
 * anchun frame WITHOUT editing the shipped fixture (only local copies are tweaked).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { auditSeasonEconomy } from '../src/core/season-economy.ts';
import { BOND, bondOf, seedBond, type BondGraph } from '../src/core/bond-graph.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile, type SeasonFrame } from '../src/preset.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import type { ArchivePort } from '../src/ports.ts';

const YUAN = 100n;
const nullArchive: ArchivePort = { commit: async () => {} };

function deps(agent: FakeSceneAgent) {
    return { agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock(), economy: new LocalEconomy() };
}

type Override = { openingYuan?: number; dailyFixedCostYuan?: number };

/** The shared anchun frame with a few character opening/daily overrides (a LOCAL
 *  copy — the shipped fixture is never edited). Opening balances flow straight
 *  into account `available`, and `injected` is recomputed from them at seed time,
 *  so conservation holds by construction whatever balances we choose. */
function frameWith(overrides: Record<string, Override>): SeasonFrame {
    const frame = buildAnchunAcceptanceFrame();
    frame.economy!.characters = (frame.economy!.characters ?? []).map((c) =>
        overrides[c.name] ? { ...c, ...overrides[c.name] } : c,
    );
    return frame;
}

function buildWorld(frame: SeasonFrame): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, frame);
    return world;
}

const availOf = (world: WorldState, id: string): bigint => BigInt(world.data.economy!.state.accounts[id]!.available);
const aidLines = (world: WorldState): string[] => world.data.dayAccum.lines.filter((l) => l.startsWith('[濟]'));

/** Put `peerId` at `giverId`'s scene and warm the bond both ways to `v`. */
function coPresentAndBond(world: WorldState, giverId: string, peerId: string, v: number): void {
    world.data.roster[peerId] = world.data.roster[giverId];
    const g: BondGraph = new Map();
    seedBond(g, giverId, peerId, v);
    seedBond(g, peerId, giverId, v);
    world.setBonds(g);
}

// ── 1) the headline: coin moves giver→recipient, conserving, bond warms, once/day ──

test('a well-off giver aids a broke, warmly-bonded co-present peer — coin moves, conserves, bond warms, once/day', async () => {
    // 沈雪笙 → hardship (1 圓 on hand, but 6 圓/day keep, so aid does NOT lift them
    // out of hardship — isolating the once-per-day bound from hardship-resolution).
    const world = buildWorld(frameWith({ '沈雪笙': { openingYuan: 1, dailyFixedCostYuan: 6 } }));
    world.data.clock = makeClock(6, 1); // day 1 日午 — daytime, not day-end
    const bai = world.idByName('白韻秋')!;   // giver: 80 圓, 5 圓/day → clear surplus
    const shen = world.idByName('沈雪笙')!;  // peer: broke, warmly bonded, co-present
    coPresentAndBond(world, bai, shen, 0.5);

    const baiBefore = availOf(world, bai);
    const shenBefore = availOf(world, shen);
    assert.equal(shenBefore, 1n * YUAN, '沈雪笙 starts broke (1 圓)');

    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    const moved = baiBefore - availOf(world, bai);
    assert.equal(moved, 3n * YUAN, '白韻秋 debited the 3-圓 fallback gift');
    assert.equal(availOf(world, shen) - shenBefore, 3n * YUAN, '沈雪笙 credited the exact same amount');
    assert.deepEqual(auditSeasonEconomy(world), [], 'conservation holds — money only moved via the pay path');

    // conservation the hard way: the two accounts' total is unchanged (no mint/burn).
    assert.equal(availOf(world, bai) + availOf(world, shen), baiBefore + shenBefore, 'giver+recipient total preserved');

    const lines = aidLines(world);
    assert.equal(lines.length, 1, 'exactly one [濟] aid line');
    assert.match(lines[0], /白韻秋 接濟 沈雪笙/, 'the [濟] line names giver and recipient');
    assert.match(lines[0], /3 圓/, 'the [濟] line names the amount');

    // generosity deepened the tie beyond the seed (gift warmth + co-presence).
    assert.ok(bondOf(world.bondGraph(), bai, shen) > 0.5, 'the bond warmed past its seed');

    // once per day: a second daytime tick the SAME day does NOT double-gift, even
    // though the giver still has surplus and the peer is still in hardship.
    const baiAfterOne = availOf(world, bai);
    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });
    assert.equal(availOf(world, bai), baiAfterOne, 'no second gift the same day (once-per-day bound)');
    assert.equal(aidLines(world).length, 1, 'still exactly one [濟] line');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

// ── 2) guards ──────────────────────────────────────────────────────────────────

test('guard: a giver with NO surplus gives nothing (even to a warmly-bonded broke peer)', async () => {
    // 蘇映雪 has 5 圓 on hand but a 5-圓/day floor×3 = 15 圓 → no surplus at all.
    const world = buildWorld(frameWith({
        '蘇映雪': { openingYuan: 5, dailyFixedCostYuan: 5 },
        '沈雪笙': { openingYuan: 1 },
    }));
    world.data.clock = makeClock(6, 1);
    const su = world.idByName('蘇映雪')!;
    const shen = world.idByName('沈雪笙')!;
    coPresentAndBond(world, su, shen, 0.6); // warm — so only the surplus gate can stop it
    const shenBefore = availOf(world, shen);

    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    assert.equal(availOf(world, shen), shenBefore, 'the broke peer received nothing');
    assert.equal(aidLines(world).length, 0, 'no aid fired without surplus');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('guard: a broke peer who is a stranger (cold bond) gets nothing under the deterministic fallback', async () => {
    const world = buildWorld(frameWith({ '沈雪笙': { openingYuan: 1 } }));
    world.data.clock = makeClock(6, 1);
    const bai = world.idByName('白韻秋')!; // rich giver
    const shen = world.idByName('沈雪笙')!; // broke, but NO warm bond
    world.data.roster[shen] = world.data.roster[bai];
    world.setBonds(new Map()); // every pair reads stranger (< known) → cold
    const shenBefore = availOf(world, shen);

    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    assert.equal(availOf(world, shen), shenBefore, 'a cold-bonded stranger is not aided by the fallback');
    assert.equal(aidLines(world).length, 0, 'no [濟] line on a cold bond');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('guard: a warmly-bonded co-present peer who is NOT in hardship gets nothing', async () => {
    // 蘇映雪 keeps her shipped 20 圓 (runway 6 days) — solvent, not hardship.
    const world = buildWorld(frameWith({}));
    world.data.clock = makeClock(6, 1);
    const bai = world.idByName('白韻秋')!; // rich giver
    const su = world.idByName('蘇映雪')!;  // 20 圓 — comfortable, not hardship
    coPresentAndBond(world, bai, su, 0.6);
    const suBefore = availOf(world, su);

    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    assert.equal(availOf(world, su), suBefore, 'a solvent peer is not aided (no hardship)');
    assert.equal(aidLines(world).length, 0, 'no aid without a hardship peer');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('guard: no-overdraft — the fallback gift is clamped to surplus, never below the giver’s floor', async () => {
    // 蘇映雪: 17 圓 on hand, 5 圓/day → floor 15 圓, surplus only 2 圓 (< the 3-圓
    // fixed sum). The gift must clamp to 2 圓 and leave her exactly at her floor.
    const world = buildWorld(frameWith({
        '蘇映雪': { openingYuan: 17, dailyFixedCostYuan: 5 },
        '沈雪笙': { openingYuan: 1 },
    }));
    world.data.clock = makeClock(6, 1);
    const su = world.idByName('蘇映雪')!;
    const shen = world.idByName('沈雪笙')!;
    coPresentAndBond(world, su, shen, 0.5);
    const suBefore = availOf(world, su);
    const shenBefore = availOf(world, shen);

    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    assert.equal(suBefore - availOf(world, su), 2n * YUAN, 'the gift clamped to the 2-圓 surplus, not the 3-圓 default');
    assert.equal(availOf(world, shen) - shenBefore, 2n * YUAN, 'the peer received the clamped amount');
    assert.equal(availOf(world, su), 15n * YUAN, 'the giver is left exactly at her floor, never beggared');
    assert.ok(availOf(world, su) >= 0n, 'the giver is never pushed negative');
    assert.deepEqual(auditSeasonEconomy(world), []);
    assert.match(aidLines(world)[0], /2 圓/, 'the [濟] line names the clamped amount');
});

// ── 3) backward-compat ─────────────────────────────────────────────────────────

/** A minimal, economy-LESS world: two co-present cast, no ledger at all. */
function noEconomyWorld(): WorldStateData {
    return {
        sagaId: 'aid-no-econ',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [{ id: 's0', name: '戲園前街', privacyLevel: 0 }, { id: 's1', name: '小樓', privacyLevel: 3 }],
        roster: { c0: 's0', c1: 's0' },
        homeByChar: { c0: 's1', c1: 's1' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [],
        edges: {},
        clock: makeClock(6, 1),
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
    };
}

test('backward-compat: a world with NO economy runs the aid step inert (no [濟], no throw)', async () => {
    const world = new WorldState(noEconomyWorld());
    // deps WITHOUT economy — a no-economy world must run clean.
    await runTick(world, { agent: new FakeSceneAgent(), recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() }, { log: () => {} });
    assert.equal(world.data.dayAccum.lines.filter((l) => l.startsWith('[濟]')).length, 0, 'no aid on an economy-less world');
});

test('backward-compat: the shipped anchun frame triggers no aid and leaves every balance untouched', async () => {
    const world = buildWorld(frameWith({})); // pristine anchun balances (min 6 圓, runway ≥ 2 — nobody in hardship)
    world.data.clock = makeClock(6, 1);
    const bai = world.idByName('白韻秋')!;
    const shen = world.idByName('沈雪笙')!;
    const su = world.idByName('蘇映雪')!;
    const before = { bai: availOf(world, bai), shen: availOf(world, shen), su: availOf(world, su) };

    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    assert.equal(aidLines(world).length, 0, 'the acceptance frame’s settle path triggers no aid');
    assert.equal(availOf(world, bai), before.bai, '白韻秋 balance unchanged');
    assert.equal(availOf(world, shen), before.shen, '沈雪笙 balance unchanged');
    assert.equal(availOf(world, su), before.su, '蘇映雪 balance unchanged');
    assert.deepEqual(auditSeasonEconomy(world), [], 'audit stays clean — identical to the untouched frame');
});
