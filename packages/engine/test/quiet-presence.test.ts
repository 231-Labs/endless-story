/**
 * 惰息存在 (quietPresence) — a lone character with nothing pressing and nobody seeking
 * them is QUIETED: the engine skips their ambient solo musing beat (no LLM call) instead
 * of spending a call on filler. Reactive solitude survives — a pressing want keeps them
 * on. Their breathing room is not lost but CONSOLIDATED: at day-end each quieted character
 * gets ONE first-person reflection (the otherwise-dormant povReflect), in place of the
 * scattered per-tick self-talk. Flag OFF ⇒ solo beats play as before. Measured with a
 * counting agent so the cost win (fewer actBeat calls) and the breath (povReflect fires)
 * are both concrete.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant } from '../src/core/want-core.ts';
import type { ArchivePort, PovReflectInput } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };

/** Counts the two calls that matter: actBeat (the expensive beat) + povReflect (the breath). */
class CountingAgent extends FakeSceneAgent {
    actBeatCalls = 0;
    povReflectCalls = 0;
    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        this.actBeatCalls += 1;
        return super.actBeat(input);
    }
    override async povReflect(input: PovReflectInput): Promise<string | null> {
        this.povReflectCalls += 1;
        return super.povReflect(input);
    }
}

const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** 甲(c0) and 乙(c1) each sit ALONE in their own public scene, each carrying ONE idle
 *  (heat 0) daily want aimed at no one — nothing pressing, nobody seeking. Genesis is
 *  pre-satisfied (source:'genesis') so the tick adds no hot wants. They never meet. */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'quiet',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 },
            { id: 's1', name: '後院', privacyLevel: 1 },
        ],
        roster: { c0: 's0', c1: 's1' }, // each alone
        homeByChar: { c0: 's0', c1: 's1' },
        workByChar: { c0: 's0', c1: 's1' },
        wants: [
            newWant({ id: 'w0', characterId: 'c0', layer: '日常', desc: '想睡個囫圇覺', weight: 0.3, sat: 0.5, resistance: 6, kind: 'narrative', source: 'genesis', bornTick: 0 }),
            newWant({ id: 'w1', characterId: 'c1', layer: '日常', desc: '想歇口氣', weight: 0.3, sat: 0.5, resistance: 6, kind: 'narrative', source: 'genesis', bornTick: 0 }),
        ],
        establishedPairs: [],
        edges: {},
        bonds: [],
        clock: makeClock(6, 0), // 清晨 day 1
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

test('flag OFF: two lone idlers each spend a solo musing beat (baseline cost)', async () => {
    const agent = new CountingAgent();
    const world = makeWorld();
    await runTick(world, deps(agent), { log: () => {} });
    assert.ok(agent.actBeatCalls >= 2, `both lone idlers mused — actBeat×${agent.actBeatCalls}`);
    assert.equal(world.data.dayAccum.quietedIds, undefined, 'nobody is quieted with the flag off');
});

test('flag ON: two lone idlers are quieted — zero beat calls, both recorded for the day', async () => {
    const agent = new CountingAgent();
    const world = makeWorld({ quietPresence: true });
    await runTick(world, deps(agent), { log: () => {} });
    assert.equal(agent.actBeatCalls, 0, 'both ambient-idle solo turns skipped — no LLM beat spent');
    assert.deepEqual([...new Set(world.data.dayAccum.quietedIds)].sort(), ['c0', 'c1'], 'both recorded as quieted');
});

test('flag ON: a lone character with a PRESSING want is NOT quieted (reactive solitude survives)', async () => {
    const agent = new CountingAgent();
    const world = makeWorld({ quietPresence: true });
    world.data.wants.find((w) => w.id === 'w0')!.heat = 20; // pressure ≫ resistance ⇒ past idle
    await runTick(world, deps(agent), { log: () => {} });
    assert.ok(agent.actBeatCalls >= 1, '甲 (pressing) still gets her beat');
    assert.ok(!(world.data.dayAccum.quietedIds ?? []).includes('c0'), '甲 was NOT quieted');
    assert.ok((world.data.dayAccum.quietedIds ?? []).includes('c1'), '乙 (still idle) WAS quieted');
});

test('flag ON: at day-end each quieted character gets ONE consolidated reflection (breath kept)', async () => {
    const agent = new CountingAgent();
    const world = makeWorld({ quietPresence: true });
    let dayEndReport;
    for (let t = 0; t < 6; t++) {
        world.data.clock = makeClock(6, t); // 清晨…深宵; t=5 深宵 ⇒ day-end
        dayEndReport = await runTick(world, deps(agent), { log: () => {} });
    }
    assert.equal(agent.actBeatCalls, 0, 'a whole idle day cost zero beat calls');
    assert.ok(agent.povReflectCalls >= 2, `each quieted character breathed once at day-end — povReflect×${agent.povReflectCalls}`);
    // the breath must PERSIST into the tick record POV channel (eventId 'quiet-reflect'),
    // else the export / reading UI could never surface it.
    const breaths = (dayEndReport?.eventPovs ?? []).filter((p) => p.eventId === 'quiet-reflect');
    assert.deepEqual(
        [...new Set(breaths.map((p) => p.characterId))].sort(),
        ['c0', 'c1'],
        'both quieted characters have a persisted reflection in the day-end record',
    );
    assert.ok(breaths.every((p) => p.body.trim().length > 0), 'each persisted reflection carries prose');
});
