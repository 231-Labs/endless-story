/**
 * 撞破 / 修羅場 — the jealous-intrude movement medium. Deterministic PLUMBING
 * tests (FakeSceneAgent, no LLM). At night a character carrying a ripe jealousy
 * want (妒/怨) aimed at someone mid-tryst in a private 2-person scene BARGES IN
 * uninvited — skipping the welcome gate AND capacity — to form the 3-person
 * confrontation nightSceneKind already recognises.
 *
 *   1. jealousNightPursuit returns the target for a ripe 妒/怨 want, else null;
 *   2. the intrude option is OFFERED into a genuine 撞破 (private full pair the
 *      mover isn't welcomed into), and NOT when the want isn't jealous / the
 *      target is alone / it's daytime (both bars stay in force);
 *   3. a scripted intrude take forms the confrontation: the jealous third arrives,
 *      the private scene now holds 3, nightSceneKind reads 'confrontation', it plays;
 *   4. backward-compat: a world with no jealousy wants offers no intrude option —
 *      the two bars are byte-for-byte unchanged (the full private home stays blocked).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { jealousNightPursuit, newWant, nightSceneKind, type Want } from '../src/core/want-core.ts';
import type { ArchivePort } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** A live want RIPE by default (heat past resistance ⇒ forcing != idle). */
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
        weight: over.weight ?? 0.8,
        sat: 0.2,
        resistance: over.resistance ?? 3,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
    });
    w.heat = over.heat ?? 4; // pressure 4 ≥ resistance 3 ⇒ edge (ripe)
    return w;
}

/**
 * 甲(c0) & 乙(c1) are the intimate PAIR mid-tryst in the private 西廂(s1) — a home
 * they share (so it is over-capacity AND un-welcomed to outsiders). 丙(c2) starts
 * in the public 前廳(s0). 甲 carries a love want toward 乙 so the pair qualifies as
 * a tryst (the confrontation's inner pair). Override wants/roster/clock per case.
 */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'intrude',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c2', name: '丙', persona: '丙', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 },
            { id: 's1', name: '西廂', privacyLevel: 3 }, // private tryst; 甲乙's shared home
            { id: 's2', name: '庭院', privacyLevel: 1 }, // a normal reachable public option
        ],
        roster: { c0: 's1', c1: 's1', c2: 's0' },
        homeByChar: { c0: 's1', c1: 's1', c2: 's0' },
        workByChar: { c0: 's0', c1: 's0', c2: 's0' },
        wants: [ripeWant({ characterId: 'c0', layer: '愛', desc: '想與乙廝守', target: 'c1' })],
        edges: {},
        bonds: [],
        establishedPairs: [],
        clock: makeClock(6, 4), // 入夜 — night
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

/** Records every decideMove input; optionally scripts one named mover to TAKE the
 *  offered intrude option (else everyone stays, so the pre-move world is inspected). */
class ScriptedMover extends FakeSceneAgent {
    inputs: CharacterAgentNs.MoveDecideInput[] = [];
    intruderName?: string;
    constructor(intruderName?: string) {
        super();
        this.intruderName = intruderName;
    }
    override async decideMove(input: CharacterAgentNs.MoveDecideInput): Promise<CharacterAgentNs.MoveDecideResult> {
        this.inputs.push(input);
        if (this.intruderName && input.name === this.intruderName) {
            const opt = input.options.find((o) => o.intrude === true);
            if (opt) return { move: true, targetSceneId: opt.sceneId, reason: '妒火中燒，撞破' };
        }
        return { move: false, reason: 'stay' };
    }
    optionsFor(name: string): CharacterAgentNs.MoveSceneOption[] {
        return this.inputs.find((i) => i.name === name)?.options ?? [];
    }
    situationFor(name: string): string | undefined {
        return this.inputs.find((i) => i.name === name)?.currentSituation;
    }
}

test('1) jealousNightPursuit returns a ripe 妒/怨 target, else null', () => {
    const resolve = (t: string) => (t === 'c0' || t === '甲' ? 'c0' : undefined);

    const jealous = ripeWant({ characterId: 'c2', layer: '妒', desc: '見不得那人得意', target: 'c0' });
    const hit = jealousNightPursuit([jealous], 'c2', resolve);
    assert.equal(hit?.id, 'c0', 'a ripe 妒 want points at its target');
    assert.equal(hit?.intrude, true, 'flagged as an intrusion');

    // 怨 (grudge) is also a JEALOUS_LAYER — resolves against the target NAME too.
    const grudge = ripeWant({ characterId: 'c2', layer: '怨', desc: '這口氣咽不下', target: '甲' });
    assert.equal(jealousNightPursuit([grudge], 'c2', resolve)?.id, 'c0', 'a 怨 want resolves by name');

    // Not ripe (idle) ⇒ no pursuit; a non-jealous (愛) want ⇒ never a jealous pursuit.
    const cold = ripeWant({ characterId: 'c2', layer: '妒', desc: '淡淡的醋意', target: 'c0', heat: 0 });
    assert.equal(jealousNightPursuit([cold], 'c2', resolve), null, 'an idle jealousy moves no feet');
    const love = ripeWant({ characterId: 'c2', layer: '愛', desc: '想挨近', target: 'c0' });
    assert.equal(jealousNightPursuit([love], 'c2', resolve), null, 'a love want is not a jealous pursuit');
});

