/**
 * 夜訪商量 — the confide / seek-counsel medium. Deterministic PLUMBING tests
 * (FakeSceneAgent, no LLM). A character weighing a heavy NON-romantic matter goes
 * at night to their most-trusted confidant to think it through (litmus: 柳安春,
 * weighing the contract, goes at night to 師姐 蘇映雪).
 *
 *   1. confideWorry picks the hottest RIPE non-bond / non-jealous want, else null;
 *   2. nightSceneKind gates confide on trust, with tryst → reckoning → confide
 *      precedence, and is EXACTLY as before when called with 3 args;
 *   3. confiderOf names the worrier (not the confidant);
 *   4. a confide night pair survives the cull with NO deliberate encounter and the
 *      confider OPENS the scene (firstActorId);
 *   5. an empty-bond world forms no confide scene (zero behaviour change);
 *   6. the confide PULL names the trusted confidant, and stays silent without a
 *      worry or without a trusted confidant.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { makeClock } from '../src/adapters/local/clock.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import {
    confideWorry,
    confiderOf,
    newWant,
    nightSceneKind,
    qualifiesAsConfide,
    type Want,
} from '../src/core/want-core.ts';
import { bondsToJSON, seedBond } from '../src/core/bond-graph.ts';
import type { ArchivePort } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** A live want that is RIPE by default (heat past resistance): forcing != idle. */
function ripeWant(over: {
    characterId: string;
    layer: string;
    desc: string;
    target?: string;
    weight?: number;
    resistance?: number;
    heat?: number;
}): Want {
    const w = newWant({
        characterId: over.characterId,
        layer: over.layer,
        desc: over.desc,
        target: over.target,
        weight: over.weight ?? 0.7,
        sat: 0.2,
        resistance: over.resistance ?? 3,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
    });
    w.heat = over.heat ?? 4; // pressure 4 ≥ resistance 3 ⇒ edge (ripe)
    return w;
}

/** Minimal 2-person world; pass an override to shape cast/scenes/roster/wants/bonds. */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'confide',
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

/** Captures every decideMove input so the confide PULL rhythmHint can be asserted. */
class MoveRecorder extends FakeSceneAgent {
    moveInputs: CharacterAgentNs.MoveDecideInput[] = [];
    override async decideMove(input: CharacterAgentNs.MoveDecideInput): Promise<CharacterAgentNs.MoveDecideResult> {
        this.moveInputs.push(input);
        return { move: false, reason: 'stay' };
    }
}

const CS = [{ id: 'c0', name: '柳安春' }, { id: 'c1', name: '蘇映雪' }];
const trustAll = () => true;
const trustNone = () => false;

test('1) confideWorry picks the hottest ripe NON-bond / NON-jealous want, else null', () => {
    const affair = ripeWant({ characterId: 'c0', layer: '事務', desc: '該不該簽這紙三年約', weight: 0.7 });
    const love = ripeWant({ characterId: 'c0', layer: '愛', desc: '想多挨近師姐', target: 'c1', weight: 0.95 });
    const jealous = ripeWant({ characterId: 'c0', layer: '妒', desc: '見不得那人得意', target: 'c2', weight: 0.95 });
    const idleAmbition = ripeWant({ characterId: 'c0', layer: '志向', desc: '想在台上站到最亮處', weight: 0.9, resistance: 8, heat: 1 });

    // love (0.95·0.8) and jealous are HOTTER but excluded; the ambition isn't ripe.
    assert.equal(
        confideWorry([love, jealous, idleAmbition, affair], 'c0')?.id,
        affair.id,
        'the pressing 事務 worry wins over the hotter (excluded) love/jealous and the idle ambition',
    );

    // only love/debt/jealous are hot, the sole non-bond want is idle ⇒ nothing to confide.
    assert.equal(confideWorry([love, jealous, idleAmbition], 'c0'), null, 'no ripe non-bond, non-jealous want ⇒ null');

    // a debt (reckon) want is a bond layer — never a worry.
    const debt = ripeWant({ characterId: 'c0', layer: '虧欠', desc: '欠她一句交代', target: 'c1' });
    assert.equal(confideWorry([debt], 'c0'), null, 'a 虧欠 reckon want is a bond layer, never a worry');
    // a worry belongs to its owner only.
    assert.equal(confideWorry([affair], 'c1'), null, 'another character does not carry c0’s worry');
});

