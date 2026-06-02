// Three-factor recall scoring — the WHOLE point of self-hosting the relayer.
//
// Unlike the managed top-K-by-distance API (which only re-ranks the relevance-retrieved
// candidate set), this scores the ENTIRE namespace by:
//
//     score = (importance/10) × recency(today − day) × relevance(cosine similarity)
//
// mirroring the client formula (packages/web/.../memory.ts). At our scale (hundreds–thousands
// of memories per namespace) a full brute-force scan is exact and sub-millisecond, so there is
// no candidate-set blind spot: a high-importance / very-recent memory can surface even if it is
// semantically distant. Anchored (sleep-consolidated) memories are pinned past the floor.

import type { MemoryRecord, RecallHit } from "./types.ts";

/** Kinds that are always considered (pinned), even below the relevance floor. */
const PIN_KINDS = new Set(["plan", "genesis"]);

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 0.5^((today − day)/halfLife). Returns 1 when `today` is undefined (recency disabled). */
export function recencyWeight(day: number, today: number | undefined, halfLife: number): number {
  if (today === undefined || halfLife <= 0) return 1;
  const age = Math.max(0, today - day);
  return Math.pow(0.5, age / halfLife);
}

export interface ScoreOpts {
  today?: number;
  halfLife?: number;
  relevanceFloor?: number;
  limit?: number;
}

function isPinned(r: MemoryRecord): boolean {
  return r.anchored || PIN_KINDS.has(r.kind);
}

/** Score a whole namespace and return the top-`limit` hits by composite score. */
export function scoreNamespace(records: MemoryRecord[], query: number[], opts: ScoreOpts = {}): RecallHit[] {
  const halfLife = opts.halfLife ?? 2;
  const floor = opts.relevanceFloor ?? 0.1;
  const limit = opts.limit ?? 10;

  const hits: RecallHit[] = [];
  for (const r of records) {
    const sim = cosineSimilarity(query, r.vector);
    if (!isPinned(r) && sim < floor) continue; // relevance floor (pins exempt)
    const importanceW = Math.max(1, Math.min(10, r.importance)) / 10;
    const recencyW = recencyWeight(r.day, opts.today, halfLife);
    const score = importanceW * recencyW * Math.max(0, sim);
    hits.push({ blob_id: r.blob_id, distance: 1 - sim, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
