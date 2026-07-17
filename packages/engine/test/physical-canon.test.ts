import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { makeClock } from '../src/adapters/local/clock.ts';
import { commitBeatPhysics } from '../src/core/physical-canon.ts';

function world(): WorldState {
    const data: WorldStateData = {
        sagaId: 'physics', sagaPremise: 'test',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [{ id: 's0', name: '衣箱房', privacyLevel: 1 }, { id: 's1', name: '戲台', privacyLevel: 0 }],
        roster: { c0: 's0', c1: 's0' }, homeByChar: { c0: 's0', c1: 's0' }, workByChar: { c0: 's0', c1: 's0' },
        wants: [], edges: {}, clock: makeClock(), dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} }, contestedResources: [],
        objects: [{ id: 'watch', label: '懷錶', aliases: ['懷錶', '錶鏈'], sceneId: 's0', portable: true, visibility: 'visible', version: 0, knownBy: ['c0', 'c1'] }],
    };
    return new WorldState(data);
}

test('off-scene registered object cannot materialize in objective narration', () => {
    const w = world();
    assert.throws(() => commitBeatPhysics({
        world: w, sceneId: 's1', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '低頭看向懷錶，撥了撥錶鏈。',
    }), /unavailable watch/);
    assert.doesNotThrow(() => commitBeatPhysics({
        world: w, sceneId: 's1', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '低聲道：「那隻懷錶還在衣箱房。」',
    }));
    assert.doesNotThrow(() => commitBeatPhysics({
        world: w, sceneId: 's1', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '攏著袖口說：『把「懷錶」二字記在契約裡，明日再去衣箱房取。』',
    }), 'nested quoted discussion is knowledge, not physical co-location');
});

test('physical mutation needs a structured effect and commits one version', () => {
    const w = world();
    assert.throws(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '把懷錶塞進戲靴筒。',
    }), /without objectEffects/);
    assert.throws(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '將懷錶匣抽開半寸，偏頭往縫隙裡覷。',
    }), /without objectEffects/);
    // perfective description of accomplished state is narration, not mutation:
    // the live v16 crash — she merely laid the ALREADY-signed paper flat
    assert.doesNotThrow(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '她將已簽妥的懷錶匣輕輕挪正，掌心覆在上頭按了按：「成了。」',
    }));
    assert.throws(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '提筆在懷錶匣的封籤上簽了名。',
    }), /without objectEffects/);
    assert.throws(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '挑開封口，從懷錶匣裡抽出懷錶。',
    }), /without objectEffects/);
    assert.throws(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '左手兩指穩穩夾起那懷錶，右指尖沿著匣口極緩地揭開半寸，目光直墜進去。',
    }), /without objectEffects/);
    commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '把懷錶塞進戲靴筒。',
        effects: [{ objectId: 'watch', container: '戲靴筒', visibility: 'hidden' }],
    });
    assert.equal(w.objectById('watch')?.container, '戲靴筒');
    assert.equal(w.objectById('watch')?.visibility, 'hidden');
    assert.equal(w.objectById('watch')?.version, 1);
});

test('temporary handling is objective blocking, not a durable object mutation', () => {
    const w = world();
    assert.doesNotThrow(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '指尖按住懷錶，隨即拿起來看了一眼。',
    }));
    assert.equal(w.objectById('watch')?.version, 0);

    assert.throws(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0'],
        text: '把懷錶拿走。',
    }), /without objectEffects/);
});

test('a carried object follows its character and hidden carriage is not a public affordance', () => {
    const w = world();
    commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0', 'c1'],
        text: '把懷錶揣進甲懷中。',
        effects: [{ objectId: 'watch', container: '甲懷中', carried: true, visibility: 'hidden' }],
    });
    assert.equal(w.objectById('watch')?.carriedBy, 'c0');
    assert.equal(w.objectAccessibleTo(w.objectById('watch')!, 'c1', 's0'), false);

    w.moveCharacter('c0', 's1');
    assert.equal(w.objectById('watch')?.sceneId, 's1');
    assert.equal(w.objectAccessibleTo(w.objectById('watch')!, 'c0', 's1'), true);
});

test('hidden object identity cannot leak through objective narration to unaware witnesses', () => {
    const w = world();
    const watch = w.objectById('watch')!;
    watch.visibility = 'hidden';
    watch.carriedBy = 'c0';
    watch.knownBy = ['c0'];

    assert.throws(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0', 'c1'],
        text: '甲隔著衣襟摩過懷錶的錶蓋，抬眼看向乙。',
    }), /exposed hidden watch/);
    assert.doesNotThrow(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0', 'c1'],
        text: '甲隔著衣襟按了按內袋，低聲道：「那只懷錶的帳，改日再算。」',
    }), 'speaking about an object may inform someone without materializing it');
    assert.doesNotThrow(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0', 'c1'],
        text: '甲從內袋取出懷錶，攤在眾人面前。',
        effects: [{ objectId: 'watch', carried: true, visibility: 'visible' }],
    }), 'an explicit reveal makes the object publicly perceivable');
    assert.ok(w.objectById('watch')?.knownBy.includes('c1'));
});

test('a handoff names and validates the new co-present carrier', () => {
    const w = world();
    assert.throws(() => commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0', 'c1'],
        text: '甲把懷錶交給乙。',
        effects: [{ objectId: 'watch', carried: false }],
    }), /without carrierName/);
    commitBeatPhysics({
        world: w, sceneId: 's0', actorId: 'c0', actorName: '甲', witnessIds: ['c0', 'c1'],
        text: '甲把懷錶交給乙。',
        effects: [{ objectId: 'watch', carrierName: '乙' }],
    });
    assert.equal(w.objectById('watch')?.carriedBy, 'c1');
    w.moveCharacter('c1', 's1');
    assert.equal(w.objectById('watch')?.sceneId, 's1');
});
