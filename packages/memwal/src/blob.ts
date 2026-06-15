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

/**
 * Aggregator base — self-hosted override via `NEXT_PUBLIC_WALRUS_AGGREGATOR`
 * (e.g. https://walrus.231labs.xyz). Drives the URL written into
 * `character.image_url` at mint time, so new mints serve through our own CDN.
 * Unset → public per-network.
 */
function aggregatorBase(network: WalrusNetwork): string {
    const env = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR;
    const base = env && env.trim() ? env.trim() : AGGREGATORS[network];
    return base.replace(/\/$/, '');
}

/**
 * Publisher base — self-hosted override via `WALRUS_PUBLISHER_URL`
 * (e.g. https://walrus-publisher.231labs.xyz). Drives ALL blob uploads
 * (portraits, chapter anchors, dreams …). Server-side only (uploads run in
 * server actions / the runner), so it is NOT a `NEXT_PUBLIC_` var. Unset → the
 * public per-network publisher, which is shared + rate-limited + often flaky —
 * set this to your own publisher for any real run. An explicit
 * `opts.publisherUrl` still wins over the env.
 */
function publisherBase(network: WalrusNetwork): string {
    const env = process.env.WALRUS_PUBLISHER_URL;
    const base = env && env.trim() ? env.trim() : PUBLISHERS[network];
    return base.replace(/\/$/, '');
}

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
    /**
     * Self-hosted asset-service renewal bucket (character-image | scene-anchor |
     * chapter-text | hero-clip). When `ASSET_SERVICE_URL` is set, putBlob uploads
     * through the asset service (which publishes to Walrus via its funded CLI) —
     * this picks the category; defaults from `contentType`. */
    category?: string;
    /** Label for the asset-service entry; defaults to `<category>-<ts>`. */
    label?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const ASSET_CATEGORIES = new Set(['hero-clip', 'character-image', 'scene-anchor', 'chapter-text']);

/** Pick the asset-service renewal bucket: explicit hint wins, else by content-type. */
function assetCategoryFor(contentType: string | undefined, hint: string | undefined): string {
    if (hint && ASSET_CATEGORIES.has(hint)) return hint;
    const ct = (contentType ?? '').toLowerCase();
    if (ct.startsWith('image/')) return 'character-image';
    if (ct.startsWith('text/')) return 'chapter-text';
    return 'scene-anchor';
}

/**
 * Upload via the self-hosted asset service (`POST {ASSET_SERVICE_URL}/api/assets`),
 * which publishes to Walrus through its funded CLI wallet and returns a blobId —
 * the write path when no Walrus *publisher* daemon is run (the public testnet
 * publisher is unreliable). Returns null when unconfigured OR on ANY failure, so
 * `putBlob` cleanly falls back to a direct publisher PUT. Auto-generated blobs are
 * stored `deletable=true` (they are not human-curated assets).
 */
async function uploadViaAssetService(
    bytes: Uint8Array,
    network: WalrusNetwork,
    opts: PutBlobOptions,
): Promise<PutBlobResult | null> {
    const base = (process.env.ASSET_SERVICE_URL ?? '').trim().replace(/\/$/, '');
    if (!base) return null;
    const secret = process.env.ASSET_SERVICE_SECRET ?? process.env.RELAYER_SECRET;
    const category = assetCategoryFor(opts.contentType, opts.category);
    const label = (opts.label ?? `${category}-${Date.now().toString(36)}`).slice(0, 120);
    const epochs = opts.epochs ?? 5;
    const qs = new URLSearchParams({ category, label, epochs: String(epochs), deletable: 'true' });
    try {
        const res = await fetch(`${base}/api/assets?${qs.toString()}`, {
            method: 'POST',
            headers: {
                'content-type': opts.contentType ?? 'application/octet-stream',
                ...(secret ? { authorization: `Bearer ${secret}` } : {}),
            },
            body: new Blob([bytes as BlobPart]),
        });
        if (!res.ok) return null; // fall back to the direct publisher
        const data = (await res.json()) as {
            asset?: { blobId?: string; suiObjectId?: string; endEpoch?: number };
        };
        const a = data.asset;
        if (!a?.blobId) return null;
        return {
            blobId: a.blobId,
            suiObjectId: a.suiObjectId,
            endEpoch: a.endEpoch,
            alreadyCertified: false,
            url: getBlobUrl(a.blobId, network),
        };
    } catch {
        return null; // network / shape error → fall back
    }
}

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

    // Prefer the self-hosted asset service (publishes to Walrus via a funded CLI)
    // unless the caller pinned an explicit publisher. Falls through to a direct
    // publisher PUT when the asset service is unconfigured or fails.
    if (!opts.publisherUrl) {
        const viaAsset = await uploadViaAssetService(bytes, network, opts);
        if (viaAsset) return viaAsset;
    }

    const base = opts.publisherUrl ?? publisherBase(network);
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
    return `${aggregatorBase(network)}/v1/blobs/${blobId}`;
}

