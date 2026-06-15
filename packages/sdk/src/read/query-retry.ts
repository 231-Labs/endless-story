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
