/**
 * Runner-side port of the §2.50 spatial sim: public scenes empty at night, welcomed
 * pursuit yields emergent privacy, unwelcomed pursuers go home, day is silent.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/chain/spatial-routing.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    computeSpatialRouting,
    setHomeScene,
    setHomeScenes,
    getHomeScene,
    clearHomeScenes,
    __resetHomeSceneCache,
    type RoutingActor,
    type RoutingSceneInfo,
} from './spatial-routing.ts';

const SCENES: RoutingSceneInfo[] = [
    { id: 'backstage', privacyLevel: 0 },
    { id: 'su_room', privacyLevel: 5 },
    { id: 'liu_room', privacyLevel: 5 },
    { id: 'jin_hall', privacyLevel: 4 },
    { id: 'bai_house', privacyLevel: 5 },
    { id: 'tian_office', privacyLevel: 4 },
];

// Stand-in for the real graph: su and liu welcome each other; nobody else is welcomed.
const welcome = (hostId: string, visitorId: string): number =>
    (hostId === 'su' && visitorId === 'liu') || (hostId === 'liu' && visitorId === 'su') ? 1 : 0;

function freshWorld(): RoutingActor[] {
    return [
        { id: 'su', sceneId: 'backstage', homeSceneId: 'su_room', fatigue: 0.6, pursue: { id: 'liu', w: 0.3 } },
        { id: 'liu', sceneId: 'backstage', homeSceneId: 'liu_room', fatigue: 0.6, pursue: { id: 'su', w: 0.95 } },
        { id: 'jin', sceneId: 'backstage', homeSceneId: 'jin_hall', fatigue: 0.6, pursue: { id: 'liu', w: 0.85 } },
        { id: 'bai', sceneId: 'backstage', homeSceneId: 'bai_house', fatigue: 0.6, pursue: { id: 'liu', w: 0.7 } },
        { id: 'tian', sceneId: 'backstage', homeSceneId: 'tian_office', fatigue: 0.6, pursue: { id: 'liu', w: 0.2 } },
    ];
}

/** Advance N night ticks (simultaneous update). */
function runNights(ticks: number): RoutingActor[] {
    let actors = freshWorld();
    for (let i = 0; i < ticks; i++) {
        const targets = computeSpatialRouting(actors, SCENES, true, welcome);
        actors = actors.map((a) => ({ ...a, sceneId: targets.get(a.id) ?? a.sceneId }));
    }
    return actors;
}

const sceneOf = (actors: RoutingActor[], id: string): string => actors.find((a) => a.id === id)!.sceneId;
const occ = (actors: RoutingActor[], sceneId: string): string[] => actors.filter((a) => a.sceneId === sceneId).map((a) => a.id);

test('① 夜深公共場淨空 — everyone disperses off the public scene', () => {
    const after = runNights(4);
    assert.equal(occ(after, 'backstage').length, 0, '公共場(backstage)夜深應無人');
});

test('② 柳蘇獨處湧現 — welcomed pursuit lands both in 蘇 的私宅, alone', () => {
    const after = runNights(4);
    const room = occ(after, 'su_room').sort();
    assert.deepEqual(room, ['liu', 'su'], '蘇廂房應恰為柳蘇二人');
});

test('③ 自律不打擾 — 金鳳/白 pursue 柳 but end up in their OWN homes (not intruding)', () => {
    const after = runNights(4);
    assert.equal(sceneOf(after, 'jin'), 'jin_hall', '金鳳不被迎入私宅、自己回家');
    assert.equal(sceneOf(after, 'bai'), 'bai_house', '白韻秋不被迎入私宅、自己回家');
    assert.ok(!occ(after, 'su_room').includes('jin'), '金鳳不在蘇廂房');
    assert.ok(!occ(after, 'su_room').includes('bai'), '白韻秋不在蘇廂房');
});

test('④ 白天路由沉默 — by day the router defers to the LLM (empty map)', () => {
    const targets = computeSpatialRouting(freshWorld(), SCENES, false, welcome);
    assert.equal(targets.size, 0, '白天不出手，交給 decideMove');
});

test('⑤ 無主/不被迎的私宅 propriety = 0 — a stranger never routes into it', () => {
    // liu pursues su, but su sits in a room owned by jin, who doesn't welcome liu.
    const actors: RoutingActor[] = [
        { id: 'liu', sceneId: 'backstage', homeSceneId: 'liu_room', fatigue: 0.6, pursue: { id: 'su', w: 0.95 } },
        { id: 'su', sceneId: 'jin_hall', homeSceneId: 'su_room', fatigue: 0.6 },
        { id: 'jin', sceneId: 'jin_hall', homeSceneId: 'jin_hall', fatigue: 0.6 },
    ];
    const targets = computeSpatialRouting(actors, SCENES, true, welcome);
    assert.equal(targets.get('liu'), 'liu_room', '金鳳不迎柳 → 柳不闖金鳳歌廳、回自己家');
});

/* ── home-scene store: durable across restarts (file-store pattern) ── */

const HOME_STORE = path.join(process.cwd(), 'data', 'home-scenes.json');

/** Run against a clean store file, restoring whatever was there before. */
function withCleanHomeStore(fn: () => void): void {
    const had = fs.existsSync(HOME_STORE) ? fs.readFileSync(HOME_STORE, 'utf-8') : null;
    try {
        fs.rmSync(HOME_STORE, { force: true });
        __resetHomeSceneCache();
        fn();
    } finally {
        if (had !== null) fs.writeFileSync(HOME_STORE, had);
        else fs.rmSync(HOME_STORE, { force: true });
        __resetHomeSceneCache();
    }
}

test('⑥ home store round-trips (single + batch set)', () => {
    withCleanHomeStore(() => {
        setHomeScene('su', 'su_room');
        setHomeScenes([['liu', 'liu_room'], ['jin', 'jin_hall']]);
        assert.equal(getHomeScene('su'), 'su_room');
        assert.equal(getHomeScene('liu'), 'liu_room');
        assert.equal(getHomeScene('jin'), 'jin_hall');
        assert.equal(getHomeScene('nobody'), undefined);
    });
});

test('⑦ home store persists across cache reset (restart survival)', () => {
    withCleanHomeStore(() => {
        setHomeScene('su', 'su_room');
        // Simulate a server restart: drop the process cache, NOT the store file.
        __resetHomeSceneCache();
        assert.equal(getHomeScene('su'), 'su_room', '重啟後夜路由不可失憶');
    });
});

test('⑧ clearHomeScenes wipes cache AND file (harness isolation)', () => {
    withCleanHomeStore(() => {
        setHomeScene('su', 'su_room');
        clearHomeScenes();
        assert.equal(getHomeScene('su'), undefined);
        __resetHomeSceneCache();
        assert.equal(getHomeScene('su'), undefined, '清除也要清到檔案，重啟不可復活');
    });
});
