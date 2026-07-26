import assert from 'node:assert/strict';
import test from 'node:test';

import { makeClock } from '../src/adapters/local/clock.ts';
import { commitBeatPhysics } from '../src/core/physical-canon.ts';
import { runSceneLoop } from '../src/core/scene-loop.ts';
import { newWant } from '../src/core/want-core.ts';
import {
    WorldState,
    type WorldObject,
    type WorldStateData,
} from '../src/world-state.ts';

function strictWorld(
    object: WorldObject = {
        id: 'watch',
        label: '懷錶',
        aliases: ['懷錶', '錶鏈'],
        sceneId: 's0',
        portable: true,
        visibility: 'visible',
        version: 0,
        knownBy: ['c0', 'c1'],
    },
): WorldState {
    return new WorldState({
        sagaId: 'strict-physics',
        sagaPremise: 'test',
        strictStructured: true,
        cast: [
            {
                id: 'c0',
                name: '甲',
                persona: '甲',
                state: { fatigue: 0, hunger: 0, mood: 0 },
                coreIdentity: [],
                relationshipView: {},
            },
            {
                id: 'c1',
                name: '乙',
                persona: '乙',
                state: { fatigue: 0, hunger: 0, mood: 0 },
                coreIdentity: [],
                relationshipView: {},
            },
        ],
        scenes: [
            { id: 's0', name: '衣箱房', privacyLevel: 1 },
            { id: 's1', name: '戲台', privacyLevel: 0 },
        ],
        roster: { c0: 's0', c1: 's0' },
        homeByChar: { c0: 's0', c1: 's0' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [],
        edges: {},
        clock: makeClock(),
        dayAccum: {
            lines: [],
            actorIds: [],
            sceneIds: [],
            povByName: {},
        },
        contestedResources: [],
        objects: [object],
    });
}

test('STRICT prose-only mutation is rendering: no throw, no state change, one divergence', () => {
    const world = strictWorld();

    assert.doesNotThrow(() =>
        commitBeatPhysics({
            world,
            sceneId: 's0',
            actorId: 'c0',
            actorName: '甲',
            witnessIds: ['c0'],
            text: '把懷錶塞進戲靴筒。',
        }),
    );

    assert.equal(world.objectById('watch')?.container, undefined);
    assert.equal(world.objectById('watch')?.version, 0);
    assert.equal(world.data.structuredMonitor?.evaluatedBeats, 1);
    assert.ok(
        world.data.structuredMonitor?.divergences.some(
            (event) =>
                event.kind === 'durable-mutation' &&
                event.legacy === true &&
                event.structured === false,
        ),
    );
});

test('STRICT structured effect is authoritative even when prose names no mutation', () => {
    const world = strictWorld();

    commitBeatPhysics({
        world,
        sceneId: 's0',
        actorId: 'c0',
        actorName: '甲',
        witnessIds: ['c0'],
        text: '甲垂眼想了一會。',
        effects: [
            {
                objectId: 'watch',
                container: '戲靴筒',
                visibility: 'hidden',
            },
        ],
    });

    assert.equal(world.objectById('watch')?.container, '戲靴筒');
    assert.equal(world.objectById('watch')?.visibility, 'hidden');
    assert.equal(world.objectById('watch')?.version, 1);
    assert.ok(
        world.data.structuredMonitor?.divergences.some(
            (event) =>
                event.kind === 'durable-mutation' &&
                event.legacy === false &&
                event.structured === true,
        ),
    );
});

test('STRICT prose-only hidden identity, unavailable reference, and handoff never reject', () => {
    const hidden = strictWorld({
        id: 'watch',
        label: '懷錶',
        aliases: ['懷錶'],
        sceneId: 's0',
        portable: true,
        visibility: 'hidden',
        carriedBy: 'c0',
        version: 0,
        knownBy: ['c0'],
    });
    assert.doesNotThrow(() =>
        commitBeatPhysics({
            world: hidden,
            sceneId: 's0',
            actorId: 'c0',
            actorName: '甲',
            witnessIds: ['c0', 'c1'],
            text: '甲把懷錶交給乙。',
        }),
    );
    assert.equal(hidden.objectById('watch')?.carriedBy, 'c0');
    assert.ok(
        hidden.data.structuredMonitor?.divergences.some(
            (event) => event.kind === 'hidden-identity',
        ),
    );
    assert.ok(
        hidden.data.structuredMonitor?.divergences.some(
            (event) => event.kind === 'handoff',
        ),
    );

    const unavailable = strictWorld();
    assert.doesNotThrow(() =>
        commitBeatPhysics({
            world: unavailable,
            sceneId: 's1',
            actorId: 'c0',
            actorName: '甲',
            witnessIds: ['c0'],
            text: '低頭看向懷錶，撥了撥錶鏈。',
        }),
    );
    assert.ok(
        unavailable.data.structuredMonitor?.divergences.some(
            (event) => event.kind === 'unavailable-reference',
        ),
    );
});

test('STRICT still rejects invalid structured effects', () => {
    const world = strictWorld();
    assert.throws(
        () =>
            commitBeatPhysics({
                world,
                sceneId: 's1',
                actorId: 'c0',
                actorName: '甲',
                witnessIds: ['c0'],
                text: '甲垂眼想了一會。',
                effects: [{ objectId: 'watch', state: 'stopped' }],
            }),
        /cannot mutate inaccessible watch/,
    );
    assert.equal(world.objectById('watch')?.version, 0);
});

test('STRICT does not infer carriedBy from a legacy container phrase', () => {
    const world = strictWorld({
        id: 'watch',
        label: '懷錶',
        aliases: ['懷錶'],
        sceneId: 's0',
        container: '甲懷中',
        portable: true,
        visibility: 'hidden',
        version: 0,
        knownBy: ['c0'],
    });

    assert.equal(world.objectById('watch')?.carriedBy, undefined);
    assert.ok(
        world.data.structuredMonitor?.divergences.some(
            (event) => event.kind === 'legacy-carrier-container',
        ),
    );
});

test('STRICT opening vocative mismatch lands once and is shadow-recorded, not replanned', async () => {
    let calls = 0;
    const comparisons: string[] = [];
    const want = newWant({
        id: 'w0',
        characterId: 'c0',
        layer: '日常',
        desc: '把話說完',
        weight: 0.6,
        sat: 0.3,
        resistance: 5,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
    });
    const loop = await runSceneLoop({
        sceneId: 's0',
        sceneName: '前廳',
        isPrivate: false,
        strictStructured: true,
        clock: '日午',
        cast: [
            { characterId: 'c0', name: '甲', persona: '甲' },
            { characterId: 'c1', name: '乙', persona: '乙' },
        ],
        castNames: ['甲', '乙', '丙'],
        wants: [want],
        tick: 1,
        maxTurns: 1,
        agent: {
            actBeat: async () => {
                calls += 1;
                return {
                    beat: '她抬眼道：「丙，你聽我說。」',
                    inner: '',
                    addressed: '乙',
                };
            },
            replanBeat: async () => {
                calls += 1;
                return { beat: '不該重寫', inner: '' };
            },
            judgeWantResolved: async () => ({ resolved: false }),
        },
        onStructuredComparison: (comparison) =>
            comparisons.push(comparison.kind),
    });

    assert.equal(calls, 1);
    assert.equal(loop.beats.length, 1);
    assert.match(loop.beats[0].text, /丙/);
    assert.deepEqual(comparisons, ['opening-vocative']);
});
