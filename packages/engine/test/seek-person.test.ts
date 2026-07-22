/**
 * 尋人掛心 (seek_person routing) — the open-action label that used to be a no-op.
 * Deterministic PLUMBING tests (FakeSceneAgent, no LLM). A `seek_person` action
 * with a resolvable target RECORDS a persistent intention (`w.seeking`), which the
 * movement phase then ROUTES as a SOFT pull only (decideMove stays the single
 * movement authority; options/bars untouched): target co-present ⇒ the intention
 * is MET and the entry clears; target's scene among the offered options ⇒ a
 * salient reminder pull in currentSituation; unreachable ⇒ the pull counsels
 * waiting. At day-end an intention older than 3 full days lapses into a party-
 * PRIVATE scheduled percept (the same channel the 叩門 refusal rides).
 * 尋人有路 已畢業為常駐（不再由旗標控制、永遠常開）。
 *
 *   1. parse→record: a seek_person action with a resolvable (by-name) target
 *      writes w.seeking + logs the [尋人] record line;
 *   2. seeking + target visible in the offered options ⇒ the pull line appears in
 *      that mover's decideMove currentSituation; other movers unaffected;
 *   3. seeking + target co-present ⇒ the entry clears (尋著了), no pull;
 *   4. expiry: an entry 3+ full days old clears at day-end + the private memory
 *      percept is emitted; a fresher entry keeps waiting (跨拍守候);
 *   5. no active seeking ⇒ decideMove inputs byte-identical to an empty seeking
 *      map (an idle seek adds nothing).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import type { ArchivePort, ChooseActionInput, ChooseActionResult } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/**
 * 甲(c0) is the seeker in the public 前廳(s0). 乙(c1) sits in the private 西廂(s1)
 * — 乙's own home (甲 holds no key: canEnter false) — unless the roster override
 * moves TA. 庭院(s2) is a normal public option. No wants are seeded (day-tick
 * genesis derives deterministic fakes) so no knock/intrude machinery stirs.
 * Override seeking/roster/clock/flags per case.
 */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'seek-person',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c2', name: '丙', persona: '丙', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 }, // public — 甲's home/work
            { id: 's1', name: '西廂', privacyLevel: 3, capacity: 3 }, // private; 乙's home
            { id: 's2', name: '庭院', privacyLevel: 1 }, // a normal reachable public option
        ],
        roster: { c0: 's0', c1: 's1', c2: 's0' },
        homeByChar: { c0: 's0', c1: 's1', c2: 's0' },
        workByChar: { c0: 's0', c1: 's1', c2: 's0' },
        wants: [],
        edges: {},
        bonds: [],
        establishedPairs: [],
        clock: makeClock(6, 1), // 日午 — a daytime tick (movement offers real options)
        accessSeeded: true,
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

/** Records every decideMove input so a mover's pre-move offer (options + the
 *  injected currentSituation pulls) can be inspected. Never moves — entries
 *  persist across the tick unless the tick itself clears them. */
class RecordingMover extends FakeSceneAgent {
    inputs: CharacterAgentNs.MoveDecideInput[] = [];
    override async decideMove(input: CharacterAgentNs.MoveDecideInput): Promise<CharacterAgentNs.MoveDecideResult> {
        this.inputs.push(input);
        return { move: false, reason: 'stay' };
    }
    situationFor(name: string): string | undefined {
        return this.inputs.find((i) => i.name === name)?.currentSituation;
    }
}

/** RecordingMover + a pinned open action: 甲 declares a seek_person aimed at 乙
 *  BY NAME (the resolution path the port documents); everyone else stays on
 *  personal business. Drives the REAL parse→record path through tick §2.7. */
class SeekingActor extends RecordingMover {
    override async chooseAction(input: ChooseActionInput): Promise<ChooseActionResult> {
        if (input.name === '甲') return { kind: 'seek_person', target: '乙', prose: '我尋個空，去找乙說幾句話。' };
        return { kind: 'personal', prose: '我自理自家的事。' };
    }
}

test('1) parse→record: a seek_person action writes w.seeking (尋人有路已常駐)', async () => {
    const world = makeWorld({ emergentProduction: true });
    const logs: string[] = [];
    await runTick(world, deps(new SeekingActor()), { log: (line) => logs.push(line) });
    assert.deepEqual(
        world.data.seeking,
        { c0: { targetId: 'c1', sinceTick: 1 } },
        'the by-name target resolved to its cast id and the intention was recorded with its tick',
    );
    assert.ok(logs.some((line) => line.includes('[尋人]') && line.includes('打定主意')), 'the 逐拍紀事 carries the [尋人] record line');
});

test('2) seeking + target visible in the options ⇒ the pull appears in that mover alone', async () => {
    // 乙 stands in the public 庭院(s2) — a legally offered destination for 甲.
    const agent = new RecordingMover();
    const world = makeWorld({
        seeking: { c0: { targetId: 'c1', sinceTick: 0 } },
        roster: { c0: 's0', c1: 's2', c2: 's0' },
    });
    await runTick(world, deps(agent), { log: () => {} });

    const jia = agent.situationFor('甲') ?? '';
    assert.match(jia, /你先前打定主意要去尋乙/, '甲的 currentSituation carries the standing intention');
    assert.match(jia, /此刻他在庭院/, 'the pull names where the sought one can be found');
    assert.doesNotMatch(agent.situationFor('乙') ?? '', /打定主意/, 'the sought one hears nothing of it');
    assert.doesNotMatch(agent.situationFor('丙') ?? '', /打定主意/, 'a bystander hears nothing of it');
    assert.ok(world.data.seeking?.c0, 'not yet met ⇒ the intention keeps waiting across ticks (跨拍守候)');
});

