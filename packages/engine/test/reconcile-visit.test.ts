/**
 * 叩門夜訪 (knock-visit) — the yearning night-knock movement medium.
 * Deterministic PLUMBING tests (FakeSceneAgent, no LLM). Uses 撞破's TARGETING but
 * NOT its license: at night a character carrying a ripe (edge+) 愛/虧欠 want (love /
 * unsettled debt) aimed at someone who is HOME ALONE in a private scene may walk to
 * that door and KNOCK (求見) — the option is emitted despite the 訪問權限 key gate
 * barring entry, but it carries NO entry: admission is the OCCUPANT's one-time 放行
 * (decideAdmit → grantAccess oneTime, consumed on entry), never the visitor's ardor.
 * An absent decideAdmit seat ⇒ deterministic REFUSE — the door stays shut, the move
 * is spent, and both sides keep the moment as party-private scheduled percepts.
 * 叩門夜訪 已畢業為常駐（不再由旗標控制、永遠常開）。
 *
 *   1. yearningNightPursuit returns intrude:true for a ripe (edge+) 愛/虧欠 want,
 *      and NOT for a cold one (below edge it only SEEKS, welcome-gated);
 *   3. seat ABSENT ⇒ the knock option IS offered (marked knock:true) and choosing
 *      it REFUSES by default: no move, no access grant, refuse percepts recorded
 *      for BOTH sides (scheduledEvents) + the 逐拍 [叩門] log line;
 *   4. seat ADMITS ⇒ a one-time 放行 is granted and CONSUMED on entry in the same
 *      tick: the mover's roster becomes the home, no lingering oneTime;
 *   5. the target is NOT alone (occupancy 2) ⇒ no knock option: the occupancy===1
 *      gate rejects a pair (a 撞破 setup, not a 叩門).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant, yearningNightPursuit, type Want } from '../src/core/want-core.ts';
import type { AdmitDecideInput, AdmitDecideReply, ArchivePort } from '../src/ports.ts';
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
            { id: 's1', name: '西廂', privacyLevel: 3, capacity: 3 }, // private; 乙's home (capacity 3 so occupancy 2 is NOT capped — isolates the knock gate)
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
        // The 訪問權限 first-tick seeding would hand 甲 (a live-愛 suitor of the
        // owner 乙) a oneTime 領入 pass AFTER movement — an unrelated, pre-existing
        // seam. Mark the world as already seeded so every grant observed in these
        // tests can come ONLY from the knock resolution (放行 or nothing).
        accessSeeded: true,
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

/** Records every decideMove input so the pre-move offer to a mover can be
 *  inspected — and CHOOSES a knock option whenever one is offered, so the
 *  knock-resolution path (refuse-by-default / admit) actually exercises. Has NO
 *  decideAdmit seat, so the tick's deterministic default (REFUSE) applies. */
class RecordingMover extends FakeSceneAgent {
    inputs: CharacterAgentNs.MoveDecideInput[] = [];
    override async decideMove(input: CharacterAgentNs.MoveDecideInput): Promise<CharacterAgentNs.MoveDecideResult> {
        this.inputs.push(input);
        const knock = input.options.find((option) => option.knock);
        if (knock) return { move: true, targetSceneId: knock.sceneId, reason: '去叩乙的門' };
        return { move: false, reason: 'stay' };
    }
    optionsFor(name: string): CharacterAgentNs.MoveSceneOption[] {
        return this.inputs.find((i) => i.name === name)?.options ?? [];
    }
    situationFor(name: string): string | undefined {
        return this.inputs.find((i) => i.name === name)?.currentSituation;
    }
}

/** RecordingMover + the occupant's 放行 seat: admits the knocker with one line
 *  through the door (the ONLY consent path — never the visitor's desire). */
