/**
 * Director resource INTENTS — "who is this stake for".
 *
 * A director-created resource of a brand-new kind has no row in ROLE_AMBITION, so
 * by default every 行當 wants it equally (flat 0.5 → broad, character-less scramble).
 * When the Showrunner mints one with `register_resource` it may name the 行當 the
 * stake is FOR; we store that here, keyed by the on-chain label, and the drama
 * derivation reads it so only those roles ache for it (others stand down). This is
 * the off-chain DEMAND half — same status as ROLE_AMBITION itself, which is also
 * off-chain code — so a JSON file beside director-memory is the right home.
 *
 * Stale entries (label no longer live) are harmless: the derivation only consults
 * an intent when its resource is in the live ledger.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ResourceIntent {
    /** 行當 substrings that ache for this stake (matched like ROLE_AMBITION). */
    wantedBy: string[];
}

/** label (`kind:display`) → intent. */
export type ResourceIntents = Record<string, ResourceIntent>;

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'resource-intents.json');

export function readResourceIntents(): ResourceIntents {
    if (!fs.existsSync(STORE_PATH)) return {};
    try {
        const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as unknown;
        if (!raw || typeof raw !== 'object') return {};
        const out: ResourceIntents = {};
        for (const [label, v] of Object.entries(raw as Record<string, unknown>)) {
            const wantedBy = (v as ResourceIntent)?.wantedBy;
            if (Array.isArray(wantedBy)) {
                const clean = wantedBy.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
                if (clean.length > 0) out[label] = { wantedBy: clean };
            }
        }
        return out;
    } catch (err) {
        console.warn('[resource-intents] corrupt JSON, treating as empty:', err);
        return {};
    }
}

/** Record (or clear) who a director-created stake is for. Best-effort; never throws. */
export function saveResourceIntent(label: string, wantedBy: string[]): void {
    try {
        const clean = wantedBy.map((s) => s.trim()).filter((s) => s.length > 0);
        if (!label.trim() || clean.length === 0) return;
        const intents = readResourceIntents();
        intents[label] = { wantedBy: clean };
        fs.mkdirSync(DATA_DIR, { recursive: true });
        // Atomic write (temp + rename) so a concurrent reader never sees a half-written
        // file. Single-writer in practice (heartbeat runs after the tick), but cheap.
        const tmp = `${STORE_PATH}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(intents, null, 2), 'utf-8');
        fs.renameSync(tmp, STORE_PATH);
    } catch (err) {
        console.warn('[resource-intents] save failed:', err);
    }
}