// ───────────────────────── Quilt (batch small blobs) ─────────────────────────
//
// A Quilt packs up to MAX_FILES_IN_QUILT small files into ONE Walrus blob, so
// they SHARE the per-blob metadata floor (~420x cheaper for 10KB files, ~106x
// for 100KB) and cost ONE Sui tx instead of N. Each file stays individually
// retrievable by `identifier` or `quiltPatchId` — no unbundling.
//
// USE FOR batch WRITES on the content road (a character's setting gallery at mint,
// a gazette bundle). NOT for the per-memory hot path (memories are SEAL-encrypted
// + written one-at-a-time through the relayer; and a quilt — like any blob — is
// IMMUTABLE: you can't append, you write a fresh quilt per batch).
//
// Wire format confirmed against a live Walrus daemon's OpenAPI + MystenLabs'
// own k6 client (scripts/k6/src/flows/{publisher,aggregator}.ts):
//   write : PUT /v1/quilts?epochs=N   multipart/form-data, one part per file
//           whose FIELD NAME is the identifier; optional `_metadata` JSON part
//           carries Walrus-native tags.  413 ⇒ quilt too large.
//   read  : GET /v1/blobs/by-quilt-patch-id/{quiltPatchId}
//           GET /v1/blobs/by-quilt-id/{quiltId}/{identifier}

/** Publisher hard cap on files per quilt (Walrus `MAX_FILES_IN_QUILT`). */
export const MAX_FILES_IN_QUILT = 666;

export interface QuiltFile {
    /** Unique-within-the-quilt name; used to read the patch back. */
    identifier: string;
    bytes: Uint8Array;
    /** Optional content-type for this file's part. */
    contentType?: string;
    /** Optional Walrus-native metadata tags, e.g. `{ kind: 'event-moment' }`. */
    tags?: Record<string, string>;
}

export interface QuiltPatch {
    /** The identifier this file was stored under. */
    identifier: string;
    /** Stable id to fetch just this file: GET /v1/blobs/by-quilt-patch-id/<id>. */
    quiltPatchId: string;
    /** Aggregator URL for this file's bytes. */
    url: string;
}

export interface PutQuiltResult {
    /** The container quilt's own blob id (== a normal Walrus blob id). */
    quiltId?: string;
    /** Sui object id of the on-chain Blob NFT (when newly created). */
    suiObjectId?: string;
    endEpoch?: number;
    /** True when the identical quilt bytes were already stored (deduped). */
    alreadyCertified: boolean;
    /** One entry per stored file. */
    patches: QuiltPatch[];
}

interface QuiltStoreResponse {
    blobStoreResult?: PublisherSuccess;
    storedQuiltBlobs?: Array<{ identifier: string; quiltPatchId: string }>;
}

/**
 * Store many small files as a single Walrus quilt; return the container id +
 * one `QuiltPatch` per file. Mirrors {@link putBlob}'s retry/backoff against the
 * shared (rate-limited) public publisher.
 *
 * @throws if `files` is empty, exceeds {@link MAX_FILES_IN_QUILT}, has duplicate
 *   identifiers, or the publisher rejects the quilt (413 ⇒ split into batches).
 */
