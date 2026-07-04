/**
 * NARRATIVE OBSERVATORY — SETUP. Import this FIRST, before anything that
 * transitively imports the tick loop / sdk client / llm client, so the env seam is
 * in place before module-init reads it.
 *
 * Same fake-chain / fake-walrus isolation as the full-tick *mechanism* harness, but
 * two faked subsystems are flipped back to REAL so we can watch the *story* instead
 * of the *plumbing*:
 *
 *   · LLM  → REAL prose (ES_NARRATIVE_REAL_LLM=1). Needs a provider key — POE_API_KEY
 *            or ZAI_API_KEY or ANTHROPIC_API_KEY (see packages/llm/src/config.ts; the
 *            default provider order is zai → poe → anthropic). Image stays faked.
 *   · MEMORY → REAL recall, in-memory (ES_NARRATIVE=1). No relayer / SEAL / Walrus /
 *            chain. Real OpenAI embeddings when OPENAI_API_KEY is set (else a
 *            deterministic fake vector for a mechanism-only smoke). See
 *            lib/chain/memory.ts narrativeEmbed/narrativeRecall.
 *
 *   chain + walrus stay FAKE → no Sui RPC limiting, no Walrus prune. Those were the
 *   confounds that made "chapters repeat" ambiguous; with them gone, a repeat is a
 *   NARRATIVE-mechanism signal (recall + storyteller progression gate), not infra.
 *
 * The point: leave it running with keys filled and READ the printed chapters tick
 * over tick — do they iterate / advance, or circle the same standoff?
 *
 * ── HOW TO PROVIDE KEYS ──────────────────────────────────────────────────────
 * The dev worktree has no .env.local. To see REAL iteration, create
 *   packages/web/.env.local
 * with:
 *   ZAI_API_KEY=...          # OR POE_API_KEY=... OR ANTHROPIC_API_KEY=...  (text LLM)
 *   OPENAI_API_KEY=...       # embeddings for real recall relevance
 * Without keys the observatory still RUNS (fake LLM via the no-real-LLM fallback +
 * deterministic fake embeddings), proving the wiring — but the prose is filler and
 * the recall relevance is crude, so it can't show real iteration.
 *
 * IMPORT ORDER (load-bearing):
 *   1. ./narrative-env  — loads .env.local + snapshots the keys (BEFORE step 2 wipes
 *      them). Must be listed first so ESM evaluates it first.
 *   2. ./harness-setup  — builds the fake chain, installs the fake sui client, sets
 *      ES_HARNESS, and DELETES the provider/MemWal/OpenAI keys.
 * Then we restore the LLM + embedding keys from the snapshot and flip the observatory
 * flags on. Keys are read lazily (per-tick createTextClient, per-call narrativeEmbed),
 * so restoring after harness-setup ran is sufficient.
 */

// 1) Snapshot keys + load .env.local. MUST come before harness-setup.
import { SAVED_ENV } from './narrative-env';
// 2) Fake chain / walrus isolation (also deletes the keys we just snapshotted).
import { seedWorld as _seedWorld, harnessChain } from './harness-setup';

// ── re-install the bits harness-setup cleared, then turn the observatory on ──
// We intentionally do NOT restore MemWal keys: memory is in-memory via ES_NARRATIVE,
// not the relayer.
for (const k of Object.keys(SAVED_ENV) as (keyof typeof SAVED_ENV)[]) {
    const v = SAVED_ENV[k];
    if (v != null && v !== '') process.env[k] = v;
    else delete process.env[k];
}

// Observatory flag: in-memory real-recall memory (always on — the iteration engine).
process.env.ES_NARRATIVE = '1';

// Real LLM only when a provider key is actually present. Forcing the real client
// without a key makes createTextClient THROW ("no text provider configured"), which
// aborts plan/POV before recall even runs — so the no-key SMOKE would crash and prove
// nothing. With no key we leave ES_NARRATIVE_REAL_LLM unset → the ES_HARNESS fake LLM
// serves filler prose, the mechanism (plan → remember → recall → POV) runs, and the
// wiring is verified. The OBSERVATORY (real iteration) needs the key + this flag.
const _hasTextKey = Boolean(
    process.env.ZAI_API_KEY || process.env.POE_API_KEY || process.env.ANTHROPIC_API_KEY,
);
if (_hasTextKey) {
    process.env.ES_NARRATIVE_REAL_LLM = '1';
} else {
    delete process.env.ES_NARRATIVE_REAL_LLM;
}

export { harnessChain };

/** Re-export seedWorld so the runner seeds AFTER this module finalizes the env. */
export function seedWorld(...args: Parameters<typeof _seedWorld>): void {
    return _seedWorld(...args);
}

/** True when a text provider key is present → REAL prose. Else fake-LLM filler. */
export function hasTextProviderKey(): boolean {
    return Boolean(
        process.env.ZAI_API_KEY || process.env.POE_API_KEY || process.env.ANTHROPIC_API_KEY,
    );
}

/** True when an embedding key is present → REAL recall relevance. */
export function hasEmbeddingKey(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
}
