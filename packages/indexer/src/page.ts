/**
 * Pure pagination over an in-memory event set. This is the reference
 * implementation of the `queryEvents` contract and the test oracle; the
 * Postgres store pushes the identical semantics into SQL (keyset
 * pagination over the same canonical order).
 */
import type {
  EventCursor,
  EventOrder,
  EventPage,
  EventRow,
  EventQuery,
  StoredEvent,
} from './types.ts';

/**
 * Canonical total order over stored events: by emit time, then the unique
 * `(txDigest, eventSeq)` pair as a deterministic tiebreak. `timestampMs`
 * is the only meaningful time key (tx digests are content hashes, not
 * chronological); the pair only separates events sharing a millisecond.
 * Returns negative when `a` precedes `b` chronologically.
 */
export function compareEvents(a: StoredEvent, b: StoredEvent): number {
  if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
  if (a.txDigest !== b.txDigest) return a.txDigest < b.txDigest ? -1 : 1;
  const as = BigInt(a.eventSeq);
  const bs = BigInt(b.eventSeq);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

const sameId = (e: StoredEvent, c: EventCursor): boolean =>
  e.txDigest === c.txDigest && e.eventSeq === c.eventSeq;

const toRow = (e: StoredEvent): EventRow => ({
  id: { txDigest: e.txDigest, eventSeq: e.eventSeq },
  type: e.type,
  parsedJson: e.parsedJson,
  timestampMs: String(e.timestampMs),
});

/**
 * Reproduce the `queryEvents` contract: filter by `moveEventType`, order,
 * then return the `limit` rows strictly after `cursor`. Repeated calls
 * threading the returned `nextCursor` walk the entire matching set once,
 * with no duplicates and no gaps. An unknown cursor (not in the filtered
 * set) yields an empty tail, never a silent restart.
 */
export function pageEvents(all: readonly StoredEvent[], query: EventQuery): EventPage {
  const limit = query.limit ?? 50;
  const order: EventOrder = query.order ?? 'descending';

  const ordered = (
    query.moveEventType ? all.filter((e) => e.type === query.moveEventType) : all.slice()
  ).sort(compareEvents);
  if (order === 'descending') ordered.reverse();

  let start = 0;
  if (query.cursor) {
    const idx = ordered.findIndex((e) => sameId(e, query.cursor!));
    start = idx >= 0 ? idx + 1 : ordered.length;
  }

  const slice = ordered.slice(start, start + limit);
  const hasNextPage = start + limit < ordered.length;
  const last = slice[slice.length - 1];
  const nextCursor: EventCursor | null = last
    ? { txDigest: last.txDigest, eventSeq: last.eventSeq }
    : null;

  return { data: slice.map(toRow), hasNextPage, nextCursor };
}