export async function putQuilt(
    files: QuiltFile[],
    opts: PutBlobOptions = {},
): Promise<PutQuiltResult> {
    if (files.length === 0) throw new Error('putQuilt: no files');
    if (files.length > MAX_FILES_IN_QUILT) {
        throw new Error(
            `putQuilt: ${files.length} files exceeds MAX_FILES_IN_QUILT (${MAX_FILES_IN_QUILT}) — split into batches`,
        );
    }
    const ids = new Set<string>();
    for (const f of files) {
        if (!f.identifier) throw new Error('putQuilt: every file needs a non-empty identifier');
        if (ids.has(f.identifier)) throw new Error(`putQuilt: duplicate identifier "${f.identifier}"`);
        ids.add(f.identifier);
    }

    const network = opts.network ?? 'testnet';
    const epochs = opts.epochs ?? 5;
    const base = opts.publisherUrl ?? publisherBase(network);
    const url = `${base.replace(/\/$/, '')}/v1/quilts?epochs=${epochs}`;
    const maxRetries = Math.max(0, opts.retries ?? 4);

    // FormData with Blob parts is rebuilt per attempt (a consumed body can't be
    // re-sent). Each part's FIELD NAME is the file's identifier.
    const buildForm = (): FormData => {
        const form = new FormData();
        for (const f of files) {
            const blob = new Blob([f.bytes as BlobPart], {
                type: f.contentType ?? 'application/octet-stream',
            });
            form.append(f.identifier, blob, f.identifier);
        }
        const meta = files
            .filter((f) => f.tags && Object.keys(f.tags).length > 0)
            .map((f) => ({ identifier: f.identifier, tags: f.tags }));
        if (meta.length > 0) form.append('_metadata', JSON.stringify(meta));
        return form;
    };

    let res: Response | undefined;
    let lastErr = '';
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        if (attempt > 0) {
            const backoff = Math.min(10_000, 1000 * 2 ** (attempt - 1));
            await sleep(backoff + Math.floor(backoff * 0.3 * (attempt % 3) / 2));
        }
        try {
            res = await fetch(url, { method: 'PUT', body: buildForm() });
        } catch (err) {
            lastErr = `network: ${err instanceof Error ? err.message : String(err)}`;
            res = undefined;
            continue;
        }
        if (res.ok) break;
        if (res.status === 429 || res.status >= 500) {
            lastErr = `HTTP ${res.status}`;
            continue;
        }
        const text = await res.text().catch(() => '');
        if (res.status === 413) {
            throw new Error(`walrus quilt too large (HTTP 413) — split into smaller batches: ${text.slice(0, 200)}`);
        }
        throw new Error(`walrus publisher HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    if (!res || !res.ok) {
        throw new Error(
            `walrus quilt store failed after ${maxRetries + 1} attempts (${lastErr || 'unknown'}): publisher rate-limited — retry shortly`,
        );
    }

    const data = (await res.json()) as QuiltStoreResponse;
    const stored = data.storedQuiltBlobs ?? [];
    const patches: QuiltPatch[] = stored.map((s) => ({
        identifier: s.identifier,
        quiltPatchId: s.quiltPatchId,
        url: getQuiltPatchUrl(s.quiltPatchId, network),
    }));

    const sr = data.blobStoreResult;
    if (sr?.newlyCreated) {
        return {
            quiltId: sr.newlyCreated.blobObject.blobId,
            suiObjectId: sr.newlyCreated.blobObject.id,
            endEpoch: sr.newlyCreated.blobObject.storage.endEpoch,
            alreadyCertified: false,
            patches,
        };
    }
    if (sr?.alreadyCertified) {
        return {
            quiltId: sr.alreadyCertified.blobId,
            endEpoch: sr.alreadyCertified.endEpoch,
            alreadyCertified: true,
            patches,
        };
    }
    // Patches present but no recognizable store-result shape: still usable.
    return { alreadyCertified: false, patches };
}

/** Aggregator URL to fetch a single quilt file by its `quiltPatchId`. */
export function getQuiltPatchUrl(quiltPatchId: string, network: WalrusNetwork = 'testnet'): string {
    return `${aggregatorBase(network)}/v1/blobs/by-quilt-patch-id/${quiltPatchId}`;
}

/** Aggregator URL to fetch a single quilt file by its quilt id + identifier. */
export function getQuiltFileUrl(
    quiltId: string,
    identifier: string,
    network: WalrusNetwork = 'testnet',
): string {
    return `${aggregatorBase(network)}/v1/blobs/by-quilt-id/${quiltId}/${encodeURIComponent(identifier)}`;
}

/** Fetch one quilt file's bytes by `quiltPatchId` (from {@link putQuilt}). */
export async function fetchQuiltPatch(
    quiltPatchId: string,
    network: WalrusNetwork = 'testnet',
): Promise<Uint8Array> {
    const res = await fetch(getQuiltPatchUrl(quiltPatchId, network));
    if (!res.ok) throw new Error(`walrus aggregator HTTP ${res.status} for quilt patch ${quiltPatchId}`);
    return new Uint8Array(await res.arrayBuffer());
}

/** Fetch one quilt file's bytes by quilt id + the identifier it was stored under. */
export async function fetchQuiltFile(
    quiltId: string,
    identifier: string,
    network: WalrusNetwork = 'testnet',
): Promise<Uint8Array> {
    const res = await fetch(getQuiltFileUrl(quiltId, identifier, network));
    if (!res.ok) throw new Error(`walrus aggregator HTTP ${res.status} for ${quiltId}/${identifier}`);
    return new Uint8Array(await res.arrayBuffer());
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
