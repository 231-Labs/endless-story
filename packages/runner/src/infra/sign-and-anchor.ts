/**
 * sign-and-anchor — the canonical pattern for every runner output.
 *
 * Every chapter, gazette, reflection, dream, and video produced by any
 * service flows through this helper:
 *
 *   1. hash(content) → SHA-256 (opaque to chain; just bytes)
 *   2. memwal.putBlob(content) → Walrus blob id
 *   3. commitment::commit(saga, subject, hash, blob_id) → chain anchor
 *
 * Why centralised: the 3-step sequence has subtle ordering rules (the
 * hash MUST match the exact bytes uploaded, the blob id MUST land on
 * chain alongside it), and every service should emit the same shape.
 * Future verifiers (web UI, third-party indexers) re-fetch blob →
 * re-hash → compare against chain commitment in one place.
 *
 * Caller responsibility: supply the signing keypair (typically the
 * admin / storyteller keypair from `getAdminContext` in web, or
 * `loadKeypair` from `@endless-story/sdk/node` in a standalone runner).
 */

import { createHash } from 'node:crypto';
import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    signAndExecute,
    findCreatedObjectId,
    tx as endlessTx,
    type TxEvent,
} from '@endless-story/sdk';
import { blob as memwalBlob } from '@endless-story/memwal';
import { resolveNetwork } from './network.js';

export interface SignAndAnchorInput {
    /** The off-chain Saga id this content belongs to. */
    sagaId: string;
    /** Subject id — typically character_id, but free-form (storylet_id,
     *  scene_id, saga_id itself all valid). */
    subjectId: string;
    /** Raw content bytes that will be uploaded + hashed. */
    content: Uint8Array;
    /** Signer for the commitment::commit tx. Holds the StorytellerCap. */
    signer: Keypair;
    /** MIME-ish hint stored alongside the Walrus blob (e.g. 'text/markdown',
     *  'application/json'). Default 'application/octet-stream'. */
    contentType?: string;
    /** Walrus storage epochs. Default 5. */
    walrusEpochs?: number;
    /** Override Walrus network — default 'testnet' (per memwal default).
     *  Walrus + Sui networks are independent; testnet Walrus works with any
     *  Sui chain. */
    walrusNetwork?: 'testnet' | 'mainnet';
}

export interface SignAndAnchorResult {
    /** Sui object id of the created Commitment. */
    commitmentId: string;
    /** Walrus blob id where content lives. */
    blobId: string;
    /** Walrus aggregator URL for direct fetch. */
    blobUrl: string;
    /** Hex content hash matching the on-chain `content_hash` field. */
    contentHashHex: string;
    /** Transaction digest. */
    digest: string;
}

export async function signAndAnchor(input: SignAndAnchorInput): Promise<SignAndAnchorResult> {
    // 1. Hash the exact bytes we're about to upload.
    const hashBytes = sha256(input.content);
    const contentHashHex = bytesToHex(hashBytes);

    // 2. Upload to Walrus.
    const put = await memwalBlob.putBlob(input.content, {
        network: input.walrusNetwork ?? 'testnet',
        epochs: input.walrusEpochs ?? 30,
        contentType: input.contentType,
    });

    // 3. Anchor on chain. blob_id stored as bytes for parity with
    //    commitment.move's vector<u8> field.
    const client = makeSuiClient({ network: resolveNetwork() });
    const tx = new Transaction();
    tx.add(
        endlessTx.commitment.commit({
            cap: storytellerCapIdFromDeployment(),
            saga: input.sagaId,
            subjectId: input.subjectId,
            contentHash: Array.from(hashBytes),
            blobId: Array.from(new TextEncoder().encode(put.blobId)),
        }),
    );
    const res = await signAndExecute(client, {
        transaction: tx,
        signer: input.signer,
        waitForFinality: false,
    });
    if (!res.success) {
        throw new Error(`signAndAnchor: tx failed (${res.error ?? 'unknown'}) digest=${res.digest}`);
    }

    const commitmentId = findCreatedObjectId(res, '::commitment::Commitment');
    if (!commitmentId) {
        throw new Error(
            `signAndAnchor: tx succeeded but no Commitment object found in changes (digest=${res.digest})`,
        );
    }

    return {
        commitmentId,
        blobId: put.blobId,
        blobUrl: put.url,
        contentHashHex,
        digest: res.digest,
    };
}

