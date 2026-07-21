/**
 * 香火 — the owner's influence channel (RECRUIT_INCENSE_SPEC §3). One stick a
 * day per character: an owner-prayer hangs on the 願牆 (source 'owner'), the
 * pointed-at EXISTING want gains a whisper of heat (ε = one co-presence tick,
 * never a forcing jump), and the character keeps one private 「無端又想起」
 * percept — never a word about the owner. 紅線: no want may be created, a
 * retired want takes no incense, and 應驗 stamps silently (the character never
 * made this vow, so no temple visit is owed and no private 還願 memory forms).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { INCENSE, offerIncense } from '../src/core/incense.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant, type Want } from '../src/core/want-core.ts';
import type { ArchivePort } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = () => ({ agent: new FakeSceneAgent(), recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

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
        sagaId: 'incense-test',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 },
            { id: 's1', name: '觀音堂', privacyLevel: 1 },
        ],
        roster: { c0: 's0', c1: 's0' },
        homeByChar: { c0: 's0', c1: 's0' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [liveWant()],
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

test('one stick: heat nudged by ε, owner-prayer on the wall, one private percept — and only once a day', () => {
    const world = makeWorld();
    const before = world.data.wants[0].heat;

    const out = offerIncense(world, { characterId: 'c0', wantId: 'w-longing', text: '求菩薩讓她把話說出口。' });
    assert.ok(out.ok, 'the stick burns');

    // The nudge: exactly ε, on the pointed-at want.
    assert.equal(world.data.wants[0].heat, before + INCENSE.heatNudge, 'heat gains exactly ε');

    // The 願籤: source 'owner', hung at the temple, carrying the want's words.
    const p = world.data.prayers![0];
    assert.equal(p.source, 'owner');
    assert.equal(p.sceneName, '觀音堂', 'the stick hangs at the temple');
    assert.equal(p.wantDesc, '想與乙把話說開');

    // The percept: private, witnessed by the character ALONE, wordless about the owner.
    const stir = (world.data.scheduledEvents ?? []).find((e) => e.id.endsWith('-stir'));
    assert.ok(stir, 'one private stir is scheduled');
    assert.equal(stir!.visibility, 'private');
    assert.deepEqual(stir!.witnessIds, ['c0']);
    assert.ok(!stir!.text.includes('香'), 'the percept never names the incense');

    // Daily cap: the second stick the same day is refused, nothing moves.
    const again = offerIncense(world, { characterId: 'c0', wantId: 'w-longing', text: '再上一炷。' });
    assert.deepEqual(again, { ok: false, reason: 'daily-cap' });
    assert.equal(world.data.wants[0].heat, before + INCENSE.heatNudge, 'the cap holds the nudge to once');
    assert.equal(world.data.prayers!.length, 1, 'one 願籤 a day');

    // A new day burns anew.
    world.data.clock = makeClock(6, 7); // day 2
    const nextDay = offerIncense(world, { characterId: 'c0', wantId: 'w-longing', text: '又來求菩薩。' });
    assert.ok(nextDay.ok, 'the next day takes a fresh stick');
});

test('紅線: no want no incense — missing, retired, unknown character, no temple all refuse untouched', () => {
    const world = makeWorld();

    assert.deepEqual(offerIncense(world, { characterId: 'c9', wantId: 'w-longing', text: '…' }), { ok: false, reason: 'no-character' });
    assert.deepEqual(offerIncense(world, { characterId: 'c0', wantId: 'w-nope', text: '…' }), { ok: false, reason: 'no-want' });

    world.data.wants[0].retired = true;
    assert.deepEqual(offerIncense(world, { characterId: 'c0', wantId: 'w-longing', text: '…' }), { ok: false, reason: 'retired-want' });
    assert.equal(world.data.prayers, undefined, 'no 願籤 was hung by any refusal');
    assert.equal(world.data.wants[0].heat, 0, 'no heat moved');

    const templeless = makeWorld({ scenes: [{ id: 's0', name: '前廳', privacyLevel: 1 }] });
    assert.deepEqual(offerIncense(templeless, { characterId: 'c0', wantId: 'w-longing', text: '…' }), { ok: false, reason: 'no-temple' });
});

test('香火應驗 stamps silently: no temple visit owed, no private 還願 memory', async () => {
    const world = makeWorld();
    const lit = offerIncense(world, { characterId: 'c0', wantId: 'w-longing', text: '求菩薩讓她把話說出口。' });
    assert.ok(lit.ok);

    // The want truly resolves (judge-resolved), with 甲 NOWHERE NEAR the temple.
    const w = world.data.wants[0];
    w.retired = true;
    w.resolvedTick = 3;
    w.resolvedNote = '話說開了，兩下釋然';
    await runTick(world, deps(), { log: () => {} });

    const p = world.data.prayers!.find((x) => x.source === 'owner')!;
    assert.ok(p.fulfilledTick !== undefined, 'the owner-prayer 應驗s the moment the want truly resolves');
    assert.ok(
        !(world.data.scheduledEvents ?? []).some((e) => e.id === `prayer-fulfilled-${p.id}`),
        'no private 還願 memory — the character never made this vow',
    );
});
