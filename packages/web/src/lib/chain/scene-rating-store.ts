/**
 * Durable per-scene content-rating ledger (server-only). Written by the tick
 * loop when a private scene runs; read by the reader site to decide the 18+
 * door without ever sniffing prose. Mirrors the `web/data/*.json` file-store
 * pattern (want-store.ts).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type SceneRating = 'talk' | 'tender' | 'consummate';

export interface SceneRatingEntry {
    sceneId: string;
    sceneName?: string;
    tick: number;
    rating: SceneRating;
    /** Ex-ante gate: a love-layer want drove a beat while alone with its target. */
    gateOpened: boolean;
    beatCount: number;
    atMs: number;
}

interface SceneRatingFile {
    /** sagaId → rating entries, oldest first. */
    [sagaId: string]: SceneRatingEntry[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'scene-ratings.json');
/** Per saga; private scenes are rare, this covers weeks of history. */
const MAX_ENTRIES = 400;

let cache: SceneRatingFile | null = null;

function load(): SceneRatingFile {
    if (cache) return cache;
    try {
        cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as SceneRatingFile;
    } catch {
        cache = {};
    }
    return cache;
}

export function recordSceneRating(sagaId: string, entry: SceneRatingEntry): void {
    const all = load();
    const list = all[sagaId] ?? (all[sagaId] = []);
    list.push(entry);
    if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify(all, null, 1));
    } catch (err) {
        console.warn('[scene-rating] save failed:', err instanceof Error ? err.message : err);
    }
}

export function listSceneRatings(sagaId: string): SceneRatingEntry[] {
    return load()[sagaId] ?? [];
}

/** Latest rating for one scene — what the scene page's door should show now. */
export function latestSceneRating(sagaId: string, sceneId: string): SceneRatingEntry | null {
    const list = load()[sagaId];
    if (!list) return null;
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].sceneId === sceneId) return list[i];
    }
    return null;
}

/** Test-only: drop the process cache so a fresh file state is re-read. */
export function __resetSceneRatingCache(): void {
    cache = null;
}
