/**
 * 登門修好 (reconcile-visit) — the yearning night-visit movement medium.
 * Deterministic PLUMBING tests (FakeSceneAgent, no LLM). PARALLEL to 撞破 but for
 * RECONCILIATION, not jealousy: at night a character carrying a ripe (edge+) 愛/虧欠
 * want (love / unsettled debt) aimed at someone who is HOME ALONE in a private
 * scene may go UNINVITED — skipping the 訪問權限 key gate AND capacity — so the pair
 * can form and 把話說開/了結虧欠. Gated behind world.data.reconcileVisit (default OFF).
 *
 *   1. yearningNightPursuit returns intrude:true for a ripe (edge+) 愛/虧欠 want,
 *      and NOT for a cold one (below edge it only SEEKS, welcome-gated);
 *   2. flag OFF ⇒ the home-alone private home is NOT offered (canEnter false, no
 *      visit bypass) — the two bars are byte-for-byte unchanged (backward compat);
 *   3. flag ON ⇒ the home-alone private home IS offered, marked visit:true, DESPITE
 *      the mover holding no key — and the 登門 pull surfaces in currentSituation;
 *   4. flag ON but the target is NOT alone (occupancy 2) ⇒ no visit option: the
 *      occupancy===1 gate rejects a pair (a 撞破, not a 登門).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant, yearningNightPursuit, type Want } from '../src/core/want-core.ts';
import type { ArchivePort } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** A live want RIPE by default (heat past resistance ⇒ forcing != idle → edge). */
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
    w.heat = over.heat ?? 4; // pressure 4 ≥ resistance 3 ⇒ edge (ripe, intrude-willing)
    return w;
}

/**
 * 甲(c0) is the yearner, standing in the public 前廳(s0). 乙(c1) is HOME ALONE in the
 * private 西廂(s1) — 乙's own home (so 甲 holds no key: canEnter false). 甲 carries a
 * ripe 愛 want toward 乙 (a would-be reconciliation, not jealousy). 庭院(s2) is a
 * normal public option. Override wants/roster/clock/flag per case.
 */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'reconcile-visit',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c2', name: '丙', persona: '丙', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 }, // public — 甲's home/work
            { id: 's1', name: '西廂', privacyLevel: 3, capacity: 3 }, // private; 乙's home (capacity 3 so occupancy 2 is NOT capped — isolates the visit gate)
            { id: 's2', name: '庭院', privacyLevel: 1 }, // a normal reachable public option
        ],
        roster: { c0: 's0', c1: 's1', c2: 's0' }, // 甲 public, 乙 home ALONE, 丙 elsewhere
        homeByChar: { c0: 's0', c1: 's1', c2: 's0' },
        workByChar: { c0: 's0', c1: 's1', c2: 's0' },
        wants: [ripeWant({ characterId: 'c0', layer: '愛', desc: '想與乙重修舊好', target: 'c1' })],
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

/** Records every decideMove input so the pre-move offer to a mover can be inspected. */
class RecordingMover extends FakeSceneAgent {
    inputs: CharacterAgentNs.MoveDecideInput[] = [];
    override async decideMove(input: CharacterAgentNs.MoveDecideInput): Promise<CharacterAgentNs.MoveDecideResult> {
        this.inputs.push(input);
        return { move: false, reason: 'stay' };
    }
    optionsFor(name: string): CharacterAgentNs.MoveSceneOption[] {
        return this.inputs.find((i) => i.name === name)?.options ?? [];
    }
    situationFor(name: string): string | undefined {
        return this.inputs.find((i) => i.name === name)?.currentSituation;
    }
}

test('1) yearningNightPursuit flags a ripe (edge+) 愛/虧欠 want as intrude, a cold one not', () => {
    const resolve = (t: string) => (t === 'c1' || t === '乙' ? 'c1' : undefined);

    // A ripe love want (edge) is willing to go uninvited — intrude:true.
    const love = ripeWant({ characterId: 'c0', layer: '愛', desc: '想與乙重修舊好', target: 'c1' });
    const hit = yearningNightPursuit([love], 'c0', resolve);
    assert.equal(hit?.id, 'c1', 'a ripe 愛 want points at its target');
    assert.equal(hit?.intrude, true, 'ripe (edge+) ⇒ willing to go uninvited');

    // 虧欠 (an unsettled debt) is a RECKON_LAYER want — also eligible, by NAME too.
    const debt = ripeWant({ characterId: 'c0', layer: '虧欠', desc: '欠乙一句道歉', target: '乙' });
    assert.equal(yearningNightPursuit([debt], 'c0', resolve)?.intrude, true, 'a ripe 虧欠 want resolves by name and is intrude-willing');

    // A COLD want still SEEKS (bond yearn) but is welcome-gated — never intrude.
    const cold = ripeWant({ characterId: 'c0', layer: '愛', desc: '一點淡淡的念想', target: 'c1', heat: 0 });
    assert.notEqual(yearningNightPursuit([cold], 'c0', resolve)?.intrude, true, 'below edge ⇒ NOT intrude (welcome-gated)');
});

test('2) flag OFF ⇒ the home-alone private home is NOT offered (both bars unchanged)', async () => {
    const agent = new RecordingMover();
    await runTick(makeWorld(), deps(agent), { log: () => {} }); // reconcileVisit unset ⇒ falsy
    const jia = agent.optionsFor('甲');
    assert.equal(jia.some((o) => o.visit), false, 'no visit marker anywhere with the flag off');
    assert.equal(jia.some((o) => o.sceneId === 's1'), false, '乙的私宅 stays blocked (no key, no visit bypass)');
    assert.equal(jia.some((o) => o.sceneId === 's2'), true, 'the normal public option is still offered (bars byte-for-byte unchanged)');
});

test('3) flag ON ⇒ the home-alone private home IS offered, marked visit, despite no key', async () => {
    const agent = new RecordingMover();
    await runTick(makeWorld({ reconcileVisit: true }), deps(agent), { log: () => {} });
    const jia = agent.optionsFor('甲');
    const home = jia.find((o) => o.sceneId === 's1');
    assert.ok(home, '甲 is offered 乙的私宅 DESPITE holding no key (canEnter false)');
    assert.equal(home?.visit, true, 'the offered home-alone scene is flagged as a reconcile-visit');
    assert.equal(home?.intrude, undefined, 'a 登門 option is a visit, never a 撞破');
    assert.match(agent.situationFor('甲') ?? '', /登門/, 'the 登門 pull surfaces in 甲的 currentSituation');
});

test('4) flag ON but the target is NOT alone (occupancy 2) ⇒ no visit option', async () => {
    // 丙 joins 乙 in the private 西廂 → occupancy 2. capacity 3 leaves the capacity bar
    // OPEN, so any offer of s1 could only come from the visit bypass — which the
    // occupancy===1 gate must refuse (a pair is a 撞破 setup, not a 登門).
    const agent = new RecordingMover();
    await runTick(
        makeWorld({ reconcileVisit: true, roster: { c0: 's0', c1: 's1', c2: 's1' } }),
        deps(agent),
        { log: () => {} },
    );
    const jia = agent.optionsFor('甲');
    assert.equal(jia.some((o) => o.visit), false, 'a target who is NOT home alone is no 登門');
    assert.equal(jia.some((o) => o.sceneId === 's1'), false, 'the occupied private home stays blocked (no key, occupancy≠1)');
});