test('2) the intrude option is offered into a genuine 撞破, and only then', async () => {
    // MAIN: 丙 carries a ripe 妒 aimed at 甲, who is mid-tryst with 乙 in the private,
    // full, un-welcomed 西廂 → the scene is offered to 丙 flagged intrude, and the
    // pull line surfaces.
    const agent = new ScriptedMover(); // nobody moves — inspect the pre-move offer
    await runTick(
        makeWorld({
            wants: [
                ripeWant({ characterId: 'c0', layer: '愛', desc: '想與乙廝守', target: 'c1' }),
                ripeWant({ characterId: 'c2', layer: '妒', desc: '見不得甲與旁人親近', target: 'c0' }),
            ],
        }),
        deps(agent),
        { log: () => {} },
    );
    const bing = agent.optionsFor('丙');
    const tryst = bing.find((o) => o.sceneId === 's1');
    assert.ok(tryst, '丙 is offered the private tryst scene DESPITE the full-capacity, un-welcomed home');
    assert.equal(tryst?.intrude, true, 'the offered tryst scene is flagged as an intrusion');
    assert.match(agent.situationFor('丙') ?? '', /撞破/, 'the 撞破 pull surfaces in 丙 的 currentSituation');

    // CONTROL A — 丙's hot want is love, not jealousy: no intrude, and the full
    // private home stays blocked by both bars (not an option at all).
    const loveAgent = new ScriptedMover();
    await runTick(
        makeWorld({
            wants: [
                ripeWant({ characterId: 'c0', layer: '愛', desc: '想與乙廝守', target: 'c1' }),
                ripeWant({ characterId: 'c2', layer: '愛', desc: '想挨近甲', target: 'c0' }),
            ],
        }),
        deps(loveAgent),
        { log: () => {} },
    );
    assert.equal(loveAgent.optionsFor('丙').some((o) => o.intrude), false, 'a love want offers no intrude option');
    assert.equal(loveAgent.optionsFor('丙').some((o) => o.sceneId === 's1'), false, 'the full private home stays blocked by both bars');

    // CONTROL B — the target 甲 is ALONE (乙 is elsewhere): not a pair ⇒ no intrude.
    const aloneAgent = new ScriptedMover();
    await runTick(
        makeWorld({
            roster: { c0: 's1', c1: 's2', c2: 's0' }, // 乙 moved out of 西廂
            wants: [ripeWant({ characterId: 'c2', layer: '妒', desc: '見不得甲得意', target: 'c0' })],
        }),
        deps(aloneAgent),
        { log: () => {} },
    );
    assert.equal(aloneAgent.optionsFor('丙').some((o) => o.intrude), false, 'a target who is alone is no 撞破');

    // CONTROL C — DAYTIME: night gate off ⇒ no intrude even with a ripe jealousy.
    const dayAgent = new ScriptedMover();
    await runTick(
        makeWorld({
            clock: makeClock(6, 1), // 日午 — not night
            wants: [
                ripeWant({ characterId: 'c0', layer: '愛', desc: '想與乙廝守', target: 'c1' }),
                ripeWant({ characterId: 'c2', layer: '妒', desc: '見不得甲得意', target: 'c0' }),
            ],
        }),
        deps(dayAgent),
        { log: () => {} },
    );
    assert.equal(dayAgent.optionsFor('丙').some((o) => o.intrude), false, 'by day the intrude never fires');
});

test('3) a scripted intrude take forms the 3-person confrontation, and it plays', async () => {
    const world = makeWorld({
        wants: [
            ripeWant({ characterId: 'c0', layer: '愛', desc: '想與乙廝守', target: 'c1' }),
            ripeWant({ characterId: 'c2', layer: '妒', desc: '見不得甲與旁人親近', target: 'c0' }),
        ],
    });
    // The setup — 甲愛乙 as the inner pair + jealous 丙→甲 as the third — IS a
    // confrontation the moment the trio is co-present (classified on routing-time
    // wants, before the scene-loop plays and mutates them).
    const trio = ['c0', 'c1', 'c2'].map((id) => ({ id, name: world.nameById(id) }));
    assert.equal(nightSceneKind(trio, 3, world.data.wants), 'confrontation', 'the trio is a 撞破 confrontation setup');

    const agent = new ScriptedMover('丙'); // 丙 takes the intrude option
    const seen: string[] = [];
    const report = await runTick(world, deps(agent), { log: () => {}, onBeat: (o) => seen.push(o.sceneId) });

    // 丙 barged in: the private tryst now holds all three, and the confrontation played.
    assert.equal(world.data.roster.c2, 's1', '丙 moved into the tryst');
    const occupants = world.data.cast.filter((m) => world.data.roster[m.id] === 's1').map((m) => m.id);
    assert.deepEqual(occupants.sort(), ['c0', 'c1', 'c2'], 'the pair’s private scene now has 3');
    assert.ok(report.beats > 0 && seen.includes('s1'), 'the confrontation survived the night cull and played');
});

test('4) backward-compat: no jealousy want ⇒ no intrude option, both bars unchanged', async () => {
    const agent = new ScriptedMover();
    await runTick(
        makeWorld({
            // Only the pair's love want — 丙 carries no jealousy at all.
            wants: [ripeWant({ characterId: 'c0', layer: '愛', desc: '想與乙廝守', target: 'c1' })],
        }),
        deps(agent),
        { log: () => {} },
    );
    const bing = agent.optionsFor('丙');
    assert.equal(bing.some((o) => o.intrude), false, 'no jealousy ⇒ no intrude option anywhere');
    assert.equal(bing.some((o) => o.sceneId === 's1'), false, 'the full private home stays blocked (capacity + welcome intact)');
    assert.equal(bing.some((o) => o.sceneId === 's2'), true, 'the normal public option is still offered (bars byte-for-byte unchanged)');
});
