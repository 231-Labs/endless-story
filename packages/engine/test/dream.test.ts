/**
 * 注夢 — the owner's second influence channel (MORTALITY_AND_DREAMS §1), the
 * last experimental-era legacy migrated onto the modern rails. One image, at
 * the NEXT 深宵, private to the dreamer alone, cadence-capped at one dream per
 * character per three days. 紅線: the dream itself touches NO want — no spawn,
 * no heat; whatever it stirs must come from the character's own reading.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { makeClock } from '../src/adapters/local/clock.ts';
import { DREAM, injectDream, nextDeepNightTick } from '../src/core/dream.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant, type Want } from '../src/core/want-core.ts';

function liveWant(): Want {
    return newWant({
        id: 'w-longing',
        characterId: 'c0',
        layer: '愛',
        desc: '想與乙把話說開',
        target: 'c1',
        weight: 0.8,
        sat: 0.2,
        resistance: 6,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
    });
}

function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'dream-test',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 },
            { id: 's1', name: '甲的寓所', privacyLevel: 3 },
        ],
        roster: { c0: 's0' },
        homeByChar: { c0: 's1' },
        workByChar: { c0: 's0' },
        wants: [liveWant()],
        edges: {},
        bonds: [],
        establishedPairs: [],
        accessSeeded: true,
        clock: makeClock(6, 1), // day 1, 日午
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

test('one dream: lands at the NEXT 深宵, at home, private to the dreamer, wants untouched', () => {
    const world = makeWorld();
    const heatBefore = world.data.wants[0].heat;
    const wantCount = world.data.wants.length;

    const out = injectDream(world, { characterId: 'c0', imagery: '雪地裡一枝壓彎的紅梅' });
    assert.ok(out.ok, 'the dream is queued');

    // Timing: tick 1 of a 6-tick day ⇒ 深宵 is tick 5.
    assert.equal(out.ok && out.atTick, 5, 'the dream waits for deep night');
    assert.equal(nextDeepNightTick(makeClock(6, 5)), 11, 'from 深宵 itself the NEXT night is tomorrow');

    const ev = (world.data.scheduledEvents ?? []).find((e) => e.id.startsWith('dream-'));
    assert.ok(ev, 'one scheduled percept');
    assert.equal(ev!.visibility, 'private');
    assert.deepEqual(ev!.witnessIds, ['c0'], 'the dreamer alone');
    assert.equal(ev!.sceneId, 's1', 'the dream lands where one sleeps');
    assert.ok(ev!.text.includes('雪地裡一枝壓彎的紅梅'), 'the imagery rides verbatim');
    assert.ok(ev!.text.includes('夢'), 'framed as a dream');

    // 紅線: the dream itself touches no want.
    assert.equal(world.data.wants.length, wantCount, 'no want spawned');
    assert.equal(world.data.wants[0].heat, heatBefore, 'no heat moved');
});

test('cadence: three days between dreams for one character', () => {
    const world = makeWorld();
    assert.ok(injectDream(world, { characterId: 'c0', imagery: '紅梅' }).ok);

    // Same day and the next two days refuse; day 1+cadence takes the next dream.
    assert.deepEqual(injectDream(world, { characterId: 'c0', imagery: '又一夢' }), { ok: false, reason: 'cadence' });
    world.data.clock = makeClock(6, 6 * 1 + 1); // day 2
    assert.deepEqual(injectDream(world, { characterId: 'c0', imagery: '又一夢' }), { ok: false, reason: 'cadence' });
    world.data.clock = makeClock(6, 6 * (DREAM.cadenceDays + 0)); // day 1 + cadence
    assert.ok(injectDream(world, { characterId: 'c0', imagery: '第二夢' }).ok, 'the cadence opens');
    assert.equal((world.data.scheduledEvents ?? []).filter((e) => e.id.startsWith('dream-')).length, 2);
});

test('refusals: unknown character and empty imagery leave the world untouched', () => {
    const world = makeWorld();
    assert.deepEqual(injectDream(world, { characterId: 'c9', imagery: '紅梅' }), { ok: false, reason: 'no-character' });
    assert.deepEqual(injectDream(world, { characterId: 'c0', imagery: '   ' }), { ok: false, reason: 'no-imagery' });
    assert.equal(world.data.scheduledEvents, undefined, 'nothing queued');
    assert.equal(world.data.dreamDayByChar, undefined, 'no cadence stamp on refusal');
});
