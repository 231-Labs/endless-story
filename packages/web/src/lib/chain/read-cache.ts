/**
 * Tiny process-local cache for public chain reads.
 *
 * This is intentionally modest: it reduces repeated Sui RPC calls during a
 * page render / short browsing burst, but it is not a source of truth and it
 * never gates private content. Set CHAIN_READ_CACHE_TTL_MS=0 to disable.
 *
 * Optional stale-while-revalidate: pass `staleTtlMs` and an EXPIRED entry is
 * served immediately (up to that long past expiry) while ONE background
 * refresh runs — so a TTL rollover never blocks a user-facing request. Use it
 * for list assemblies (feed scans) where seconds-old data is fine; skip it for
 * anything that must be read-after-write fresh.
 */

interface CacheEntry<T> {
    freshUntil: number;
    /** = freshUntil when SWR is off. */
    staleUntil: number;
    value?: T;
    hasValue: boolean;
    promise?: Promise<T>;
}

export interface CachedReadOptions {
    /** Serve a stale value for up to this long past expiry while refreshing in background. */
    staleTtlMs?: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const MAX_ENTRIES = 200;

export function publicChainReadTtl(defaultMs: number): number {
    const raw = process.env.CHAIN_READ_CACHE_TTL_MS;
    if (raw == null || raw === '') return defaultMs;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultMs;
}

export async function cachedPublicRead<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    opts: CachedReadOptions = {},
): Promise<T> {
    if (ttlMs <= 0) return loader();
    const now = Date.now();
    const staleTtlMs = Math.max(0, opts.staleTtlMs ?? 0);
    const hit = store.get(key) as CacheEntry<T> | undefined;

    if (hit) {
        if (now < hit.freshUntil) {
            if (hit.promise) return hit.promise;
            if (hit.hasValue) return hit.value as T;
        } else if (hit.hasValue && now < hit.staleUntil) {
            // Stale window: hand back the old value NOW; refresh at most once
            // in the background. A failed refresh keeps serving stale until
            // staleUntil, then the entry falls through to a blocking load.
            if (!hit.promise) {
                hit.promise = loader()
                    .then((value) => {
                        setValue(key, ttlMs, staleTtlMs, value);
                        return value;
                    })
                    .catch(() => {
                        const cur = store.get(key) as CacheEntry<T> | undefined;
                        if (cur) cur.promise = undefined;
                        return hit.value as T;
                    });
            }
            return hit.value as T;
        }
    }

    const promise = loader()
        .then((value) => {
            setValue(key, ttlMs, staleTtlMs, value);
            return value;
        })
        .catch((err) => {
            store.delete(key);
            throw err;
        });
    store.set(key, {
        freshUntil: now + ttlMs,
        staleUntil: now + ttlMs + staleTtlMs,
        promise,
        hasValue: false,
    });
    trimCache();
    return promise;
}

export function clearPublicReadCache(): void {
    store.clear();
}

function setValue<T>(key: string, ttlMs: number, staleTtlMs: number, value: T): void {
    const now = Date.now();
    store.set(key, {
        freshUntil: now + ttlMs,
        staleUntil: now + ttlMs + staleTtlMs,
        value,
        hasValue: true,
    });
    trimCache();
}

function trimCache(): void {
    if (store.size <= MAX_ENTRIES) return;
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.staleUntil <= now) store.delete(key);
    }
    while (store.size > MAX_ENTRIES) {
        const first = store.keys().next().value as string | undefined;
        if (!first) break;
        store.delete(first);
    }
}
