/**
 * Durable store for 隨身物/行頭 (server-only). Mirrors the `web/data/*.json`
 * file-store pattern (want-store.ts): plaintext JSON, process cache. An owner's
 * gift must survive restarts — a keepsake that vanishes on redeploy breaks the
 * gift-and-see promise (she keeps what you gave her).
 *
 * Items carry provenance (`from` = the giver's pen name / a cast name) and a
 * receipt time; the scene layer converts recency into the fresh-gift salience
 * window. Whether an item ever comes out in a scene remains the CHARACTER's
 * choice (engine salience gate + her beats) — this store only remembers what
 * she has on her.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CarriedItem {
    desc: string;
    /** Giver: an in-world cast name, or an outside fan's pen name (the owner). */
    from?: string;
    /** Receipt wall-clock ms — the scene layer derives the fresh-gift window. */
    receivedAtMs?: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'carried.json');
/** A gift stays "on the mind" (fresh salience) this long after receipt. */
export const GIFT_FRESH_MS = 48 * 3600_000;

interface CarriedFile {
    [characterId: string]: CarriedItem[];
}

let cache: CarriedFile | null = null;

function load(): CarriedFile {
    if (cache) return cache;
    try {
        cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as CarriedFile;
    } catch {
        cache = {};
    }
    return cache;
}

function save(all: CarriedFile): void {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify(all, null, 1));
    } catch (err) {
        console.warn('[carried-store] save failed:', err instanceof Error ? err.message : err);
    }
}

export function getCarried(characterId: string): CarriedItem[] {
    return load()[characterId] ?? [];
}

export function addCarried(characterId: string, item: CarriedItem): void {
    const all = load();
    (all[characterId] ??= []).push({ receivedAtMs: Date.now(), ...item });
    save(all);
}

/** Convert stored items into the engine scene-loop shape: a recent gift gets the
 *  fresh-salience window (mentioned to its carrier for the next ticks); older
 *  items rely on the giver-co-present / sparse-ambient gates. */
export function toSceneCarried(
    items: CarriedItem[],
    nowTick: number,
): Array<{ desc: string; from?: string; newUntil?: number }> | undefined {
    if (!items.length) return undefined;
    return items.map((it) => ({
        desc: it.desc,
        from: it.from,
        newUntil:
            it.receivedAtMs != null && Date.now() - it.receivedAtMs < GIFT_FRESH_MS
                ? nowTick + 2
                : undefined,
    }));
}

/** Tests / harness isolation. */
export function __resetCarriedCache(): void {
    cache = null;
}
