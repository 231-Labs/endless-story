import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { applyRewrite, type LedgerEvent } from '../src/core/want-rewrite.ts';
import {
    applyBeat,
    newWant,
    type Want,
    type WantSemanticTag,
} from '../src/core/want-core.ts';
import type { ArchivePort } from '../src/ports.ts';
import { runTick } from '../src/tick.ts';
import {
    WorldState,
    type CastMember,
    type WorldStateData,
} from '../src/world-state.ts';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = () => ({
    agent: new FakeSceneAgent(),
    recall: new LocalRecall(),
    archive: nullArchive,
    clock: new LocalClock(),
});

function member(id: string, name: string): CastMember {
    return {
        id,
        name,
        persona: name,
        gender: '女',
        state: { fatigue: 0, hunger: 0, mood: 0 },
        coreIdentity: [],
        relationshipView: {},
    };
}

function directedWant(
    layer: string,
    semanticTags?: WantSemanticTag[],
): Want {
    return newWant({
        id: 'w-sour',
        characterId: 'c0',
        layer,
        desc: '同一段可任意改寫的散文',
        target: 'c1',
        semanticTags,
        weight: 0.8,
        sat: 0.2,
        resistance: 3,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
    });
}

function worldWithWant(
    want: Want,
    strictStructured?: boolean,
): WorldState {
    const data: WorldStateData = {
        sagaId: 'strict-auth',
        sagaPremise: '一個戲班',
        ...(strictStructured ? { strictStructured: true } : {}),
        cast: [member('c0', '甲'), member('c1', '乙')],
        scenes: [
            { id: 's0', name: '街', privacyLevel: 1 },
            { id: 's1', name: '甲宅', privacyLevel: 3 },
        ],
        roster: { c0: 's1', c1: 's0' },
        homeByChar: { c0: 's1', c1: 's0' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [want],
        edges: {},
        bonds: [],
        establishedPairs: [],
        accessSeeded: true,
        accessGrants: {
            s1: { standing: ['c1'], oneTime: [] },
        },
        clock: makeClock(6, 5),
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState(data);
}

test('flag off keeps the legacy revoke decision even when structured tags disagree', async () => {
    const world = worldWithWant(directedWant('怨'));
    await runTick(world, deps(), { log: () => {} });

    assert.equal(world.canEnter('c1', 's1'), false);
    assert.equal(world.data.structuredMonitor, undefined);
    assert.equal(world.data.strictStructured, undefined);
});

test('STRICT ignores hostile prose without a hostile declaration and records the shadow divergence', async () => {
    const world = worldWithWant(directedWant('怨'), true);
    await runTick(world, deps(), { log: () => {} });

    assert.equal(world.canEnter('c1', 's1'), true);
    assert.ok(
        world.data.structuredMonitor?.divergences.some(
            (event) =>
                event.kind === 'revoke-standing-key' &&
                event.legacy === true &&
                event.structured === false,
        ),
    );
});

test('STRICT revokes from hostile metadata despite neutral prose and records the reverse divergence', async () => {
    const world = worldWithWant(
        directedWant('日常', ['hostility']),
        true,
    );
    await runTick(world, deps(), { log: () => {} });

    assert.equal(world.canEnter('c1', 's1'), false);
    assert.ok(
        world.data.structuredMonitor?.divergences.some(
            (event) =>
                event.kind === 'revoke-standing-key' &&
                event.legacy === false &&
                event.structured === true,
        ),
    );
});

test('ordinary rewrite mutates prose but cannot mutate existing mechanism tags', () => {
    const want = directedWant('愛', ['affection']);
    const wants = [want];
    const events: LedgerEvent[] = [];

    applyRewrite(
        wants,
        'c0',
        {
            decisions: [
                {
                    id: want.id,
                    action: 'mutate',
                    newDesc: '這句如今寫得像仇怨',
                },
            ],
        },
        1,
        events,
        ['甲', '乙'],
        undefined,
        true,
    );

    assert.equal(want.desc, '這句如今寫得像仇怨');
    assert.deepEqual(want.semanticTags, ['affection']);
});

test('FakeSceneAgent STRICT creation declarations are deterministic', async () => {
    const make = (): WorldState =>
        new WorldState({
            sagaId: 'strict-fake',
            sagaPremise: '一個戲班',
            strictStructured: true,
            cast: [member('c0', '甲'), member('c1', '乙')],
            scenes: [{ id: 's0', name: '前廳', privacyLevel: 1 }],
            roster: { c0: 's0', c1: 's0' },
            homeByChar: { c0: 's0', c1: 's0' },
            workByChar: { c0: 's0', c1: 's0' },
            wants: [],
            edges: {},
            bonds: [],
            establishedPairs: [],
            accessSeeded: true,
            clock: makeClock(6, 0),
            lastMovedTickByChar: {},
            dayAccum: {
                lines: [],
                actorIds: [],
                sceneIds: [],
                povByName: {},
            },
            contestedResources: [],
            objects: [],
        });
    const left = make();
    const right = make();

    await runTick(left, deps(), { log: () => {} });
    await runTick(right, deps(), { log: () => {} });

    assert.deepEqual(left.data, right.data);
    const love = left.data.wants.find(
        (want) => want.characterId === 'c0' && want.layer === '愛',
    );
    assert.deepEqual(love?.semanticTags, ['affection']);
    assert.equal(love?.target, 'c1');
});

test('FakeSceneAgent declares a stable contract subject without giving prose authority', async () => {
    const reply = await new FakeSceneAgent().declareWantSemantics({
        source: 'genesis',
        characterId: 'c0',
        characterName: '甲',
        layer: '事務',
        desc: '想把柳安春三日獨家契約談妥',
        cast: [
            { id: 'c0', name: '甲' },
            { id: 'c1', name: '乙' },
        ],
        subjects: [
            {
                kind: 'contract',
                id: 'anchun-exclusive',
                label: '柳安春三日獨家契約',
            },
        ],
    });

    assert.deepEqual(reply.subjectRef, {
        kind: 'contract',
        id: 'anchun-exclusive',
    });
});

test('resolutionCause is STRICT metadata and leaves flag-off snapshots untouched', () => {
    const legacy = directedWant('日常');
    applyBeat(
        legacy,
        [legacy],
        { gain: '小', resolved: true, resolvedNote: '做完了' },
        3,
    );
    assert.equal(legacy.resolutionCause, undefined);

    const strict = directedWant('日常');
    applyBeat(
        strict,
        [strict],
        { gain: '小', resolved: true, resolvedNote: '做完了' },
        3,
        true,
    );
    assert.equal(strict.resolutionCause, 'resolved');
});