/* ── batch anchor (one PTB, one signature) ─────────────────────────────
 *
 * The anchor step's only serialization constraint is the single signing
 * keypair + its gas coin. Batching N commits into ONE Programmable
 * Transaction Block removes that bottleneck entirely: upload every blob to
 * Walrus in parallel (off-chain, no Sui), then add N `commitment::commit`
 * move-calls to a single tx and sign it ONCE. `commit` takes `cap`/`saga`
 * by reference, so N calls share them in one PTB without conflict.
 *
 * Atomic: if any commit aborts, the whole batch reverts (callers guarantee
 * non-empty content + a valid cap, so in practice it's all-or-nothing on
 * infra failure, not per-item). Results are returned in input order. */

export interface AnchorItem {
    sagaId: string;
    subjectId: string;
    content: Uint8Array;
    contentType?: string;
}

export interface BatchAnchorOptions {
    signer: Keypair;
    walrusEpochs?: number;
    walrusNetwork?: 'testnet' | 'mainnet';
}

export async function signAndAnchorBatch(
    items: AnchorItem[],
    opts: BatchAnchorOptions,
): Promise<SignAndAnchorResult[]> {
    if (items.length === 0) return [];

    // 1. Upload every blob to Walrus CONCURRENTLY (off-chain, no signing).
    const uploaded = await Promise.all(
        items.map(async (it) => {
            const hashBytes = sha256(it.content);
            const put = await memwalBlob.putBlob(it.content, {
                network: opts.walrusNetwork ?? 'testnet',
                epochs: opts.walrusEpochs ?? 30,
                contentType: it.contentType,
            });
            return {
                hashBytes,
                contentHashHex: bytesToHex(hashBytes),
                blobId: put.blobId,
                blobUrl: put.url,
            };
        }),
    );

    // 2. ONE PTB: N commit move-calls, signed once.
    const cap = storytellerCapIdFromDeployment();
    const tx = new Transaction();
    for (let i = 0; i < items.length; i += 1) {
        tx.add(
            endlessTx.commitment.commit({
                cap,
                saga: items[i].sagaId,
                subjectId: items[i].subjectId,
                contentHash: Array.from(uploaded[i].hashBytes),
                blobId: Array.from(new TextEncoder().encode(uploaded[i].blobId)),
            }),
        );
    }
    const client = makeSuiClient({ network: resolveNetwork() });
    const res = await signAndExecute(client, {
        transaction: tx,
        signer: opts.signer,
        waitForFinality: false,
    });
    if (!res.success) {
        throw new Error(`signAndAnchorBatch: tx failed (${res.error ?? 'unknown'}) digest=${res.digest}`);
    }

    // 3. Map CommitmentCreated events (emitted in call order) → items.
    const commitmentIds = extractCommitmentIds(res.events ?? []);
    return items.map((_, i) => ({
        commitmentId: commitmentIds[i] ?? '',
        blobId: uploaded[i].blobId,
        blobUrl: uploaded[i].blobUrl,
        contentHashHex: uploaded[i].contentHashHex,
        digest: res.digest,
    }));
}

/** Commitment ids from CommitmentCreated events, in emission (call) order. */
function extractCommitmentIds(events: TxEvent[]): string[] {
    const out: string[] = [];
    for (const ev of events) {
        if (ev.eventType.endsWith('::commitment::CommitmentCreated')) {
            const id = (ev.json as { commitment_id?: string } | null)?.commitment_id;
            if (id) out.push(id);
        }
    }
    return out;
}

/* ── internals ──────────────────────────────────────────────────────── */

function sha256(bytes: Uint8Array): Uint8Array {
    const h = createHash('sha256');
    h.update(bytes);
    return new Uint8Array(h.digest());
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function storytellerCapIdFromDeployment(): string {
    const cap = ENDLESS_STORY_DEPLOYMENT.storytellerCapId;
    if (!cap) throw new Error('signAndAnchor: storytellerCapId not set in contract-ids');
    return cap;
}
