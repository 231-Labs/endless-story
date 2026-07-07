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

/**
 * Opaque continuation cursor threaded by the poller. Each source interprets its
 * own: the JSON-RPC adapter uses a real `{txDigest,eventSeq}` `EventCursor`, the
 * GraphQL adapter uses an opaque base64 connection cursor (a `string`). `pollType`
 * never inspects it — it only passes `nextCursor` back and checks for null — so a
 * source swap is invisible to the poll core.
 */
export type SourceCursor = EventCursor | string | null;

/** One newest-first page of events for a single event type. */
export interface EventPageResult {
  events: CapturedEvent[];
  nextCursor: SourceCursor;
  hasNextPage: boolean;
}

/** Pluggable event source: fetch one descending page after `cursor`. */
export type FetchPage = (
  eventType: string,
  cursor: SourceCursor,
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
  let cursor: SourceCursor = null;
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

/**
 * JSON-RPC source adapter (stopgap; the public JSON-RPC dies 2026-07-31).
 * Prefer `graphqlFetchPage` for the durable path. The incoming cursor is always
 * the `EventCursor` this adapter itself produced, so the narrowing cast is safe.
 */
export function jsonRpcFetchPage(client: QueryEventsClient, limit = 50): FetchPage {
  return async (eventType, cursor) => {
    const res = await client.queryEvents({
      query: { MoveEventType: eventType },
      cursor: (cursor as EventCursor | null) ?? null,
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

/**
 * A GraphQL executor: run `query` with `variables` and resolve the `data` object
 * (throwing on GraphQL errors). Structural so this package needs no
 * `@mysten/sui` dependency; the runnable entrypoint wraps a real
 * `SuiGraphQLClient` into one.
 */
export type GraphqlExec = (
  query: string,
  variables: Record<string, unknown>,
) => Promise<unknown>;

/** Newest-first page of one event type over the Sui GraphQL `events` query. */
const GRAPHQL_EVENTS_QUERY = `query Events($type: String!, $last: Int!, $before: String) {
  events(last: $last, before: $before, filter: { type: $type }) {
    pageInfo { hasPreviousPage startCursor }
    nodes {
      sequenceNumber
      timestamp
      transaction { digest }
      sender { address }
      contents { type { repr } json }
    }
  }
}`;

interface GraphqlEventNode {
  sequenceNumber?: number | string | null;
  timestamp?: string | null;
  transaction?: { digest?: string | null } | null;
  sender?: { address?: string | null } | null;
  contents?: { type?: { repr?: string | null } | null; json?: unknown } | null;
}
interface GraphqlEventsData {
  events?: {
    pageInfo?: { hasPreviousPage?: boolean | null; startCursor?: string | null } | null;
    nodes?: GraphqlEventNode[] | null;
  } | null;
}

/**
 * GraphQL source adapter — the durable replacement for `jsonRpcFetchPage`.
 * Uses backward pagination (`last`/`before`) so each fetch returns the newest
 * unseen page; the connection returns nodes oldest→newest, so we reverse to the
 * newest-first order the poll core expects. The opaque connection `startCursor`
 * is threaded back as the `before` bound for the next (older) page. Identity is
 * the real on-chain `(txDigest, eventSeq)`, so it stays consistent with any
 * events the JSON-RPC adapter captured before the swap.
 */
export function graphqlFetchPage(exec: GraphqlExec, limit = 50): FetchPage {
  return async (eventType, cursor) => {
    const before = typeof cursor === 'string' ? cursor : null;
    const data = (await exec(GRAPHQL_EVENTS_QUERY, {
      type: eventType,
      last: limit,
      before,
    })) as GraphqlEventsData;
    const conn = data.events ?? {};
    const nodes = conn.nodes ?? [];
    const events: CapturedEvent[] = nodes
      .slice()
      .reverse()
      .map((n) => {
        const parsedJson = n.contents?.json ?? null;
        return {
          txDigest: n.transaction?.digest ?? '',
          eventSeq: String(n.sequenceNumber ?? '0'),
          type: n.contents?.type?.repr ?? eventType,
          parsedJson,
          timestampMs: n.timestamp ? Date.parse(n.timestamp) : 0,
          sender: n.sender?.address ?? undefined,
          sagaId: pickStr(parsedJson, 'saga_id'),
          sceneId: pickStr(parsedJson, 'scene_id'),
        };
      });
    return {
      events,
      nextCursor: conn.pageInfo?.startCursor ?? null,
      hasNextPage: Boolean(conn.pageInfo?.hasPreviousPage),
    };
  };
}