test('3) seeking + target co-present ⇒ the entry clears (尋著了), no pull', async () => {
    const agent = new RecordingMover();
    const world = makeWorld({
        seeking: { c0: { targetId: 'c1', sinceTick: 0 } },
        roster: { c0: 's0', c1: 's0', c2: 's0' }, // 乙 shares 甲's scene already
    });
    const logs: string[] = [];
    await runTick(world, deps(agent), { log: (line) => logs.push(line) });

    assert.equal(world.data.seeking?.c0, undefined, 'met face to face ⇒ the intention is fulfilled and cleared');
    assert.doesNotMatch(agent.situationFor('甲') ?? '', /打定主意/, 'no pull once the seek is met');
    assert.ok(logs.some((line) => line.includes('[尋人]') && line.includes('尋著了')), 'the 逐拍紀事 carries the [尋人] met line');
});

test('4) expiry: a 3+ day old entry clears at day-end + the private memory percept lands; a fresh one waits on', async () => {
    const agent = new RecordingMover();
    // 深宵 of day 4 (tick 23, dayEnd). 甲's entry is from day 1 (tick 2): 21 ticks
    // ≥ 3 full days ⇒ lapses. 丙's entry is from this very day (tick 20) ⇒ waits.
    const world = makeWorld({
        seeking: { c0: { targetId: 'c1', sinceTick: 2 }, c2: { targetId: 'c1', sinceTick: 20 } },
        clock: makeClock(6, 23),
    });
    const logs: string[] = [];
    await runTick(world, deps(agent), { log: (line) => logs.push(line) });

    assert.equal(world.data.seeking?.c0, undefined, 'the stale intention lapsed at day-end');
    assert.deepEqual(world.data.seeking?.c2, { targetId: 'c1', sinceTick: 20 }, 'the fresh intention keeps waiting');
    const memory = (world.data.scheduledEvents ?? []).find((s) => s.id === 'seek-expired-c0-t23');
    assert.ok(memory, 'the letting-go rides the scheduledEvents channel (same as the 叩門 refusal)');
    assert.equal(memory!.visibility, 'private', 'party-private — never public canon');
    assert.deepEqual(memory!.witnessIds, ['c0'], 'only the seeker keeps the moment');
    assert.match(memory!.text, /總想去尋乙/, 'the memory names who was sought');
    assert.match(memory!.text, /終究沒碰上/, 'the memory records that they never crossed paths');
    assert.ok(logs.some((line) => line.includes('[尋人]') && line.includes('沒尋著')), 'the 逐拍紀事 carries the lapse');
});

test('5) no active seeking ⇒ decideMove inputs byte-identical to an empty seeking map (idle adds nothing)', async () => {
    const plain = new RecordingMover();
    const idle = new RecordingMover();
    await runTick(makeWorld(), deps(plain), { log: () => {} }); // no seeking field
    await runTick(makeWorld({ seeking: {} }), deps(idle), { log: () => {} }); // an empty seeking map
    assert.equal(plain.inputs.length > 0, true, 'the movement phase actually ran');
    assert.equal(
        JSON.stringify(idle.inputs),
        JSON.stringify(plain.inputs),
        'an idle seek map adds not one byte to any mover offer',
    );
});

// ── anti-spin guards (measured from a real run: 白韻秋 declared 去尋X 6× / 尋著 5× in 15 拍) ──

test('6) seek_person for an ALREADY co-present target records nothing (that心意 belongs in the beat)', async () => {
    // 乙 already stands with 甲 in 前廳 — 「去尋」 a person right here is a non-move.
    const world = makeWorld({ emergentProduction: true, roster: { c0: 's0', c1: 's0', c2: 's0' } });
    const logs: string[] = [];
    await runTick(world, deps(new SeekingActor()), { log: (line) => logs.push(line) });
    assert.equal(world.data.seeking?.c0, undefined, 'no 掛心 recorded for someone already present');
    assert.ok(logs.some((l) => l.includes('action noop: seek_person') && l.includes('已同處')), 'logged as a co-present no-op');
    assert.ok(!logs.some((l) => l.includes('[尋人]') && l.includes('打定主意')), 'no spurious 尋人 declaration line');
});

test('7) re-declaring the SAME seek preserves sinceTick (expiry clock survives) and spams no line', async () => {
    // 甲 is ALREADY seeking 乙 (since tick 0); 乙 sits unreachable in the private 西廂,
    // so the movement phase can neither meet nor clear it. Re-declaring must be inert.
    const world = makeWorld({
        emergentProduction: true,
        seeking: { c0: { targetId: 'c1', sinceTick: 0 } },
    });
    const logs: string[] = [];
    await runTick(world, deps(new SeekingActor()), { log: (line) => logs.push(line) }); // 日午, tick 1
    assert.deepEqual(
        world.data.seeking?.c0,
        { targetId: 'c1', sinceTick: 0 },
        'the original sinceTick is preserved — re-declaring never resets the 3-day expiry',
    );
    assert.ok(logs.some((l) => l.includes('action noop: seek_person') && l.includes('續尋')), 'logged as a continue-seeking no-op');
    assert.ok(!logs.some((l) => l.includes('[尋人]') && l.includes('打定主意')), 'no second 打定主意 line for a target already being sought');
});
