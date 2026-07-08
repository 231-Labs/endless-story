/**
 * Durable store for the want ledger (server-only). Mirrors the `web/data/*.json`
 * file-store pattern (plan-intent-store.ts): plaintext JSON, process cache,
 * single-writer (the tick loop). Wants must survive restarts — a lost ledger
 * would reset every character's inner life to genesis.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Want } from '@endless-story/engine/core/want-core';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'want-ledger.json');

interface WantLedgerFile {
    /** sagaId → all wants (live + retired) of that saga's cast. */
    [sagaId: string]: Want[];
}

let cache: WantLedgerFile | null = null;

function load(): WantLedgerFile {
    if (cache) return cache;
    try {
        cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as WantLedgerFile;
    } catch {
        cache = {};
    }
    return cache;
}

/** All wants of a saga (live + retired; callers filter). Returns the mutable
 *  cached array — mutate then `saveWants` in the same tick. */
export function loadWants(sagaId: string): Want[] {
    const all = load();
    if (!all[sagaId]) all[sagaId] = [];
    return all[sagaId];
}

export function saveWants(sagaId: string, wants: Want[]): void {
    const all = load();
    all[sagaId] = wants;
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify(all, null, 1));
    } catch (err) {
        console.warn('[want-store] save failed:', err instanceof Error ? err.message : err);
    }
}

/** True when a character already has wants (genesis ran for them). */
export function hasWants(sagaId: string, characterId: string): boolean {
    return loadWants(sagaId).some((w) => w.characterId === characterId);
}

/* §2.51 dream dose, want lane: queued at injection, consumed by the next
 * want-engine tick (one tighten on the dreamer's hottest want). In-memory —
 * a restart drops at most one pending stir. */
const pendingWantStirs = new Map<string, Set<string>>();

export function queueWantDreamStir(sagaId: string, characterId: string): void {
    if (!sagaId || !characterId) return;
    const set = pendingWantStirs.get(sagaId) ?? new Set<string>();
    set.add(characterId);
    pendingWantStirs.set(sagaId, set);
}

export function drainWantDreamStirs(sagaId: string): string[] {
    const set = pendingWantStirs.get(sagaId);
    if (!set || set.size === 0) return [];
    pendingWantStirs.delete(sagaId);
    return [...set];
}

/** Test hook. */
export function __resetWantStore(): void {
    cache = null;
}
