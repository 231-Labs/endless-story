/**
 * `queryEvents` with retry on TRANSIENT RPC failures (429 / 5xx / network). The
 * public fullnode rate-limits hard under a tick's read fan-out; a single 429
 * otherwise throws and callers degrade badly (a blank feed, or — worse — an empty
 * resource ledger that switches the whole drama/chapter pipeline OFF). Set
 * SUI_RPC_URL to a private node to avoid the limits entirely; this is the safety net.
 *
 * Non-transient errors fail fast (no point retrying a bad request).
 */
import type { SuiClient } from '../client.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const TRANSIENT = /429|rate|limit|timeout|fetch failed|econn|reset|502|503|504|gateway/;

export async function queryEventsWithRetry(
    client: SuiClient,
    params: Parameters<SuiClient['queryEvents']>[0],
    retries = 4,
): Promise<Awaited<ReturnType<SuiClient['queryEvents']>>> {
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

/** A single event from a `queryEvents` page (the SuiEvent envelope). */
type ScannedEvent = Awaited<ReturnType<SuiClient['queryEvents']>>['data'][number];

/**
 * Page a `MoveEventType` event log newest-first (limit 50, descending),
 * retrying transient RPC failures via {@link queryEventsWithRetry}, and call
 * `onEvent` once per event. Resolves when the log is exhausted — or early,
 * the moment `onEvent` returns `false` (the caller's cap / short-circuit);
 * any other return value keeps the scan going.
 *
 * `onEvent` gets the event's parsed JSON; the raw SuiEvent envelope is passed
 * as a second arg only for the few callers that need `id.txDigest` /
 * `id.eventSeq` (stable client-side ordering). Most ignore it.
 *
 * This is the one shared shape behind ~12 read-layer scanners; keeping the
 * paging/cursor/order/limit contract in one place is deliberate — past
 * regressions in this repo were read-window bugs (wrong order, cursor not
 * followed, off-by-one caps).
 */
export async function scanEvents(
    client: SuiClient,
    eventType: string,
    onEvent: (parsed: Record<string, unknown>, ev: ScannedEvent) => boolean | void,
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
            if (onEvent(ev.parsedJson as Record<string, unknown>, ev) === false) return;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
}