test('2) nightSceneKind: confide gating, tryst→reckoning→confide precedence, 3-arg backward-compat', () => {
    const worry = [ripeWant({ characterId: 'c0', layer: '事務', desc: '該不該簽這紙約' })];

    assert.equal(nightSceneKind(CS, 3, worry, trustAll), 'confide', 'a trusted 2-person private night worry ⇒ confide');
    assert.equal(nightSceneKind(CS, 3, worry, trustNone), null, 'untrusted pair ⇒ not a confide');
    assert.equal(nightSceneKind(CS, 3, worry), null, 'a 3-arg call NEVER yields confide (backward-compat)');
    assert.equal(nightSceneKind(CS, 2, worry, trustAll), null, 'a non-private venue never plays');

    // PRECEDENCE: a love want (tryst) or a debt want (reckoning) wins over confide,
    // even with a worry present and full trust.
    const love = ripeWant({ characterId: 'c0', layer: '愛', desc: '想挨近', target: '蘇映雪' });
    const debt = ripeWant({ characterId: 'c0', layer: '虧欠', desc: '欠她的', target: 'c1' });
    assert.equal(nightSceneKind(CS, 3, [love, ...worry], trustAll), 'tryst', 'tryst outranks confide');
    assert.equal(nightSceneKind(CS, 3, [debt, ...worry], trustAll), 'reckoning', 'reckoning outranks confide');
});

test('3) confiderOf: the worrier (not the confidant) is the confider', () => {
    const worry = [ripeWant({ characterId: 'c0', layer: '事務', desc: '該不該簽這紙約' })];
    assert.equal(confiderOf(CS, worry, trustAll), 'c0', 'the one carrying the worry is the confider');
    // trust is asymmetric (confider→other): if c0 does not trust c1, no confide.
    assert.equal(confiderOf(CS, worry, (a) => a !== 'c0'), null, 'no confide when the worrier does not trust the other');
    // the listener (c1) carries no worry ⇒ never the confider, even under full trust.
    assert.equal(qualifiesAsConfide(CS, 3, worry, trustAll), true, 'the pair qualifies (c0 confides in c1)');
    assert.equal(confiderOf([CS[0]], worry, trustAll), null, 'a solo cast is never a confide pair');
});

test('4) a confide night pair survives the cull with no deliberate encounter, and the confider opens it', async () => {
    const g = new Map<string, { v: number; peak: number }>();
    seedBond(g, 'c0', 'c1', 0.5); // 柳安春 trusts her 師姐 (bond ≥ known 0.35)
    seedBond(g, 'c1', 'c0', 0.5);

    const world = makeWorld({
        bonds: bondsToJSON(g),
        establishedPairs: [],
        roster: { c0: 's1', c1: 's1' },      // co-located in a private room
        homeByChar: { c0: 's2', c1: 's1' },
        lastMovedTickByChar: {},             // NOBODY arrived this tick ⇒ not a deliberate encounter
        clock: makeClock(6, 4),              // 入夜 — night, not day-end
        wants: [ripeWant({ characterId: 'c0', layer: '事務', desc: '該不該簽這紙三年約' })],
    });

    const seen: Array<{ sceneId: string; characterId: string }> = [];
    const report = await runTick(world, deps(new FakeSceneAgent()), {
        log: () => {},
        onBeat: (o) => seen.push({ sceneId: o.sceneId, characterId: o.beat.characterId }),
    });

    const confideBeats = seen.filter((s) => s.sceneId === 's1');
    assert.ok(report.beats > 0 && confideBeats.length > 0, 'the confide scene survived the cull and played (no deliberate encounter)');
    assert.equal(confideBeats[0].characterId, 'c0', 'the confider (worrier) opened the scene');
});

