/**
 * Event reads: from the durable store when one is registered, else
 * `queryEvents` over live RPC with retry on TRANSIENT failures.
 *
 * A registered EventStore (injected server-side via `setEventStore`) serves
 * the `MoveEventType` reads the engine runs, so settlement / feeds stop
 * hitting the rate-limited, pruning public node. When no store is set, or for
 * a filter the store cannot answer, this falls back to the original RPC path:
 * the public fullnode rate-limits hard under a tick's read fan-out, and a
 * single 429 otherwise throws and degrades callers badly (a blank feed, or
 * worse, an empty resource ledger that switches the whole drama/chapter
 * pipeline OFF). Set SUI_RPC_URL to a private node to avoid the limits; this
 * is the safety net.
 *
 * Non-transient errors fail fast (no point retrying a bad request).
 */
import type { SuiClient } from '../client.js';
import { rpcParamsToQuery, eventPageToRpc } from '@endless-story/indexer';
import { getEventStore } from './event-store.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const TRANSIENT = /429|rate|limit|timeout|fetch failed|econn|reset|502|503|504|gateway/;

type QueryEventsResult = Awaited<ReturnType<SuiClient['queryEvents']>>;

export async function queryEventsWithRetry(
    client: SuiClient,
    params: Parameters<SuiClient['queryEvents']>[0],
    retries = 4,
): Promise<QueryEventsResult> {
    // Durable store first. It reproduces the queryEvents page/cursor contract,
    // so its result drops straight into every caller unchanged. Falls through
    // to RPC when no store is registered or the filter is not a MoveEventType.
    const store = getEventStore();
    if (store) {
        const query = rpcParamsToQuery(params as unknown as Parameters<typeof rpcParamsToQuery>[0]);
        if (query) {
            const page = await store.queryEvents(query);
            return eventPageToRpc(page) as unknown as QueryEventsResult;
        }
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (attempt > 0) {
            const backoff = Math.min(8000, 500 * 2 ** (attempt - 1));
            await sleep(backoff + Math.floor(Math.random() * backoff * 0.3));
        }
        try {
            return await client.queryEvents(params);
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
