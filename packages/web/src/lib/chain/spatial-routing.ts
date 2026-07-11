/**
 * Spatial routing — web-side durable store for the night-router substrate (§2.50).
 * The placement MATH (computeSpatialRouting + its types) now lives in
 * `@endless-story/engine` and is re-exported here so existing web imports of
 * `@/lib/chain/spatial-routing` keep resolving both the store and the math from
 * one path. Character→home map is off-chain config seeded at founding; durable via
 * the `web/data/*.json` file-store pattern (want-store.ts) — an in-memory-only map
 * silently no-op'd night routing after every server restart.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Placement math + shared types are the engine's core now.
export {
    computeSpatialRouting,
    type RoutingActor,
    type RoutingSceneInfo,
    type SpatialRoutingOpts,
} from '@endless-story/engine/core/spatial-routing';

const DATA_DIR = path.join(process.cwd(), 'data');
const HOME_STORE_PATH = path.join(DATA_DIR, 'home-scenes.json');

/** characterId → home sceneId. */
type HomeSceneFile = Record<string, string>;

let homeCache: HomeSceneFile | null = null;

function loadHomes(): HomeSceneFile {
    if (homeCache) return homeCache;
    try {
        homeCache = JSON.parse(fs.readFileSync(HOME_STORE_PATH, 'utf-8')) as HomeSceneFile;
    } catch {
        homeCache = {};
    }
    return homeCache;
}

function saveHomes(all: HomeSceneFile): void {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(HOME_STORE_PATH, JSON.stringify(all, null, 1));
    } catch (err) {
        console.warn('[spatial-routing] home save failed:', err instanceof Error ? err.message : err);
    }
}

export function setHomeScene(characterId: string, sceneId: string): void {
    const all = loadHomes();
    all[characterId] = sceneId;
    saveHomes(all);
}
export function setHomeScenes(entries: Iterable<readonly [string, string]>): void {
    const all = loadHomes();
    for (const [c, s] of entries) all[c] = s;
    saveHomes(all);
}
export function getHomeScene(characterId: string): string | undefined {
    return loadHomes()[characterId];
}
/** Reset cache AND file (tests / harness isolation). */
export function clearHomeScenes(): void {
    homeCache = {};
    saveHomes(homeCache);
}
/** Test-only: drop the process cache so a fresh file state is re-read. */
export function __resetHomeSceneCache(): void {
    homeCache = null;
}

/** Daytime work anchors (G11) — where a character's 崗位 is. The morning router
 *  disperses the cast to these, mirroring the night pull toward homes. */
const workByCharacter = new Map<string, string>();

export function setWorkScenes(entries: Iterable<readonly [string, string]>): void {
    for (const [c, s] of entries) workByCharacter.set(c, s);
}
export function getWorkScene(characterId: string): string | undefined {
    return workByCharacter.get(characterId);
}
export function clearWorkScenes(): void {
    workByCharacter.clear();
}