test('5) backward-compat: an empty-bond world forms no confide scene', async () => {
    const world = makeWorld({
        bonds: [],                           // no bonds ⇒ isTrusted false for every pair
        roster: { c0: 's1', c1: 's1' },
        lastMovedTickByChar: {},             // no deliberate encounter either
        clock: makeClock(6, 4),              // 入夜
        wants: [ripeWant({ characterId: 'c0', layer: '事務', desc: '該不該簽這紙約' })],
    });
    const seen: string[] = [];
    const report = await runTick(world, deps(new FakeSceneAgent()), { log: () => {}, onBeat: (o) => seen.push(o.sceneId) });
    assert.equal(seen.length, 0, 'no scene played — a worry without a trusted confidant sleeps');
    assert.equal(report.beats, 0, 'zero beats: the empty-bond world is fully inert');
    assert.deepEqual(world.data.bonds, [], 'bonds stayed []');
});

test('6) the confide PULL names the trusted confidant, and stays silent without a worry / trust', async () => {
    const mkWorry = (): Want => ripeWant({ characterId: 'c0', layer: '事務', desc: '該不該簽這紙三年約' });

    function pullWorld(wants: Want[], bond: number): WorldState {
        const g = new Map<string, { v: number; peak: number }>();
        seedBond(g, 'c0', 'c1', bond);
        seedBond(g, 'c1', 'c0', bond);
        return makeWorld({
            cast: [
                { id: 'c0', name: '柳安春', persona: '柳', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
                { id: 'c1', name: '蘇映雪', persona: '蘇', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            ],
            scenes: [
                { id: 's0', name: '後台前廊', privacyLevel: 1 },
                { id: 's1', name: '師姐妝閣', privacyLevel: 2 }, // reachable: no private-home gate
            ],
            bonds: bondsToJSON(g),
            roster: { c0: 's0', c1: 's1' },   // apart, at night
            homeByChar: { c0: 's0', c1: 's1' },
            workByChar: { c0: 's0', c1: 's1' },
            clock: makeClock(6, 4),           // 入夜
            wants,
        });
    }

    // WORRY + trusted confidant elsewhere ⇒ the pull names 蘇映雪.
    const worryAgent = new MoveRecorder();
    await runTick(pullWorld([mkWorry()], 0.5), deps(worryAgent), { log: () => {} });
    const liuHint = worryAgent.moveInputs.find((i) => i.name === '柳安春')?.rhythmHint ?? '';
    assert.match(liuHint, /蘇映雪/, 'the confide PULL draws 柳安春 toward her trusted confidant 蘇映雪');
    assert.match(liuHint, /心事|說道|尋/, 'the hint reads as a seek-counsel pull, not a generic rhythm');

    // CONTROL A — no worry: the pull never fires.
    const calmAgent = new MoveRecorder();
    await runTick(pullWorld([], 0.5), deps(calmAgent), { log: () => {} });
    assert.doesNotMatch(
        calmAgent.moveInputs.find((i) => i.name === '柳安春')?.rhythmHint ?? '',
        /蘇映雪/,
        'no worry ⇒ no confide pull toward the confidant',
    );

    // CONTROL B — a worry but NO trusted confidant (bond below known): the pull stays silent.
    const untrustedAgent = new MoveRecorder();
    await runTick(pullWorld([mkWorry()], 0.2), deps(untrustedAgent), { log: () => {} });
    assert.doesNotMatch(
        untrustedAgent.moveInputs.find((i) => i.name === '柳安春')?.rhythmHint ?? '',
        /蘇映雪/,
        'a worry without a trusted confidant (bond < known) ⇒ no confide pull',
    );
});
