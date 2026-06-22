/**
 * NARRATIVE OBSERVATORY — env snapshot (load FIRST, before harness-setup).
 *
 * Split out from narrative-setup so it evaluates BEFORE harness-setup: ESM evaluates
 * a module's imports in source order, depth-first, so `narrative-setup` listing this
 * module's import above harness-setup's guarantees the snapshot is taken while the
 * credentials are still present. harness-setup then DELETES them at its own
 * module-eval (it wants a fully offline mechanism run); narrative-setup restores the
 * LLM + embedding keys from `SAVED_ENV` afterward.
 *
 * It also loads packages/web/.env.local (next dev does this automatically; a bare tsx
 * run does not) with a zero-dep parser so operator keys placed there reach the run.
 */

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** KEY=VALUE per line, `#` comments, optional quotes, `export ` tolerated. Real
 *  environment wins (never overwrites an already-set var). */
function loadEnvLocal(path: string): void {
    let raw: string;
    try {
        raw = readFileSync(path, 'utf8');
    } catch {
        return; // no .env.local → keys may come from the real environment.
    }
    for (const lineRaw of raw.split(/\r?\n/)) {
        const line = lineRaw.trim();
        if (!line || line.startsWith('#')) continue;
        const body = line.startsWith('export ') ? line.slice(7) : line;
        const eq = body.indexOf('=');
        if (eq < 0) continue;
        const key = body.slice(0, eq).trim();
        if (!key || process.env[key] != null) continue;
        let val = body.slice(eq + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        process.env[key] = val;
    }
}

loadEnvLocal(resolve(process.cwd(), '.env.local'));

// Chapter dump dir — chapter-dump.ts reads ES_CHAPTER_DUMP_DIR at MODULE-INIT, and the
// cut (woven 回) + gazette full text are NOT in TickLoopResult (they run in background-
// style steps). The observatory captures them by dumping to files and reading them back
// each tick. Set here (the earliest-evaluated module) so it lands before chapter-dump is
// imported. Operator can override / point at a kept dir; default = a fresh tmp dir.
if (!process.env.ES_CHAPTER_DUMP_DIR) {
    process.env.ES_CHAPTER_DUMP_DIR = mkdtempSync(join(tmpdir(), 'es-narrative-'));
}
export const CHAPTER_DUMP_DIR = process.env.ES_CHAPTER_DUMP_DIR;

/** Credentials + model overrides captured BEFORE harness-setup deletes them. */
export const SAVED_ENV = {
    POE_API_KEY: process.env.POE_API_KEY,
    ZAI_API_KEY: process.env.ZAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_API_BASE: process.env.OPENAI_API_BASE,
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
    ZAI_MODEL_PRIMARY: process.env.ZAI_MODEL_PRIMARY,
    ZAI_MODEL_CHEAP: process.env.ZAI_MODEL_CHEAP,
    ZAI_BASE_URL: process.env.ZAI_BASE_URL,
    POE_MODEL_PRIMARY: process.env.POE_MODEL_PRIMARY,
    POE_MODEL_CHEAP: process.env.POE_MODEL_CHEAP,
    ANTHROPIC_MODEL_PRIMARY: process.env.ANTHROPIC_MODEL_PRIMARY,
    ANTHROPIC_MODEL_CHEAP: process.env.ANTHROPIC_MODEL_CHEAP,
} as const;
