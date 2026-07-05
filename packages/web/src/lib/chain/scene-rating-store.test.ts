/**
 * scene-rating-store: record / list / latest round-trip, cap, and the
 * fail-safe default path (unknown saga → empty, no throw).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    __resetSceneRatingCache,
    latestSceneRating,
    listSceneRatings,
    recordSceneRating,
    type SceneRatingEntry,
} from './scene-rating-store.ts';

const STORE = path.join(process.cwd(), 'data', 'scene-ratings.json');

function entry(over: Partial<SceneRatingEntry>): SceneRatingEntry {
    return {
        sceneId: 'chamber',
        sceneName: '廂房',
        tick: 1,
        rating: 'talk',
        gateOpened: false,
        beatCount: 3,
        atMs: 0,
        ...over,
    };
}

function withCleanStore(fn: () => void): void {
    const had = fs.existsSync(STORE) ? fs.readFileSync(STORE, 'utf-8') : null;
    try {
        fs.rmSync(STORE, { force: true });
        __resetSceneRatingCache();
        fn();
    } finally {
        if (had !== null) fs.writeFileSync(STORE, had);
        else fs.rmSync(STORE, { force: true });
        __resetSceneRatingCache();
    }
}

test('record → list → latest round-trips, newest wins', () => {
    withCleanStore(() => {
        recordSceneRating('saga1', entry({ tick: 1, rating: 'talk' }));
        recordSceneRating('saga1', entry({ tick: 2, rating: 'consummate', gateOpened: true }));
        recordSceneRating('saga1', entry({ sceneId: 'backroom', tick: 2, rating: 'tender' }));

        assert.equal(listSceneRatings('saga1').length, 3);
        const latest = latestSceneRating('saga1', 'chamber');
        assert.equal(latest?.rating, 'consummate');
        assert.equal(latest?.gateOpened, true);
        assert.equal(latestSceneRating('saga1', 'backroom')?.rating, 'tender');
    });
});

test('unknown saga/scene is empty, not a throw', () => {
    withCleanStore(() => {
        assert.deepEqual(listSceneRatings('nope'), []);
        assert.equal(latestSceneRating('nope', 'chamber'), null);
    });
});

test('persists across cache reset (restart survival)', () => {
    withCleanStore(() => {
        recordSceneRating('saga1', entry({ tick: 7, rating: 'tender' }));
        __resetSceneRatingCache();
        assert.equal(latestSceneRating('saga1', 'chamber')?.tick, 7);
    });
});
