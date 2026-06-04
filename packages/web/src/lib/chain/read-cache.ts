/**
 * Tiny process-local cache for public chain reads.
 *
 * This is intentionally modest: it reduces repeated Sui RPC calls during a
 * page render / short browsing burst, but it is not a source of truth and it
 * never gates private content. Set CHAIN_READ_CACHE_TTL_MS=0 to disable.
 */

interface CacheEntry<T> {
    expiresAt: number;
    value?: T;
    promise?: Promise<T>;
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
): Promise<T> {
    if (ttlMs <= 0) return loader();
    const now = Date.now();
    const hit = store.get(key) as CacheEntry<T> | undefined;
    if (hit && hit.expiresAt > now) {
        if (hit.promise) return hit.promise;
        if ('value' in hit) return hit.value as T;
    }

    const promise = loader()
        .then((value) => {
            store.set(key, { expiresAt: Date.now() + ttlMs, value });
            trimCache();
            return value;
        })
        .catch((err) => {
            store.delete(key);
            throw err;
        });
    store.set(key, { expiresAt: now + ttlMs, promise });
    trimCache();
    return promise;
}

export function clearPublicReadCache(): void {
    store.clear();
}

function trimCache(): void {
    if (store.size <= MAX_ENTRIES) return;
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.expiresAt <= now) store.delete(key);
    }
    while (store.size > MAX_ENTRIES) {
        const first = store.keys().next().value as string | undefined;
        if (!first) break;
        store.delete(first);
    }
}
