/**
 * 情分會淡 (heartsCanFade) — the two romance immortalities lifted, so a season
 * stops replaying the same seeded couple. A LOVE want whose target goes long
 * UNSEEN starves at day-end; past a grace its weight erodes until the heart lets
 * go (「情分淡了」). A faded love that had reached 相許 LAPSES the 相許 — the
 * standing keys it granted are revoked. Meeting resets the clock; NON-love wants
 * are never touched. Flag OFF ⇒ the whole pass is inert (permanent-love world).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant } from '../src/core/want-core.ts';
import type { ArchivePort } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = () => ({ agent: new FakeSceneAgent(), recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** 甲(c0) loves 乙(c1) and they are 相許; 乙 sits in 乙's own private home (s1),
 *  甲 holds the standing key the 相許 granted. 甲 lives in the public 前廳 (s0).
 *  They never share a scene (fake stays put), so the love starves. */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'hearts-fade',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 },
            { id: 's1', name: '乙的寓所', privacyLevel: 3 },
        ],
        roster: { c0: 's0', c1: 's1' },
        homeByChar: { c0: 's0', c1: 's1' },
        workByChar: { c0: 's0', c1: 's1' },
        wants: [
            newWant({ id: 'w-love', characterId: 'c0', layer: '愛', desc: '想與乙長相守', target: 'c1', weight: 0.8, sat: 0.2, resistance: 6, kind: 'narrative', source: 'genesis', bornTick: 0 }),
            newWant({ id: 'w-craft', characterId: 'c0', layer: '志向', desc: '想把戲唱到頂', weight: 0.7, sat: 0.2, resistance: 4, kind: 'narrative', source: 'genesis', bornTick: 0 }),
        ],
        establishedPairs: ['c0|c1'],
        edges: {},
        bonds: [],
        accessSeeded: true,
        clock: makeClock(6, 5),
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    const world = new WorldState({ ...base, ...over });
    world.grantAccess('s1', 'c0', 'standing'); // the key 相許 granted 甲 to 乙's home
    return world;
}

/** Run one day-end tick per day (深宵) for `days`, the pair never meeting. */
async function starveFor(world: WorldState, days: number): Promise<void> {
    for (let d = 1; d <= days; d++) {
        world.data.clock = makeClock(6, 6 * d - 1); // 深宵 of day d
        await runTick(world, deps(), { log: () => {} });
    }
}

test('a starved love fades and lapses the 相許 (flag ON); a craft want is untouched', async () => {
    const world = makeWorld({ heartsCanFade: true });
    assert.ok(world.canEnter('c0', 's1'), '甲 starts with the 相許 key to 乙的寓所');

    await starveFor(world, 8); // grace 3 + ~4 erosions past it ⇒ fades

    const love = world.data.wants.find((w) => w.id === 'w-love')!;
    assert.ok(love.retired, 'the long-unseen love has faded');
    assert.match(love.resolvedNote ?? '', /淡了/, 'it faded (「情分淡了」), not resolved');
    assert.equal(world.isEstablished('c0', 'c1'), false, 'the 相許 lapsed with the love');
    assert.equal(world.canEnter('c0', 's1'), false, 'the standing key the 相許 granted was revoked');
    assert.ok(
        (world.data.scheduledEvents ?? []).some((e) => e.id.startsWith('love-lapsed-') && e.text.includes('隔了一層')),
        'both keep a private note of the drift',
    );

    const craft = world.data.wants.find((w) => w.id === 'w-craft')!;
    assert.equal(craft.retired, undefined, 'a 志向 want never starves — who you ARE does not fade');
});

test('flag OFF ⇒ the love never fades and the 相許 stands (byte-identical, permanent-love)', async () => {
    const world = makeWorld(); // heartsCanFade absent
    await starveFor(world, 8);
    const love = world.data.wants.find((w) => w.id === 'w-love')!;
    assert.equal(love.retired, undefined, 'without the flag the seeded love is immortal');
    assert.equal(love.starveDays, undefined, 'the starve clock never even ticks');
    assert.equal(world.isEstablished('c0', 'c1'), true, 'the 相許 stays');
    assert.ok(world.canEnter('c0', 's1'), 'the key stays');
});

test('within the grace period the love only starves, it does not fade yet', async () => {
    const world = makeWorld({ heartsCanFade: true });
    await starveFor(world, 3); // == grace: counts but no erosion
    const love = world.data.wants.find((w) => w.id === 'w-love')!;
    assert.equal(love.starveDays, 3, 'the starve clock counted the days apart');
    assert.equal(love.retired, undefined, 'still within grace ⇒ not faded');
    assert.equal(world.isEstablished('c0', 'c1'), true, 'the 相許 still stands mid-grace');
});
