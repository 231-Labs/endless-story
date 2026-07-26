/**
 * 還願 — the temple loop's second half. A prayer spoken at a temple (#33) whose
 * driving want has since TRULY resolved (judge-resolved: retired + resolvedTick,
 * note not a fade-out; a 限期 foreclosure writes no resolvedTick and never counts)
 * is FULFILLED the moment its pray-er stands in a temple again: the 願籤 gains
 * fulfilledDay/Tick and the pray-er keeps a private memory. No flag — additive,
 * inert without prayers.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant, type Want } from '../src/core/want-core.ts';
import type { ArchivePort } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = () => ({ agent: new FakeSceneAgent(), recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

function resolvedWant(note: string): Want {
    const w = newWant({
        characterId: 'c0',
        layer: '愛',
        desc: '想與乙把話說開',
        target: 'c1',
        weight: 0.8,
        sat: 0.2,
        resistance: 3,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
    });
    w.retired = true;
    w.resolvedTick = 3;
    w.resolvedNote = note;
    return w;
}

function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'prayer-fulfil-test',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 },
            { id: 's1', name: '觀音堂', privacyLevel: 1 }, // TEMPLE_NAME_RE matches 觀音
        ],
        roster: { c0: 's1', c1: 's0' }, // 甲 stands IN the temple
        homeByChar: { c0: 's0', c1: 's0' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [resolvedWant('話說開了，兩下釋然')],
        prayers: [{
            id: 'p1',
            characterId: 'c0',
            name: '甲',
            day: 1,
            tick: 1,
            sceneId: 's1',
            sceneName: '觀音堂',
            text: '求菩薩讓我把那句話說出口。',
            wantDesc: '想與乙把話說開',
        }],
        edges: {},
        bonds: [],
        establishedPairs: [],
        accessSeeded: true,
        clock: makeClock(6, 1),
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

test('a truly-resolved prayed-for want fulfils the vow when the pray-er stands in a temple', async () => {
    const world = makeWorld();
    await runTick(world, deps(), { log: () => {} });
    const p = world.data.prayers![0];
    assert.ok(p.fulfilledTick !== undefined, 'the vow is fulfilled');
    assert.equal(p.fulfilledDay, world.data.clock.day, 'the fulfil day is stamped');
    assert.ok(
        (world.data.scheduledEvents ?? []).some((e) => e.witnessIds.includes('c0') && e.text.includes('還了那樁願')),
        'the pray-er keeps a private memory of the fulfilment',
    );

    // Idempotent: a second tick does not duplicate the memory.
    const eventsBefore = (world.data.scheduledEvents ?? []).filter((e) => e.id.startsWith('prayer-fulfilled')).length;
    await runTick(world, deps(), { log: () => {} });
    const eventsAfter = (world.data.scheduledEvents ?? []).filter((e) => e.id.startsWith('prayer-fulfilled')).length;
    assert.equal(eventsAfter, eventsBefore, 'fulfilment happens exactly once');
});

test('a faded want does not fulfil; away from the temple nothing happens', async () => {
    // Fade-out note ⇒ the vow stays open (the thing never truly came to pass).
    const faded = makeWorld({ wants: [resolvedWant('（日子久了，淡了）')] });
    await runTick(faded, deps(), { log: () => {} });
    assert.equal(faded.data.prayers![0].fulfilledTick, undefined, 'a faded want fulfils nothing');

    // Resolved but the pray-er is elsewhere ⇒ the vow waits for a temple visit.
    const away = makeWorld({ roster: { c0: 's0', c1: 's0' } });
    await runTick(away, deps(), { log: () => {} });
    assert.equal(away.data.prayers![0].fulfilledTick, undefined, 'no fulfilment away from the temple');
});

test('STRICT prayer fulfilment reads resolutionCause, with prose note only as shadow', async () => {
    const strictScenes = [
        { id: 's0', name: '前廳', privacyLevel: 1 },
        { id: 's1', name: '靜室', privacyLevel: 1, capabilities: ['temple' as const] },
    ];

    const fadedWant = resolvedWant('話說開了，兩下釋然');
    fadedWant.resolutionCause = 'faded';
    const faded = makeWorld({
        strictStructured: true,
        scenes: strictScenes,
        wants: [fadedWant],
    });
    await runTick(faded, deps(), { log: () => {} });
    assert.equal(faded.data.prayers![0].fulfilledTick, undefined);
    assert.ok(
        faded.data.structuredMonitor?.divergences.some(
            (event) => event.kind === 'prayer-resolution-cause',
        ),
    );

    const doneWant = resolvedWant('（日子久了，淡了）');
    doneWant.resolutionCause = 'resolved';
    const done = makeWorld({
        strictStructured: true,
        scenes: strictScenes,
        wants: [doneWant],
    });
    await runTick(done, deps(), { log: () => {} });
    assert.ok(done.data.prayers![0].fulfilledTick !== undefined);
});
