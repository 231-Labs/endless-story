/**
 * Durable plaintext store for the dossier live-state bar's two outward fields —
 * 此刻心境 (intent ← plan's [眼下打算]) and 將往何方 (nextPlan ← plan's [長期目標]).
 *
 * Why this exists: the dossier header is public + high-traffic, but its only
 * real source used to be a live SEAL decrypt (`recallCurrentPlanText`). That
 * decrypt is rate-limited (429), slow, and per-process — so the bar flipped
 * between the real plan and a '—'/'無' fallback on every reload that missed the
 * warm in-memory PLAN_CACHE or hit a transient SEAL hiccup ("時好時壞").
 *
 * These two one-liners are already considered PUBLIC (the plan body stays
 * SEAL-encrypted; this is just the outward intent — see lib/api/liveState.ts).
 * So we persist them as plaintext at plan-WRITE time (rememberForCharacter
 * kind=plan, same web process that serves /api/tick + the dossier) and let
 * getLiveState read THIS first. The common path becomes a cheap file read with
 * no decrypt, stable across reloads/restarts/instances. SEAL recall is demoted
 * to first-run backfill (characters whose plan predates this store).
 *
 * Mirrors the `web/data/*.json` file-store pattern (recruitments-store.ts).
 * No locking — single-writer assumed (the tick loop). Swap for a DB / KV in a
 * multi-host deploy.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PlanIntent {
    /** 此刻心境 — the plan's [眼下打算] (immediate intent). */
    intent: string;
    /** 將往何方 — the plan's [長期目標] (long-term goal). */
    nextPlan: string;
    /** Narrative day the plan was written, for debugging/auditing. */
    day: number;
    /** Wall-clock write time (ms), for debugging/auditing. */
    ts: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'plan-intents.json');

type Store = Record<string, PlanIntent>;

function readStore(): Store {
    if (!fs.existsSync(STORE_PATH)) return {};
    try {
        const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as Store;
        return raw && typeof raw === 'object' ? raw : {};
    } catch (err) {
        console.warn('[plan-intent-store] corrupt JSON, treating as empty:', err);
        return {};
    }
}

/** Pull the two outward one-liners out of stored plan text (formatPlanText). */
export function parsePlanFields(planText: string): {
    longTermGoal?: string;
    dailyPlanHint?: string;
} {
    const lt = planText.match(/\[長期目標\]\s*(.+)/);
    const dp = planText.match(/\[眼下打算\]\s*(.+)/);
    return {
        longTermGoal: lt?.[1]?.trim() || undefined,
        dailyPlanHint: dp?.[1]?.trim() || undefined,
    };
}

/**
 * Persist a character's outward intent from freshly-written plan text.
 * Best-effort: parses the two labelled lines and only writes when BOTH are
 * present, so a malformed/partial plan never clobbers a good prior entry with
 * blanks. Never throws — a store failure must not break the memory write.
 */
export function writePlanIntentFromText(characterId: string, planText: string, day: number): void {
    try {
        const { longTermGoal, dailyPlanHint } = parsePlanFields(planText);
        if (!longTermGoal || !dailyPlanHint) return;
        const store = readStore();
        store[characterId] = { intent: dailyPlanHint, nextPlan: longTermGoal, day, ts: Date.now() };
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
    } catch (err) {
        console.warn('[plan-intent-store] write failed:', err);
    }
}

/** Read a character's durable outward intent, or null if none stored yet. */
export function readPlanIntent(characterId: string): PlanIntent | null {
    return readStore()[characterId] ?? null;
}
