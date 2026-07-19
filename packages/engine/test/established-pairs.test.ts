/**
 * 活化關係數值底層 + 老情人重逢 register — the bond-graph underlay wired into the
 * tick. These are deterministic PLUMBING tests (FakeSceneAgent, no LLM):
 *   1. lazy canon seed classifies intimate → established, yearning → not;
 *   2. an established 2-person private NIGHT pair opens the intimacy register
 *      WITHOUT a live love want (old lovers renegotiate nothing);
 *   3. nightly cooling never drops an old flame below its floor (floorOfPeak·peak);
 *   4. the advance affordance is bond-gated (stranger false, established true);
 *   5. an edgeless world stays fully inert (both fields []), no behaviour change;
 *   6. an in-scene advance→accept promotes the pair + warms the bond (床).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { makeClock } from '../src/adapters/local/clock.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant } from '../src/core/want-core.ts';
import { BOND, advanceReady, bondOf, bondsToJSON, decayBonds, seedBond } from '../src/core/bond-graph.ts';
import type { ArchivePort } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** Minimal world builder — pass an override to shape cast/scenes/roster/edges/clock. */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'bond',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前台', privacyLevel: 1 },
            { id: 's1', name: '小樓', privacyLevel: 3 },
            { id: 's2', name: '別院', privacyLevel: 3 },
        ],
        roster: { c0: 's1', c1: 's1' },
        homeByChar: { c0: 's1', c1: 's1' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [],
        edges: {},
        clock: makeClock(6, 0),
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

/** Captures every actBeat input so the consummate/advance flags can be asserted. */
class RecordingAgent extends FakeSceneAgent {
    beatInputs: CharacterAgentNs.ActBeatInput[] = [];
    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        this.beatInputs.push(input);
        const r = await super.actBeat(input);
        return { ...r, close: true }; // wrap each scene after one beat — keeps the test fast
    }
}

/** Scripts the intimacy negotiation off the flags the loop passes: advance when
 *  the world offers the card, accept (and close) when an overture is on the table. */
class ScriptedAcceptAgent extends FakeSceneAgent {
    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        if (input.intimacyOffered) return { beat: `${input.name}輕輕應了下來`, inner: '應了', intimacy: 'accept', close: true };
        if (input.intimacyPossible) return { beat: `${input.name}挨近了些`, inner: '想再近些', intimacy: 'advance' };
        return super.actBeat(input);
    }
}

