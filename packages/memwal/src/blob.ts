/**
 * Walrus blob upload / URL helpers via public HTTP endpoints.
 *
 * For raw byte storage (portraits, images, attachments). The richer
 * memory APIs (`SagaMemoryClient`, `OwnerAuditClient`) live separately
 * in `character-clients.ts` and are layered on top of MemWal — those
 * handle encryption + vector indexing + Sui object refs.
 *
 * This module is intentionally minimal: just `PUT blob → blobId` and
 * `blobId → aggregator URL`. Consumers (web admin actions, runner
 * memwal flush, etc.) call these to stash large content on Walrus when
 * full memory semantics aren't needed.
 *
 * **Endpoints**: public publisher/aggregator (no auth, rate-limited).
 * For production traffic consider running your own publisher.
 */

export type WalrusNetwork = 'testnet' | 'mainnet';

const PUBLISHERS: Record<WalrusNetwork, string> = {
    testnet: 'https://publisher.walrus-testnet.walrus.space',
    mainnet: 'https://publisher.walrus.space',
};

const AGGREGATORS: Record<WalrusNetwork, string> = {
    testnet: 'https://aggregator.walrus-testnet.walrus.space',
    mainnet: 'https://aggregator.walrus.space',
};

export interface PutBlobOptions {
    /** Default 'testnet'. */
    network?: WalrusNetwork;
    /** Storage epochs (1 epoch ≈ 14 days on testnet). Default: 5. */
    epochs?: number;
    /** Override publisher URL (e.g. custom self-hosted). */
    publisherUrl?: string;
    /** Content-Type for the bytes; default 'application/octet-stream'. */
    contentType?: string;
    /** Retries on transient publisher failure (429 / 5xx / network).
     *  Default 4. The public publisher is shared + rate-limited, so a burst
     *  (e.g. a tick uploading several blobs) commonly 429s — a short backoff
     *  usually clears it. */
    retries?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface PutBlobResult {
    blobId: string;
    /** Sui object id of the on-chain Blob NFT (when newly created). */
    suiObjectId?: string;
    /** End-of-availability epoch from publisher response. */
    endEpoch?: number;
    /** True when the bytes were already stored (deduped). */
    alreadyCertified: boolean;
    /** Aggregator URL for fetching the blob bytes. */
    url: string;
}

interface PublisherSuccess {
    newlyCreated?: {
        blobObject: {
            id: string;
            blobId: string;
            storage: { endEpoch: number };
        };
    };
    alreadyCertified?: {
        blobId: string;
        endEpoch: number;
    };
}

/**
 * Upload bytes to a Walrus publisher; return the blob id + reusable URL.
 *
 * The publisher endpoint accepts raw bytes via PUT; we send the body
 * with the requested content-type. Public publishers cap individual
 * uploads (testnet usually ~13 MB) — caller should chunk larger files.
 */
export async function putBlob(
    bytes: Uint8Array,
    opts: PutBlobOptions = {},
): Promise<PutBlobResult> {
    const network = opts.network ?? 'testnet';
    const epochs = opts.epochs ?? 5;
    const base = opts.publisherUrl ?? PUBLISHERS[network];
    const url = `${base.replace(/\/$/, '')}/v1/blobs?epochs=${epochs}`;
    const maxRetries = Math.max(0, opts.retries ?? 4);

    // Retry on transient publisher failures (429 / 5xx / network). Backoff
    // grows with jitter: ~1s, 2.5s, 5s, 10s … The image bytes are the same
    // each attempt, so a successful retry dedupes to the same blob id.
    let res: Response | undefined;
    let lastErr = '';
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        if (attempt > 0) {
            const backoff = Math.min(10_000, 1000 * 2 ** (attempt - 1));
            await sleep(backoff + Math.floor(backoff * 0.3 * (attempt % 3) / 2));
        }
        // Fresh Blob per attempt (a consumed body can't be re-sent).
        const body = new Blob([bytes as BlobPart], {
            type: opts.contentType ?? 'application/octet-stream',
        });
        try {
            res = await fetch(url, { method: 'PUT', body });
        } catch (err) {
            lastErr = `network: ${err instanceof Error ? err.message : String(err)}`;
            res = undefined;
            continue; // network blip → retry
        }
        if (res.ok) break;
        // Retry on rate-limit / server errors; fail fast on 4xx (bad request).
        if (res.status === 429 || res.status >= 500) {
            lastErr = `HTTP ${res.status}`;
            continue;
        }
        const text = await res.text().catch(() => '');
        throw new Error(`walrus publisher HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    if (!res || !res.ok) {
        throw new Error(
            `walrus publisher failed after ${maxRetries + 1} attempts (${lastErr || 'unknown'}): the publisher is rate-limited — retry shortly or avoid concurrent uploads`,
        );
    }

    const data = (await res.json()) as PublisherSuccess;
    if (data.newlyCreated) {
        const blobId = data.newlyCreated.blobObject.blobId;
        return {
            blobId,
            suiObjectId: data.newlyCreated.blobObject.id,
            endEpoch: data.newlyCreated.blobObject.storage.endEpoch,
            alreadyCertified: false,
            url: getBlobUrl(blobId, network),
        };
    }
    if (data.alreadyCertified) {
        const blobId = data.alreadyCertified.blobId;
        return {
            blobId,
            endEpoch: data.alreadyCertified.endEpoch,
            alreadyCertified: true,
            url: getBlobUrl(blobId, network),
        };
    }
    throw new Error(`walrus publisher: unexpected response shape: ${JSON.stringify(data).slice(0, 300)}`);
}

/**
 * Aggregator URL for fetching a blob by id. Stable URL pattern; this
 * is the value to store in `character.image_url` etc.
 */
export function getBlobUrl(blobId: string, network: WalrusNetwork = 'testnet'): string {
    const base = AGGREGATORS[network];
    return `${base}/v1/blobs/${blobId}`;
}

/**
 * Convenience: fetch a blob's bytes back from the aggregator.
 * Caller decodes as needed (e.g. `new Uint8Array(await res.arrayBuffer())`).
 */
export async function fetchBlob(blobId: string, network: WalrusNetwork = 'testnet'): Promise<Uint8Array> {
    const res = await fetch(getBlobUrl(blobId, network));
    if (!res.ok) {
        throw new Error(`walrus aggregator HTTP ${res.status} for ${blobId}`);
    }
    return new Uint8Array(await res.arrayBuffer());
}
