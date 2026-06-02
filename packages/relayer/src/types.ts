// Self-hosted MemWal relayer — shared types.
//
// The relayer is PLAINTEXT-BLIND: it stores only the embedding vector + scalar metadata
// (importance / day / kind / anchored) + the Walrus blob id. The memory text stays SEAL-
// encrypted; decryption happens client-side. The relayer never sees content.

/** One stored memory in a character's namespace. */
export interface MemoryRecord {
  /** Walrus blob id of the SEAL-encrypted text. */
  blob_id: string;
  /** embedding of the (plaintext) memory — used for relevance. */
  vector: number[];
  /** 1..10 narrative importance (from the `[[m|i=..]]` tag). */
  importance: number;
  /** narrative day written (for recency decay). */
  day: number;
  /** memory kind: observation|chapter|reflection|plan|relationship|dream|genesis|unknown. */
  kind: string;
  /** sleep-consolidated anchor (a=1) — pinned, bypasses the relevance floor. */
  anchored: boolean;
  /** wall-clock ms the record was created (debug/ops only). */
  created_at: number;
}

export interface RememberRequest {
  /** base64 of the SEAL-encrypted bytes. */
  encrypted_data: string;
  vector: number[];
  namespace: string;
  /** new metadata (optional → safe defaults, so the OLD client still works). */
  importance?: number;
  day?: number;
  kind?: string;
  anchored?: boolean;
}

export interface RecallRequest {
  vector: number[];
  namespace: string;
  limit?: number;
  /** current narrative day; omit → recency factor disabled (degrades to importance×relevance). */
  today?: number;
  /** recency half-life in narrative days (default 2, matches the client). */
  halfLife?: number;
  /** drop non-pinned memories whose cosine similarity is below this (default 0.1). */
  relevanceFloor?: number;
}

export interface RecallHit {
  blob_id: string;
  /** 1 − cosineSimilarity, so smaller = closer (kept for client compatibility). */
  distance: number;
  /** the composite three-factor score the ranking used (for transparency/tuning). */
  score: number;
}

export interface ControlState {
  /** when true, the world-loop runner skips ticks (admin pause switch). */
  paused: boolean;
  updated_at: number;
}