test('1) lazy seed: an intimate edge establishes, a 暗慕 view does not', async () => {
    // Four solo actors (no co-presence ⇒ no bond-bump), so the graph reflects the
    // pure canon SEED: c0→c1 an intimate edge (相許), c2→c3 a 暗慕 VIEW (yearning).
    const world = makeWorld({
        cast: [
            { id: 'c0', name: '甲', persona: '甲', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c2', name: '丙', persona: '丙', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: { c3: '打從心裡暗慕著，話沒敢說' } },
            { id: 'c3', name: '丁', persona: '丁', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '甲處', privacyLevel: 1 },
            { id: 's1', name: '乙處', privacyLevel: 1 },
            { id: 's2', name: '丙處', privacyLevel: 1 },
            { id: 's3', name: '丁處', privacyLevel: 1 },
        ],
        roster: { c0: 's0', c1: 's1', c2: 's2', c3: 's3' },
        homeByChar: { c0: 's0', c1: 's1', c2: 's2', c3: 's3' },
        workByChar: { c0: 's0', c1: 's1', c2: 's2', c3: 's3' },
        edges: { c0: { c1: { tone: '舊情人', weight: 1 } } },
    });

    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    assert.deepEqual(world.data.establishedPairs, [world.pairKey('c0', 'c1')], 'intimate marker establishes exactly the c0-c1 pair');
    assert.ok(!world.isEstablished('c2', 'c3'), '暗慕 (yearning) does NOT establish');
    const g = world.bondGraph();
    assert.equal(bondOf(g, 'c0', 'c1'), BOND.seed.established, 'intimate edge → established seed 0.75');
    assert.equal(bondOf(g, 'c2', 'c3'), BOND.seed.yearning, '暗慕 view → yearning seed 0.6');
});

test('2) an established night pair opens the consummate register with no love want', async () => {
    // Pre-seed the bond layer so the lazy seed is skipped and the pair is established
    // WITHOUT any live 愛/情 want. A private night pair, one of whom "arrived" this
    // tick (deliberate encounter), plays the scene.
    const g = new Map();
    seedBond(g, 'c0', 'c1', BOND.seed.established);
    seedBond(g, 'c1', 'c0', BOND.seed.established);

    const established = makeWorld({
        bonds: bondsToJSON(g),
        establishedPairs: ['c0|c1'],
        lastMovedTickByChar: { c0: 4 },
        clock: makeClock(6, 4), // 入夜 — night, not day-end
    });
    const agent = new RecordingAgent();
    await runTick(established, deps(agent), { log: () => {} });
    assert.ok(agent.beatInputs.some((i) => i.consummate === true), 'the established night pair opens the intimacy register (consummate)');
    assert.deepEqual(established.data.establishedPairs, ['c0|c1'], 'the pair stays established');

    // CONTROL: identical private night pair, NOT established → no register opens.
    const stranger = makeWorld({
        bonds: [],
        establishedPairs: [],
        lastMovedTickByChar: { c0: 4 },
        clock: makeClock(6, 4),
    });
    const controlAgent = new RecordingAgent();
    await runTick(stranger, deps(controlAgent), { log: () => {} });
    assert.ok(controlAgent.beatInputs.length > 0, 'the control scene still plays');
    assert.ok(controlAgent.beatInputs.every((i) => i.consummate !== true), 'a non-established pair never opens the register');
});

test('3) decayBonds never cools an old flame below floorOfPeak · peak', () => {
    const g = new Map();
    seedBond(g, 'a', 'b', 0.75); // v=0.75, peak=0.75
    const floor = BOND.floorOfPeak * 0.75; // 0.225
    let afterFew = 1;
    for (let i = 0; i < 1000; i++) {
        decayBonds(g, new Set()); // nobody met — everything cools
        assert.ok(bondOf(g, 'a', 'b') >= floor - 1e-9, `stays at/above the floor on cool ${i}`);
        if (i === 5) afterFew = bondOf(g, 'a', 'b');
    }
    assert.ok(afterFew < 0.75 && afterFew > floor, 'a few cools drop it toward — but not to — the floor');
    assert.ok(Math.abs(bondOf(g, 'a', 'b') - floor) < 1e-3, 'it asymptotes to the floor, never past it');
});

test('4) advanceReady is bond-gated: stranger false, established true', () => {
    const empty = new Map();
    assert.equal(advanceReady(empty, 'x', 'y'), false, 'a stranger (default 0.15 < advanceAt) is not offered the advance');

    const known = new Map();
    seedBond(known, 'x', 'y', BOND.seed.known); // 0.35 < 0.45
    assert.equal(advanceReady(known, 'x', 'y'), false, '知交 standing is still below advanceAt');

    const yearning = new Map();
    seedBond(yearning, 'x', 'y', BOND.seed.yearning); // 0.6 ≥ 0.45
    assert.equal(advanceReady(yearning, 'x', 'y'), true, 'yearning standing opens the card');

    const est = new Map();
    seedBond(est, 'x', 'y', BOND.seed.established); // 0.75
    assert.equal(advanceReady(est, 'x', 'y'), true, 'an established pair is always offered the advance');
});

test('5) backward-compat: an edgeless world stays inert — both fields []', async () => {
    // Empty edges + empty views + no co-presence ⇒ the seed produces [], nothing
    // bumps, and no register/behaviour change occurs.
    const world = makeWorld({
        roster: { c0: 's1', c1: 's2' }, // apart — no bond-bump this tick
    });
    const report = await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });
    assert.deepEqual(world.data.bonds, [], 'bonds seeded to [] and never touched');
    assert.deepEqual(world.data.establishedPairs, [], 'nobody established');
    assert.equal(typeof report.beats, 'number', 'the tick ran without crashing');
});

test('6) an in-scene advance→accept promotes the pair and warms the bond', async () => {
    // A yearning pair (advanceReady true), NOT established, alone in a private room
    // at night (deliberate encounter). The scripted agent advances then accepts.
    const g = new Map();
    seedBond(g, 'c0', 'c1', BOND.seed.yearning);
    seedBond(g, 'c1', 'c0', BOND.seed.yearning);

    const world = makeWorld({
        bonds: bondsToJSON(g),
        establishedPairs: [],
        lastMovedTickByChar: { c0: 4 },
        clock: makeClock(6, 4),
    });
    const report = await runTick(world, deps(new ScriptedAcceptAgent()), { log: () => {} });

    assert.ok(world.isEstablished('c0', 'c1'), 'the accepted overture promotes the pair to 相許');
    assert.deepEqual(world.data.establishedPairs, [world.pairKey('c0', 'c1')]);
    assert.ok(bondOf(world.bondGraph(), 'c0', 'c1') > BOND.seed.yearning, 'the 床 bump warmed the bond past its yearning seed');
    assert.equal(report.beats, 2, 'advance then accept — exactly two beats');
});
