/**
 * Durable troupe-temperament override (server-only). The preset ships a baseline
 * `emotional_stance` / `tone_register`; the backstage knob writes an override here
 * so an operator can retune the saga's soul without reseeding. Read by
 * loadNarrativeProfile (merged over the preset) and surfaced read-only on the
 * 規章 page. One world today, so a single global record. Mirrors the
 * `web/data/*.json` file-store pattern (scene-rating-store.ts).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type EmotionalStance = 'restrained' | 'tender' | 'consummate';

export interface StanceOverride {
    emotionalStance?: EmotionalStance;
    /** Prose colour note; empty = keep the preset's. */
    toneRegister?: string;
    updatedAtMs?: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'saga-stance.json');

let cache: StanceOverride | null | undefined;

export function getStanceOverride(): StanceOverride | null {
    if (cache !== undefined) return cache;
    try {
        cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as StanceOverride;
    } catch {
        cache = null;
    }
    return cache;
}

export function setStanceOverride(next: StanceOverride | null): void {
    cache = next;
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        if (next) {
            fs.writeFileSync(STORE_PATH, JSON.stringify(next, null, 1));
        } else if (fs.existsSync(STORE_PATH)) {
            fs.rmSync(STORE_PATH);
        }
    } catch (err) {
        console.warn('[saga-stance] save failed:', err instanceof Error ? err.message : err);
    }
}

/** Test-only: drop the process cache so a fresh file state is re-read. */
export function __resetStanceCache(): void {
    cache = undefined;
}
