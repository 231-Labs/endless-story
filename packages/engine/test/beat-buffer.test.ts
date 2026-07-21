/**
 * 文筆二階 v2 — the cross-scene per-character beat buffer (world.recentBeatsByChar).
 * The imagery-avoid window must span ticks/scenes: a character's verbal tic recurs
 * once-or-twice PER scene across days (江聞鶴「把勒頭帶往」in 5 different ticks of a
 * real run), which any single-scene window misses. This pins the plumbing: beats
 * accumulate into the buffer across ticks, bounded by CROSS_SCENE_BEAT_WINDOW, and
 * the buffer is deterministic (part of world.data, snapshot-safe). Pure FakeSceneAgent.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { CROSS_SCENE_BEAT_WINDOW } from '../src/core/scene-loop.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant } from '../src/core/want-core.ts';
import type { ArchivePort } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = () => ({ agent: new FakeSceneAgent(), recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** 甲(c0) and 乙(c1) share the public 前廳 all day — a 2-person scene plays each
 *  daytime tick, so the fake produces beats and the buffer fills across ticks. */
function makeWorld(): WorldState {
    const base: WorldStateData = {
        sagaId: 'beat-buffer',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [{ id: 's0', name: '前廳', privacyLevel: 1 }],
        roster: { c0: 's0', c1: 's0' },
        homeByChar: { c0: 's0', c1: 's0' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [
            newWant({ id: 'w0', characterId: 'c0', layer: '情', desc: '想與乙親近', target: 'c1', weight: 0.7, sat: 0.2, resistance: 3, kind: 'narrative', source: 'genesis', bornTick: 0 }),
            newWant({ id: 'w1', characterId: 'c1', layer: '情', desc: '想與甲說話', target: 'c0', weight: 0.7, sat: 0.2, resistance: 3, kind: 'narrative', source: 'genesis', bornTick: 0 }),
        ],
        edges: {},
        bonds: [],
        establishedPairs: [],
        accessSeeded: true,
        clock: makeClock(6, 1), // 日午 — daytime, scene plays
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState(base);
}

test('the per-character beat buffer accumulates ACROSS ticks (the cross-scene window)', async () => {
    const world = makeWorld();

    await runTick(world, deps(), { log: () => {} });
    const afterOne = world.data.recentBeatsByChar?.c0?.length ?? 0;
    assert.ok(afterOne > 0, 'a character who acted has beats buffered after tick 1');

    // Advance to the next daytime tick and run again — the buffer must GROW, i.e.
    // it carries tick 1's beats forward (cross-scene), not reset per scene.
    world.data.clock = makeClock(6, 7); // day 2, 日午 (still daytime)
    await runTick(world, deps(), { log: () => {} });
    const afterTwo = world.data.recentBeatsByChar?.c0?.length ?? 0;
    assert.ok(afterTwo > afterOne, 'the buffer spans ticks — tick 2 adds to tick 1, never resets');
});

test('the buffer is bounded by CROSS_SCENE_BEAT_WINDOW', async () => {
    const world = makeWorld();
    // Run many daytime ticks; the buffer must cap, never grow without limit.
    for (let day = 1; day <= 8; day++) {
        world.data.clock = makeClock(6, (day - 1) * 6 + 1); // 日午 each day
        await runTick(world, deps(), { log: () => {} });
    }
    for (const id of ['c0', 'c1']) {
        const len = world.data.recentBeatsByChar?.[id]?.length ?? 0;
        assert.ok(len > 0, `${id} accumulated beats`);
        assert.ok(len <= CROSS_SCENE_BEAT_WINDOW, `${id} buffer stays within the window (${len} ≤ ${CROSS_SCENE_BEAT_WINDOW})`);
    }
});
