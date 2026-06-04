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

test('publicChainReadTtl reads the env override', () => {
    const old = process.env.CHAIN_READ_CACHE_TTL_MS;
    process.env.CHAIN_READ_CACHE_TTL_MS = '0';
    assert.equal(publicChainReadTtl(30_000), 0);
    process.env.CHAIN_READ_CACHE_TTL_MS = '2500';
    assert.equal(publicChainReadTtl(30_000), 2500);
    if (old == null) delete process.env.CHAIN_READ_CACHE_TTL_MS;
    else process.env.CHAIN_READ_CACHE_TTL_MS = old;
});
