import assert from 'node:assert/strict';
import test from 'node:test';
import {
    cachedPublicRead,
    clearPublicReadCache,
    publicChainReadTtl,
} from './read-cache.ts';

test('cachedPublicRead shares concurrent public chain reads', async () => {
    clearPublicReadCache();
    let calls = 0;
    const loader = async () => {
        calls += 1;
        return `value-${calls}`;
    };
    const [a, b] = await Promise.all([
        cachedPublicRead('same-key', 1000, loader),
        cachedPublicRead('same-key', 1000, loader),
    ]);
    assert.equal(a, 'value-1');
    assert.equal(b, 'value-1');
    assert.equal(calls, 1);
});

test('cachedPublicRead can be disabled with ttl=0', async () => {
    clearPublicReadCache();
    let calls = 0;
    const loader = async () => {
        calls += 1;
        return calls;
    };
    assert.equal(await cachedPublicRead('disabled', 0, loader), 1);
    assert.equal(await cachedPublicRead('disabled', 0, loader), 2);
});

test('stale-while-revalidate serves the old value and refreshes in background', async () => {
    clearPublicReadCache();
    let calls = 0;
    let release: (() => void) | null = null;
    const loader = async () => {
        calls += 1;
        if (calls === 1) return 'v1';
        await new Promise<void>((r) => {
            release = r;
        });
        return `v${calls}`;
    };
    assert.equal(await cachedPublicRead('swr', 50, loader, { staleTtlMs: 60_000 }), 'v1');
    await new Promise((r) => setTimeout(r, 60)); // let the 50ms TTL lapse
    // Expired but within the stale window → old value NOW, refresh kicked off.
    assert.equal(await cachedPublicRead('swr', 50, loader, { staleTtlMs: 60_000 }), 'v1');
    assert.equal(calls, 2);
    // A second stale hit while the refresh is in flight does NOT stack loads.
    assert.equal(await cachedPublicRead('swr', 50, loader, { staleTtlMs: 60_000 }), 'v1');
    assert.equal(calls, 2);
    release!();
    await new Promise((r) => setTimeout(r, 5));
    // Refresh landed → v2 is fresh again; no extra load fired.
    assert.equal(await cachedPublicRead('swr', 50, loader, { staleTtlMs: 60_000 }), 'v2');
    assert.equal(calls, 2);
});

test('stale-while-revalidate keeps serving stale when the refresh fails', async () => {
    clearPublicReadCache();
    let calls = 0;
    const loader = async () => {
        calls += 1;
        if (calls === 1) return 'good';
        throw new Error('chain hiccup');
    };
    assert.equal(await cachedPublicRead('swr-fail', 50, loader, { staleTtlMs: 60_000 }), 'good');
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(await cachedPublicRead('swr-fail', 50, loader, { staleTtlMs: 60_000 }), 'good');
    await new Promise((r) => setTimeout(r, 5)); // failed refresh settles
    // Still in the stale window → stale again, and another refresh may retry.
    assert.equal(await cachedPublicRead('swr-fail', 50, loader, { staleTtlMs: 60_000 }), 'good');
});

test('without staleTtlMs an expired entry blocks on a fresh load (old behavior)', async () => {
    clearPublicReadCache();
    let calls = 0;
    const loader = async () => {
        calls += 1;
        return calls;
    };
    assert.equal(await cachedPublicRead('no-swr', 5, loader), 1);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(await cachedPublicRead('no-swr', 5, loader), 2);
});

test('publicChainReadTtl reads the env override', () => {
    const old = process.env.CHAIN_READ_CACHE_TTL_MS;
    process.env.CHAIN_READ_CACHE_TTL_MS = '0';
    assert.equal(publicChainReadTtl(30_000), 0);
    process.env.CHAIN_READ_CACHE_TTL_MS = '2500';
    assert.equal(publicChainReadTtl(30_000), 2500);
    if (old == null) delete process.env.CHAIN_READ_CACHE_TTL_MS;
    else process.env.CHAIN_READ_CACHE_TTL_MS = old;
});
