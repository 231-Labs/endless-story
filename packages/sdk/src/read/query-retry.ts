/**
 * Event reads: from the durable store when one is registered, else a degraded
 * single-page GraphQL read with retry on TRANSIENT failures.
 *
 * A registered EventStore (injected server-side via `setEventStore`) serves the
 * `MoveEventType` reads the engine runs, so settlement / feeds read from the
 * indexer's Postgres store instead of the network. This is the normal path in
 * production (page render, tick, and layout all register the store).
 *
 * When no store is registered on a worker, or for a filter the store cannot
 * answer, this falls back to the Sui GraphQL `events` query. gRPC has no
 * `queryEvents` equivalent and JSON-RPC is being decommissioned, so GraphQL is
 * the only live event source. The fallback is deliberately single-page (newest
 * first): deep historical scans are the store's job, and a rare unregistered
 * worker only needs enough to avoid a hard-erroring feed. Set SUI_GRAPHQL_URL to
 * override the endpoint.
 *
 * Non-MoveEventType filters (never used by the engine) fail loudly rather than
 * silently returning nothing.
 */
import type { SuiClient } from '../client.js';
import {
  rpcParamsToQuery,
  eventPageToRpc,
  graphqlFetchPage,
  type GraphqlExec,
  type RpcQueryEventsParams,
  type RpcEventsPage,
} from '@endless-story/indexer';
import { getEventStore } from './event-store.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const TRANSIENT = /429|rate|limit|timeout|fetch failed|econn|reset|502|503|504|gateway/;

const DEFAULT_GRAPHQL_URL = 'https://graphql.testnet.sui.io/graphql';

function graphqlUrl(): string {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const v = env?.SUI_GRAPHQL_URL;
  return v && v.trim() ? v.trim() : DEFAULT_GRAPHQL_URL;
}

/** Fetch-based GraphQL executor for the fallback (no SDK GraphQL client needed). */
function makeExec(): GraphqlExec {
  const url = graphqlUrl();
  return async (query, variables) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = (await res.json()) as { data?: unknown; errors?: unknown };
    if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
    return json.data;
  };
}

// The `client` argument is retained for call-site compatibility (every read-seam
// caller already holds one) but event reads no longer touch it — the store and
// the GraphQL fallback are both transport-independent.
export async function queryEventsWithRetry(
  _client: SuiClient,
  params: RpcQueryEventsParams,
  retries = 4,
): Promise<RpcEventsPage> {
  const query = rpcParamsToQuery(params);

  // Durable store first. It reproduces the queryEvents page/cursor contract, so
  // its result drops straight into every caller unchanged.
  const store = getEventStore();
  if (store && query) {
    const page = await store.queryEvents(query);
    return eventPageToRpc(page);
  }

  if (!query) {
    throw new Error(
      'queryEventsWithRetry: unsupported event filter (only MoveEventType is served)',
    );
  }

  // Degraded fallback: one newest-first GraphQL page for the filtered type.
  const fetchPage = graphqlFetchPage(makeExec(), query.limit ?? 50);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      const backoff = Math.min(8000, 500 * 2 ** (attempt - 1));
      await sleep(backoff + Math.floor(Math.random() * backoff * 0.3));
    }
    try {
      const page = await fetchPage(query.moveEventType ?? '', null);
      const rows = (query.order ?? 'descending') === 'ascending'
        ? page.events.slice().reverse()
        : page.events;
      return {
        data: rows.map((e) => ({
          id: { txDigest: e.txDigest, eventSeq: e.eventSeq },
          type: e.type,
          parsedJson: e.parsedJson,
          timestampMs: String(e.timestampMs),
        })),
        // Single-page degraded mode: never advertise more pages.
        hasNextPage: false,
        nextCursor: null,
      };
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (TRANSIENT.test(msg)) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** A single event from a page (carries `parsedJson` + the envelope `id`). The
 *  page shape is whatever `queryEventsWithRetry` yields — the durable store or
 *  the GraphQL fallback — so this stays correct after the gRPC migration (the
 *  gRPC client has no `queryEvents` to derive from). */
type ScannedEvent = Awaited<ReturnType<typeof queryEventsWithRetry>>['data'][number];

/**
 * Page through every `MoveEventType: eventType` event, newest-first (descending,
 * 50 per page), retrying transient RPC failures per page. Calls `onEvent` for
 * each event; return `false` to stop early (e.g. once a cap is hit). Centralises
 * the cursor-paging loop the read modules used to copy-paste verbatim.
 */
export async function scanEvents(
    client: SuiClient,
    eventType: string,
    onEvent: (ev: ScannedEvent) => boolean | void,
): Promise<void> {
    let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
    for (;;) {
        const page = await queryEventsWithRetry(client, {
            query: { MoveEventType: eventType },
            cursor,
            limit: 50,
            order: 'descending',
        });
        for (const ev of page.data) {
            if (onEvent(ev) === false) return;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
}
