/**
 * Durable event-moment dedupe ledger (server-only). A moment image fires on
 * every event OPEN, but the same axis re-opens in the same scene tick after
 * tick — each re-open repainted the same cast in the same room (five
 * near-identical 衣箱房 images in one gallery). One image per
 * (scene, event axis) per narrative day matches the intent: 每齣大戲一張圖,
 * not 每次重開一張. Mirrors the `web/data/*.json` file-store pattern.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface MomentLedgerFile {
    /** sagaId → `${sceneId}::${templateId}` → last narrative day rendered. */
    [sagaId: string]: Record<string, number>;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'moment-ledger.json');

let cache: MomentLedgerFile | null = null;

function load(): MomentLedgerFile {
    if (cache) return cache;
    try {
        cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as MomentLedgerFile;
    } catch {
        cache = {};
    }
    return cache;
}

export function momentKey(sceneId: string, templateId: string): string {
    return `${sceneId}::${templateId}`;
}

/** True when this (scene, axis) already rendered a moment on this narrative day. */
export function hasMomentToday(sagaId: string, key: string, day: number): boolean {
    return load()[sagaId]?.[key] === day;
}

export function recordMoment(sagaId: string, key: string, day: number): void {
    const all = load();
    const bySaga = all[sagaId] ?? (all[sagaId] = {});
    bySaga[key] = day;
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify(all, null, 1));
    } catch (err) {
        console.warn('[moment-ledger] save failed:', err instanceof Error ? err.message : err);
    }
}

/** Test-only: drop the process cache so a fresh file state is re-read. */
export function __resetMomentLedgerCache(): void {
    cache = null;
}