class AdmittingMover extends RecordingMover {
    admitInputs: AdmitDecideInput[] = [];
    async decideAdmit(input: AdmitDecideInput): Promise<AdmitDecideReply | null> {
        this.admitInputs.push(input);
        return { admit: true, line: '進來吧' };
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

test('3) 叩門常駐: no decideAdmit seat ⇒ the knock is offered, chosen — and REFUSED by default', async () => {
    const agent = new RecordingMover(); // no decideAdmit ⇒ the tick's conservative default: the door stays shut
    const world = makeWorld();
    const logs: string[] = [];
    await runTick(world, deps(agent), { log: (line) => logs.push(line) });

    // The knock option WAS offered — marked knock, never intrude — with the pull.
    const jia = agent.optionsFor('甲');
    const home = jia.find((o) => o.sceneId === 's1');
    assert.ok(home, '甲 is offered 乙的私宅 to KNOCK on, despite holding no key (canEnter false)');
    assert.equal(home?.knock, true, 'the offered home-alone scene is flagged as a knock');
    assert.equal(home?.intrude, undefined, 'a 叩門 option is a knock, never a 撞破');
    assert.match(agent.situationFor('甲') ?? '', /叩門/, 'the 叩門 pull surfaces in 甲的 currentSituation');

    // Chosen — but the occupant never opened: no move, no grant of any kind.
    assert.equal(world.data.roster.c0, 's0', '甲 stays where she was — refused at the door, the roster never changes');
    assert.equal(world.canEnter('c0', 's1'), false, 'no access of any kind was granted to the refused knocker');
    assert.equal(world.keysHeldBy('c0').length, 0, 'no oneTime/standing key appeared for 甲');

    // BOTH sides keep the moment: party-private scheduled percepts + the 逐拍 log.
    const scheduled = world.data.scheduledEvents ?? [];
    const moverSide = scheduled.find((s) => s.witnessIds.length === 1 && s.witnessIds[0] === 'c0');
    const occupantSide = scheduled.find((s) => s.witnessIds.length === 1 && s.witnessIds[0] === 'c1');
    assert.ok(moverSide, 'the knocker gets a private percept of the shut door');
    assert.match(moverSide!.text, /叩了/, 'the mover-side line records the knock');
    assert.match(moverSide!.text, /門沒開/, 'the mover-side line records the refusal');
    assert.ok(occupantSide, 'the occupant gets a private percept of the knock they did not answer');
    assert.match(occupantSide!.text, /你沒有開門/, 'the occupant-side line records their own refusal');
    assert.equal(moverSide!.visibility, 'private', 'the refusal is party-private, never public canon');
    assert.ok(logs.some((line) => line.includes('叩門') && line.includes('沒有開門')), 'the 逐拍紀事 carries the [叩門] refusal line');
});

test('4) 叩門常駐: the occupant ADMITS ⇒ one-time 放行 granted AND consumed on entry', async () => {
    const agent = new AdmittingMover();
    const world = makeWorld();
    const logs: string[] = [];
    await runTick(world, deps(agent), { log: (line) => logs.push(line) });

    // The occupant (乙) — not the knocker — was asked, with the knocker as 乙 knows them.
    assert.equal(agent.admitInputs.length, 1, 'exactly one knock reached the occupant');
    assert.equal(agent.admitInputs[0].occupantName, '乙', 'the OCCUPANT decides — consent lives behind the door');
    assert.equal(agent.admitInputs[0].knockerName, '甲', 'the occupant hears the knocker as they know them');

    // Admitted ⇒ the move committed through the normal path.
    assert.equal(world.data.roster.c0, 's1', '放行 ⇒ 甲 enters 乙的西廂');
    assert.ok(logs.some((line) => line.includes('放行')), 'the move: line records 叩門/放行 in the 逐拍紀事');

    // The one-time pass was granted AND consumed on entry — nothing lingers.
    assert.equal(world.keysHeldBy('c0').length, 0, 'no lingering oneTime for s1 — granted then consumed on this entry');
    assert.equal(world.canEnter('c0', 's1'), false, 'the pass is spent: 甲 could not walk in again tomorrow');
    assert.ok(logs.some((line) => line.includes('用掉一次')), 'the [門] line proves consumeOneTime fired exactly on entry');
});

test('5) 叩門常駐: the target is NOT alone (occupancy 2) ⇒ no knock option', async () => {
    // 丙 joins 乙 in the private 西廂 → occupancy 2. capacity 3 leaves the capacity bar
    // OPEN, so any offer of s1 could only come from the knock emission — which the
    // occupancy===1 gate must refuse (a pair is a 撞破 setup, not a 叩門).
    const agent = new RecordingMover();
    await runTick(
        makeWorld({ roster: { c0: 's0', c1: 's1', c2: 's1' } }),
        deps(agent),
        { log: () => {} },
    );
    const jia = agent.optionsFor('甲');
    assert.equal(jia.some((o) => o.knock), false, 'a target who is NOT home alone is no 叩門');
    assert.equal(jia.some((o) => o.sceneId === 's1'), false, 'the occupied private home stays blocked (no key, occupancy≠1)');
});
