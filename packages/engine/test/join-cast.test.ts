/**
 * 中途入場 (joinCastMember) — deterministic plumbing tests, no LLM:
 *
 *   1. a joiner mirrors founding construction: cN id, persona/secret/secretSeed,
 *      distilled core identity, default state, scene-NAME resolution for
 *      home/work/arrival (roster lands on the arrival scene).
 *   2. refusals are loud: duplicate name, unknown scene, empty persona.
 *   3. no past: zero wants/edges/views at join; under subjectiveNaming the
 *      joiner and the incumbents read each other as strangers (the co-worker
 *      acquaintance seed ran at world start and is never re-run).
 *   4. the world keeps walking: a snapshot round-trip carries the joiner, and
 *      the next daytime tick's genesis phase derives wants for them.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { runTick } from '../src/tick.ts';
import { joinCastMember } from '../src/preset.ts';
import { WorldState, type CastMember, type WorldStateData } from '../src/world-state.ts';
import { seedAcquaintance } from '../src/core/acquaintance.ts';
import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import type { ArchivePort } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };

function member(id: string, name: string, over: Partial<CastMember> = {}): CastMember {
    return { id, name, persona: name, state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {}, ...over };
}

function hallWorld(over: Partial<WorldStateData> = {}): WorldState {
    return new WorldState({
        sagaId: 'join',
        sagaPremise: '一間排練廳',
        cast: [member('c0', '沈硯青', { role: '小生' }), member('c1', '顏繡宜', { role: '青衣' })],
        scenes: [
            { id: 's0', name: '排練廳', privacyLevel: 0 },
            { id: 's1', name: '樓上客房', privacyLevel: 4 },
        ],
        roster: { c0: 's0', c1: 's0' },
        homeByChar: { c0: 's1', c1: 's1' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [],
        edges: {},
        clock: makeClock(6, 0),
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        ...over,
    });
}

test('1) joiner mirrors founding construction and lands on the arrival scene', () => {
    const world = hallWorld();
    const joined = joinCastMember(world, {
        name: '雷萬鈞',
        description: '跑碼頭出身的花臉，嗓門大，最怕閒著。',
        secret: '欠著南邊班主一筆舊帳。',
        role: '淨行',
        gender: '男',
        ageYears: 38,
        home_scene: '樓上客房',
        work_scene: '排練廳',
        arrival_scene: '樓上客房',
    });
    assert.equal(joined.id, 'c2');
    assert.equal(world.data.cast.length, 3);
    assert.equal(joined.persona, '跑碼頭出身的花臉，嗓門大，最怕閒著。');
    assert.equal(joined.secret, '欠著南邊班主一筆舊帳。');
    assert.equal(joined.secretSeed, joined.secret);
    assert.ok(joined.coreIdentity[0].includes('雷萬鈞'));
    assert.ok(joined.coreIdentity[0].includes('淨行'));
    assert.equal(joined.state.fatigue, 0.3);
    assert.equal(world.data.workByChar.c2, 's0');
    assert.equal(world.data.homeByChar.c2, 's1');
    assert.equal(world.data.roster.c2, 's1'); // arrival ≠ work — she stands where she arrived
});

test('2) refusals: duplicate name / unknown scene / empty persona', () => {
    const world = hallWorld();
    assert.throws(() => joinCastMember(world, { name: '沈硯青', description: 'x', home_scene: '樓上客房', work_scene: '排練廳' }), /同名/);
    assert.throws(() => joinCastMember(world, { name: '新人', description: 'x', home_scene: '不存在的地方', work_scene: '排練廳' }), /場景/);
    assert.throws(() => joinCastMember(world, { name: '新人', description: '  ', home_scene: '樓上客房', work_scene: '排練廳' }), /身分描述/);
});

test('3) no past: zero wants/views, and strangers under subjectiveNaming', () => {
    const world = hallWorld({ subjectiveNaming: true });
    seedAcquaintance(world); // world-start seeding: c0/c1 are co-workers → named
    const joined = joinCastMember(world, {
        name: '雷萬鈞',
        description: '跑碼頭出身的花臉。',
        role: '淨行',
        home_scene: '樓上客房',
        work_scene: '排練廳',
    });
    assert.equal(world.liveWantsOf(joined.id).length, 0);
    assert.deepEqual(joined.relationshipView, {});
    // The join happens AFTER world-start seeding — nobody magically knows the newcomer.
    assert.equal(world.acquaintLevel('c0', joined.id), 'stranger');
    assert.equal(world.acquaintLevel(joined.id, 'c0'), 'stranger');
    assert.equal(world.acquaintLevel('c0', 'c1'), 'named'); // incumbents unaffected
});

test('5) 帶舊誼入卷: ties seed edges/views/bonds both ways + named acquaintance', async () => {
    const { bondOf } = await import('../src/core/bond-graph.ts');
    const world = hallWorld({ subjectiveNaming: true });
    seedAcquaintance(world);
    const joined = joinCastMember(world, {
        name: '金鳳',
        description: '會樂里的歌女，坐了三日船又轉了半日騾車來的。',
        role: '歌女',
        home_scene: '樓上客房',
        work_scene: '排練廳',
        ties: [{
            target: '沈硯青',
            tone: '舊識',
            toneBack: '故人',
            view: '當年在碼頭邊聽過他吊嗓，是個實心眼的。',
            viewBack: '會樂里那位金鳳，欠她一句道謝。',
            warmth: 0.5,
        }],
    });
    const w = world.data;
    assert.equal(w.edges[joined.id]?.c0?.tone, '舊識');
    assert.equal(w.edges.c0?.[joined.id]?.tone, '故人');
    assert.ok(joined.relationshipView.c0.includes('實心眼'));
    assert.ok(w.cast.find((m) => m.id === 'c0')!.relationshipView[joined.id].includes('道謝'));
    const graph = world.bondGraph();
    assert.equal(bondOf(graph, joined.id, 'c0'), 0.5);
    assert.equal(bondOf(graph, 'c0', joined.id), 0.5);
    assert.equal(world.acquaintLevel('c0', joined.id), 'named');
    assert.equal(world.acquaintLevel(joined.id, 'c0'), 'named');
    // 沒宣舊誼的人照樣面生。
    assert.equal(world.acquaintLevel('c1', joined.id), 'stranger');

    // 拒收路徑：不存在的對象 → 世界原封不動。
    const before = JSON.stringify(world.data);
    assert.throws(
        () => joinCastMember(world, { name: '路人', description: 'x', home_scene: '樓上客房', work_scene: '排練廳', ties: [{ target: '不存在的人' }] }),
        /舊誼對象/,
    );
    assert.equal(JSON.stringify(world.data), before);
});

test('4) snapshot round-trip carries the joiner; next tick derives genesis wants', async () => {
    const world = hallWorld();
    const joined = joinCastMember(world, {
        name: '雷萬鈞',
        description: '跑碼頭出身的花臉，嗓門大。',
        role: '淨行',
        home_scene: '樓上客房',
        work_scene: '排練廳',
    });

    // JSON round-trip (the snapshot format) keeps the joiner intact.
    const revived = new WorldState(JSON.parse(JSON.stringify(world.data)) as WorldStateData);
    assert.equal(revived.nameById(joined.id), '雷萬鈞');
    assert.equal(revived.data.roster[joined.id], 's0');

    // A daytime tick tops up genesis wants for the member who has none.
    const agent = new FakeSceneAgent();
    await runTick(revived, { agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });
    assert.ok(revived.liveWantsOf(joined.id).length > 0, 'joiner grew genesis wants on the next daytime tick');
});
