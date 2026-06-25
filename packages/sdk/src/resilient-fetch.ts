/**
 * A drop-in `fetch` for Sui JSON-RPC transports that survives the public
 * fullnode's 429s WITHOUT a dedicated node. Browser-safe (no node deps).
 *
 * Three layers, in order of safety:
 *   1. retry — transient failures (429 / 5xx / network) back off exponentially,
 *      honoring `Retry-After`. This is what saves the chamber/dossier read
 *      fan-out from a single 429 throwing the whole page into a degraded state.
 *   2. in-flight dedup — identical concurrent READ requests (same method +
 *      params) share one network round-trip. Zero staleness risk (only shares
 *      requests that are literally in flight at the same time).
 *   3. static TTL cache — package ABI lookups (`getNormalizedMove*`,
 *      chain id) never change for a deployed package, so they are cached for a
 *      while. These are a big slice of every codegen `*.get` (it resolves the
 *      type layout before reading the object), so caching them cuts a lot of
 *      calls. Object / owned-object reads are deliberately NOT TTL-cached, so
 *      read-after-write (create a vault, then look it up) stays correct.
 */

type FetchFn = typeof fetch;

export interface ResilientFetchOptions {
  /** retry attempts after the first try (default 4). */
  retries?: number;
  /** cap on a single backoff wait, ms (default 8000). */
  maxBackoffMs?: number;
  /** TTL for static ABI reads, ms (default 10 min). */
  staticTtlMs?: number;
  /** underlying fetch — injectable for tests. */
  fetchImpl?: FetchFn;
}

/** Reads whose identical concurrent calls can be coalesced (no TTL). */
const DEDUP_METHODS = new Set<string>([
  'sui_getObject',
  'sui_multiGetObjects',
  'sui_tryGetPastObject',
  'sui_tryMultiGetPastObjects',
  'suix_getOwnedObjects',
  'suix_getDynamicFields',
  'suix_getDynamicFieldObject',
  'suix_queryEvents',
  'suix_getCoins',
  'suix_getAllCoins',
  'suix_getBalance',
  'suix_getAllBalances',
  'suix_getReferenceGasPrice',
  'suix_getLatestSuiSystemState',
]);

/** Reads that are immutable for a deployed package → safe to TTL-cache. */
const STATIC_METHODS = new Set<string>([
  'sui_getNormalizedMoveModule',
  'sui_getNormalizedMoveModulesByPackage',
  'sui_getNormalizedMoveFunction',
  'sui_getNormalizedMoveStruct',
  'sui_getChainIdentifier',
]);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function backoffMs(attempt: number, max: number): number {
  const base = Math.min(max, 500 * 2 ** attempt);
  return base + Math.floor(Math.random() * base * 0.3);
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(header);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
}

function classify(init?: RequestInit): { mode: 'static' | 'dedup' | 'none'; key: string } {
  if (!init || init.method !== 'POST' || typeof init.body !== 'string') return { mode: 'none', key: '' };
  try {
    const j = JSON.parse(init.body) as { method?: unknown; params?: unknown };
    if (Array.isArray(j) || typeof j.method !== 'string') return { mode: 'none', key: '' };
    const key = `${j.method}:${JSON.stringify(j.params ?? [])}`;
    if (STATIC_METHODS.has(j.method)) return { mode: 'static', key };
    if (DEDUP_METHODS.has(j.method)) return { mode: 'dedup', key };
    return { mode: 'none', key: '' };
  } catch {
    return { mode: 'none', key: '' };
  }
}

interface CachedBody {
  at: number;
  status: number;
  statusText: string;
  body: string;
}

function reconstruct(c: CachedBody): Response {
  return new Response(c.body, {
    status: c.status,
    statusText: c.statusText,
    headers: { 'content-type': 'application/json' },
  });
}

export function resilientFetch(opts: ResilientFetchOptions = {}): FetchFn {
  const retries = opts.retries ?? 4;
  const maxBackoff = opts.maxBackoffMs ?? 8000;
  const staticTtl = opts.staticTtlMs ?? 10 * 60 * 1000;
  const base: FetchFn = opts.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const inflight = new Map<string, Promise<Response>>();
  const staticCache = new Map<string, CachedBody>();

  async function once(input: Parameters<FetchFn>[0], init?: RequestInit): Promise<Response> {
    let attempt = 0;
    for (;;) {
      try {
        const res = await base(input, init);
        const transient = res.status === 429 || (res.status >= 500 && res.status < 600);
        if (transient && attempt < retries) {
          await sleep(retryAfterMs(res.headers.get('retry-after')) ?? backoffMs(attempt, maxBackoff));
          attempt += 1;
          continue;
        }
        return res;
      } catch (err) {
        if (attempt >= retries) throw err;
        await sleep(backoffMs(attempt, maxBackoff));
        attempt += 1;
      }
    }
  }

  const resilient: FetchFn = (input, init) => {
    const { mode, key } = classify(init as RequestInit | undefined);
    if (mode === 'none') return once(input, init as RequestInit | undefined);

    if (mode === 'static') {
      const hit = staticCache.get(key);
      if (hit && Date.now() - hit.at < staticTtl) return Promise.resolve(reconstruct(hit));
    }

    const flying = inflight.get(key);
    if (flying) return flying.then((r) => r.clone());

    const p = once(input, init as RequestInit | undefined);
    inflight.set(key, p);
    void p.then(
      () => inflight.delete(key),
      () => inflight.delete(key),
    );

    if (mode === 'static') {
      void p.then(
        async (res) => {
          if (!res.ok) return;
          try {
            staticCache.set(key, {
              at: Date.now(),
              status: res.status,
              statusText: res.statusText,
              body: await res.clone().text(),
            });
          } catch {
            // body unreadable — skip caching
          }
        },
        () => {},
      );
    }

    return p.then((r) => r.clone());
  };

  return resilient;
}
