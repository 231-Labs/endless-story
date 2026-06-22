/**
 * Event-store contract types.
 *
 * The store mirrors the small subset of the Sui JSON-RPC `queryEvents`
 * surface that the Endless Story engine actually uses: a single
 * `MoveEventType` filter, ascending/descending order, and an opaque
 * `{txDigest, eventSeq}` cursor. Reproducing that shape is the whole point.
 * It lets the sdk swap its event source from live RPC to this durable
 * store without touching a single caller in `read/*.ts` or the runner
 * event-bus (they keep passing the same query, getting the same page back).
 *
 * Why a store at all: `queryEvents` is JSON-RPC only (it has no gRPC
 * equivalent and dies with JSON-RPC on 2026-07-31), and the public
 * fullnode both rate-limits the read fan-out (429) and prunes events after
 * ~3 days. Capturing events into Postgres as they finalize makes the read
 * path durable, un-throttled, and prune-proof.
 */

/** Opaque pagination cursor. Identical to a Sui event id. */
export interface EventCursor {
  txDigest: string;
  eventSeq: string;
}

/**
 * A persisted chain event, normalized from a Flux stream row, a backfill
 * `queryEvents` row, or a test fixture. `(txDigest, eventSeq)` is the
 * stable identity (and the Postgres primary key).
 */
export interface StoredEvent {
  txDigest: string;
  eventSeq: string;
  /** Fully-qualified `${packageId}::module::Struct`. */
  type: string;
  parsedJson: unknown;
  /**
   * Emit time in epoch ms. The canonical ordering key: Sui tx digests are
   * content hashes (not chronological), so this is the only meaningful
   * sense of "newest". Capture and backfill always supply it.
   */
  timestampMs: number;
}

/**
 * One returned event row. Shaped like `@mysten/sui`'s `SuiEvent` for the
 * exact fields the engine reads downstream: `id`, `type`, `parsedJson`,
 * `timestampMs`. (Callers in `read/*.ts` read `ev.parsedJson`; the runner
 * event-bus reads `ev.id.txDigest`, `ev.id.eventSeq`, `ev.timestampMs`.)
 */
export interface EventRow {
  id: EventCursor;
  type: string;
  parsedJson: unknown;
  timestampMs: string;
}

/** Mirrors the `queryEvents` page envelope. */
export interface EventPage {
  data: EventRow[];
  hasNextPage: boolean;
  nextCursor: EventCursor | null;
}

export type EventOrder = 'ascending' | 'descending';

/**
 * The query the store answers. `MoveEventType` is the only event filter
 * the engine uses today; the RPC-shaped `{ query: { MoveEventType } }` is
 * flattened to `moveEventType` here, and the sdk seam adapts between them.
 */
export interface EventQuery {
  /** Fully-qualified event type to match. Omit to match all stored types. */
  moveEventType?: string;
  cursor?: EventCursor | null;
  /** Page size. Default 50, matching every RPC call site. */
  limit?: number;
  /** Default 'descending' (newest-first), matching every RPC call site. */
  order?: EventOrder;
}

/**
 * Minimal read surface. Both `PgEventStore` (production) and
 * `MemoryEventStore` (tests / fake) implement it, and a thin adapter over
 * a real `SuiClient` satisfies it too, so the seam can fall back to live
 * RPC during the transition.
 */
export interface EventReader {
  queryEvents(query: EventQuery): Promise<EventPage>;
}

/**
 * The write-side shape: a `StoredEvent` plus the columns the store keeps
 * for filtering and provenance but the read contract does not surface.
 * `package_id` and `module` are derived from `type`; `sagaId` / `sceneId`
 * are denormalized from `parsedJson` so saga feeds avoid a JSON probe.
 */
export interface CapturedEvent extends StoredEvent {
  sender?: string;
  bcs?: string;
  checkpoint?: number;
  sagaId?: string;
  sceneId?: string;
}
