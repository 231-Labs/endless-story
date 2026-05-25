/**
 * Phase 2.2M acceptance: smoke-test blob put/url helpers without hitting Walrus.
 *
 * Run from repo root:
 *   cd packages/cli && pnpm exec tsx ../memwal/src/__check__/blob-smoke.ts
 *
 * Stubs fetch, asserts:
 *   - PUT URL contains correct publisher host + epochs
 *   - Body is a Blob with the content-type we set
 *   - newlyCreated / alreadyCertified branches return the right shape
 *   - getBlobUrl produces the testnet/mainnet aggregator URL pattern
 */

import { blob } from '../index.js';

function assert(cond: unknown, msg: string): asserts cond {
    if (!cond) {
        console.error(`FAIL ${msg}`);
        process.exit(1);
    }
}

interface Captured {
    url: string;
    method: string;
    contentType: string;
    bodyLen: number;
}

function installFetchStub(responseJson: unknown, status = 200): { restore: () => void; captured: Captured[] } {
    const original = globalThis.fetch;
    const captured: Captured[] = [];
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const body = init?.body;
        const ct = body instanceof Blob ? body.type : '';
        const len = body instanceof Blob ? body.size : (typeof body === 'string' ? body.length : 0);
        captured.push({ url, method: init?.method ?? 'GET', contentType: ct, bodyLen: len });
        return new Response(JSON.stringify(responseJson), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }) as typeof fetch;
    return { restore: () => { (globalThis as unknown as { fetch: typeof fetch }).fetch = original; }, captured };
}

async function testPutNewlyCreated() {
    const stub = installFetchStub({
        newlyCreated: {
            blobObject: {
                id: '0xobj',
                blobId: 'blob-abc',
                storage: { endEpoch: 42 },
            },
        },
    });
    try {
        const bytes = new Uint8Array([1, 2, 3, 4, 5]);
        const res = await blob.putBlob(bytes, { network: 'testnet', epochs: 5, contentType: 'image/png' });
        assert(res.blobId === 'blob-abc', 'putBlob: blobId not propagated');
        assert(res.suiObjectId === '0xobj', 'putBlob: suiObjectId not propagated');
        assert(res.alreadyCertified === false, 'putBlob: should be newlyCreated');
        assert(res.url.endsWith('/v1/blobs/blob-abc'), 'putBlob: url should end with /v1/blobs/{id}');
        assert(res.url.includes('walrus-testnet'), 'putBlob: url should be testnet aggregator');
        const req = stub.captured[0];
        assert(req.method === 'PUT', 'putBlob: wrong method');
        assert(req.url.includes('publisher.walrus-testnet'), 'putBlob: wrong publisher host');
        assert(req.url.includes('epochs=5'), 'putBlob: epochs not in query');
        assert(req.contentType === 'image/png', 'putBlob: content-type lost');
        assert(req.bodyLen === 5, 'putBlob: body bytes lost');
        console.log(`OK  putBlob newlyCreated           — blobId=${res.blobId}, sui=${res.suiObjectId}`);
    } finally {
        stub.restore();
    }
}

async function testPutAlreadyCertified() {
    const stub = installFetchStub({ alreadyCertified: { blobId: 'blob-existing', endEpoch: 99 } });
    try {
        const res = await blob.putBlob(new Uint8Array([9]));
        assert(res.blobId === 'blob-existing', 'putBlob: dedupe blobId wrong');
        assert(res.alreadyCertified === true, 'putBlob: dedupe should set alreadyCertified');
        assert(res.suiObjectId === undefined, 'putBlob: dedupe has no sui object');
        console.log(`OK  putBlob alreadyCertified       — blobId=${res.blobId}`);
    } finally {
        stub.restore();
    }
}

function testUrlHelpers() {
    const testnetUrl = blob.getBlobUrl('abc', 'testnet');
    assert(
        testnetUrl === 'https://aggregator.walrus-testnet.walrus.space/v1/blobs/abc',
        `getBlobUrl: wrong testnet URL: ${testnetUrl}`,
    );
    const mainnetUrl = blob.getBlobUrl('xyz', 'mainnet');
    assert(
        mainnetUrl === 'https://aggregator.walrus.space/v1/blobs/xyz',
        `getBlobUrl: wrong mainnet URL: ${mainnetUrl}`,
    );
    console.log(`OK  getBlobUrl testnet + mainnet`);
}

async function main() {
    await testPutNewlyCreated();
    await testPutAlreadyCertified();
    testUrlHelpers();
    console.log('\nALL OK — packages/memwal Phase 2.2M smoke test passed.');
}

main().catch((err) => {
    console.error('FAIL', err);
    process.exit(1);
});
