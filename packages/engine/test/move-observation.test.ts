/**
 * 移步觀察 — the live-feed ordering guarantee behind the 拍流 fix. Moves are
 * published via TickOpts.onMoves the moment the movement phase closes, BEFORE
 * any scene beat plays, so a character's 行蹤 reads in true chronological order
 * (the move precedes the beats it leads to) instead of trailing the whole tick.
 * Pure roster diff; a tick with no move fires nothing.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant } from '../src/core/want-core.ts';
import type { ArchivePort, MoveDecideInput, MoveDecideResult } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };

/** Moves everyone who has an option to the FIRST offered scene (deterministic). */
class MovingAgent extends FakeSceneAgent {
    override async decideMove(input: MoveDecideInput): Promise<MoveDecideResult> {
        const first = input.options[0];
        return first ? { move: true, targetSceneId: first.sceneId, reason: 'test move' } : { move: false };
    }
}

function makeWorld(): WorldState {
    const base: WorldStateData = {
        sagaId: 'move-observation-test',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 },
            { id: 's1', name: '後臺', privacyLevel: 1 },
        ],
        roster: { c0: 's0', c1: 's0' },
        homeByChar: { c0: 's0', c1: 's0' },
        workByChar: { c0: 's1', c1: 's1' },
        wants: [
            newWant({ id: 'w0', characterId: 'c0', layer: '生', desc: '想把日子過下去', weight: 0.5, sat: 0.3, resistance: 3, kind: 'narrative', source: 'genesis', bornTick: 0 }),
        ],
        edges: {},
        bonds: [],
        establishedPairs: [],
        accessSeeded: true,
        clock: makeClock(6, 1), // day 1, 日午 (daytime — scenes play)
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState(base);
}

function deps() {
    return { agent: new MovingAgent(), recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() };
}

test('onMoves fires with the tick\'s committed moves, BEFORE any scene beat', async () => {
    const world = makeWorld();
    const order: string[] = [];
    let observedMoves: Array<{ characterId: string; fromSceneName: string; toSceneName: string }> = [];

    await runTick(world, deps(), {
        log: () => {},
        onMoves: (moves) => {
            order.push('moves');
            observedMoves = moves.map((m) => ({ characterId: m.characterId, fromSceneName: m.fromSceneName, toSceneName: m.toSceneName }));
        },
        onBeat: () => {
            order.push('beat');
        },
    });

    assert.ok(observedMoves.length >= 1, 'at least one move was observed');
    // Chronology: the moves batch is published before the first beat.
    assert.equal(order[0], 'moves', 'onMoves precedes every onBeat');
    // The observation names the true origin and destination.
    for (const m of observedMoves) {
        assert.ok(m.fromSceneName && m.toSceneName && m.fromSceneName !== m.toSceneName, 'a real transition');
    }
});

test('a no-move tick fires onMoves zero times', async () => {
    const world = makeWorld();
    let calls = 0;
    // Plain FakeSceneAgent stays put (decideMove ⇒ {move:false}).
    await runTick(world, { agent: new FakeSceneAgent(), recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() }, {
        log: () => {},
        onMoves: () => { calls += 1; },
    });
    assert.equal(calls, 0, 'no moves ⇒ no observation');
});
