/**
 * Self-hosted event poller (source-agnostic core, pure / browser-safe).
 *
 * Pulls new events for each tracked type from a pluggable source and upserts
 * them into the store. This replaces a third-party push feed (Surflux) with
 * ingestion we own end to end: one gentle, sequential, cursor-paginated scan
 * per type, far lighter than settlement-time read fan-out, writing durably so
 * the public node's 429s and the ~3-day event-pruning window stop mattering.
 *
 * The source is a `FetchPage` function. `jsonRpcFetchPage` is the stopgap
 * (works today, dies with JSON-RPC on 2026-07-31); a GraphQL `events` adapter
 * is a drop-in replacement for the durable path. Both yield the real on-chain
 * `(txDigest, eventSeq)`, so identity stays consistent across a source swap
 * (unlike a Flux feed, which has no on-chain seq).
 */
import type { CapturedEvent, EventCursor, StoredEvent } from './types.ts';
import { compareEvents } from './page.ts';

/** One newest-first page of events for a single event type. */
export interface EventPageResult {
  events: CapturedEvent[];
  nextCursor: EventCursor | null;
  hasNextPage: boolean;
}

/** Pluggable event source: fetch one descending page after `cursor`. */
export type FetchPage = (
  eventType: string,
  cursor: EventCursor | null,
) => Promise<EventPageResult>;

/** The newest event already ingested for a type (the poll stop line). */
export type HighWater = Pick<CapturedEvent, 'txDigest' | 'eventSeq' | 'timestampMs'>;

// compareEvents only reads the three ordering fields, so a HighWater is a
// valid argument; the cast just satisfies its StoredEvent parameter type.
const isNewer = (e: CapturedEvent, hwm: HighWater | null): boolean =>
  hwm === null || compareEvents(e, hwm as StoredEvent) > 0;

/**
 * Poll one event type newest-first, upserting events strictly newer than the
 * high-water mark and stopping the moment we reach it (or run out of pages).
 * Returns the new mark (the newest event seen) and the count ingested.
 * Idempotent: re-running with the returned mark ingests nothing, and a small
 * overlap is harmless because upsert is keyed on `(txDigest, eventSeq)`.
 */
export async function pollType(
  fetchPage: FetchPage,
  upsert: (e: CapturedEvent) => Promise<void>,
  eventType: string,
  hwm: HighWater | null,
  maxPages = 1000,
): Promise<{ newHwm: HighWater | null; ingested: number }> {
  let cursor: EventCursor | null = null;
  let newHwm: HighWater | null = hwm;
  let ingested = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const res = await fetchPage(eventType, cursor);
    for (const e of res.events) {
      if (!isNewer(e, hwm)) return { newHwm, ingested }; // caught up to the mark
      await upsert(e);
      ingested += 1;
      if (isNewer(e, newHwm)) {
        newHwm = { txDigest: e.txDigest, eventSeq: e.eventSeq, timestampMs: e.timestampMs };
      }
    }
    if (!res.hasNextPage || !res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return { newHwm, ingested };
}

/** Poll every tracked type once, threading each type's mark through `marks`. */
export async function pollAllOnce(
  fetchPage: FetchPage,
  upsert: (e: CapturedEvent) => Promise<void>,
  types: readonly string[],
  marks: Map<string, HighWater | null>,
): Promise<number> {
  let total = 0;
  for (const t of types) {
    const { newHwm, ingested } = await pollType(fetchPage, upsert, t, marks.get(t) ?? null);
    marks.set(t, newHwm);
    total += ingested;
  }
  return total;
}

/**
 * Structural subset of a Sui JSON-RPC client (just `queryEvents`), so this
 * package needs no `@mysten/sui` dependency. A real `SuiJsonRpcClient`
 * satisfies it; the runnable entrypoint passes one in.
 */
export interface QueryEventsClient {
  queryEvents(params: {
    query: { MoveEventType: string };
    cursor: EventCursor | null;
    limit: number;
    order: 'descending' | 'ascending';
  }): Promise<{
    data: Array<{
      id: EventCursor;
      type: string;
      parsedJson: unknown;
      timestampMs?: string | null;
      sender?: string | null;
    }>;
    hasNextPage: boolean;
    nextCursor?: EventCursor | null;
  }>;
}

function pickStr(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === 'object' && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

/** JSON-RPC source adapter (stopgap; replace with a GraphQL adapter pre-July). */
export function jsonRpcFetchPage(client: QueryEventsClient, limit = 50): FetchPage {
  return async (eventType, cursor) => {
    const res = await client.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      limit,
      order: 'descending',
    });
    const events: CapturedEvent[] = res.data.map((ev) => ({
      txDigest: ev.id.txDigest,
      eventSeq: ev.id.eventSeq,
      type: ev.type,
      parsedJson: ev.parsedJson,
      timestampMs: ev.timestampMs ? Number(ev.timestampMs) : 0,
      sender: ev.sender ?? undefined,
      sagaId: pickStr(ev.parsedJson, 'saga_id'),
      sceneId: pickStr(ev.parsedJson, 'scene_id'),
    }));
    return { events, nextCursor: res.nextCursor ?? null, hasNextPage: res.hasNextPage };
  };
}
