/**
 * Owner-side SEAL decryption — browser-safe, wallet-signed.
 *
 * The cryptographic half of the Owner read path: a server that holds only
 * the relayer delegate key runs `recallEncrypted` (search + ciphertext
 * download, no cap), and the character Owner's browser calls
 * `decryptWithOwnerCap` here. The SEAL key servers release key shares only
 * when:
 *   1. the SessionKey is signed by the wallet that owns the OwnerCap, and
 *   2. `endless_story::character::seal_approve_owner` passes on chain for
 *      that cap + character + blob id.
 *
 * So unlike a server-held cap acting as a decryption oracle, possession of
 * the OwnerCap is enforced end-to-end — a spoofed viewer address gets
 * ciphertext it can never open.
 *
 * Mirrors MemWalManual.recallManual step 4 (same adapter shape, same
 * per-blob fetchKeys/decrypt loop, one SessionKey = one wallet popup), but
 * standalone: no delegate key, no embedding key, no relayer access needed.
 * All @mysten/* imports are dynamic, matching manual.ts.
 */

import type { EncryptedRecallBlob, RecallManualMemory, SealServerConfig } from "./types.js";
import { defaultSealServerConfigsFor } from "./manual.js";
import { base64ToBytes } from "./utils.js";

/** Minimal wallet surface needed for SEAL session signing (dapp-kit compatible). */
export interface OwnerWalletSigner {
    /** Wallet address (must own the OwnerCap). */
    address: string;
    /** Sign a personal message (for SEAL SessionKey). */
    signPersonalMessage: (input: { message: Uint8Array }) => Promise<{ signature: string }>;
}

export interface OwnerDecryptParams {
    /** endless_story package id (hosts `character::seal_approve_owner`). */
    packageId: string;
    /** Character object id the blobs belong to. */
    characterId: string;
    /** OwnerCap object id held by `signer.address`. */
    ownerCapId: string;
    /** Sui client (e.g. dapp-kit's useSuiClient()). */
    suiClient: unknown;
    suiNetwork: "testnet" | "mainnet";
    signer: OwnerWalletSigner;
    /** Ciphertext blobs from MemWalManual.recallEncrypted. */
    blobs: EncryptedRecallBlob[];
    /** Override SEAL key servers; defaults to the network's built-ins. */
    sealServerConfigs?: SealServerConfig[];
    /** SessionKey TTL in minutes (default 5, matching manual.ts). */
    sessionTtlMin?: number;
}

export interface OwnerDecryptResult {
    results: RecallManualMemory[];
    /** Blobs that failed to decrypt (ENoAccess, network, parse…). */
    failed: number;
}

export async function decryptWithOwnerCap(params: OwnerDecryptParams): Promise<OwnerDecryptResult> {
    if (params.blobs.length === 0) return { results: [], failed: 0 };

    // @ts-ignore — optional peer dependency
    const { SealClient, SessionKey, EncryptedObject } = await import("@mysten/seal");
    const { Transaction } = await import("@mysten/sui/transactions");

    const serverConfigs = (params.sealServerConfigs ?? defaultSealServerConfigsFor(params.suiNetwork)).map(
        (c) => ({ ...c, weight: c.weight ?? 1 }),
    );
    if (serverConfigs.length === 0) {
        throw new Error(`decryptWithOwnerCap: no SEAL key servers for network "${params.suiNetwork}"`);
    }
    const totalWeight = serverConfigs.reduce((sum, c) => sum + c.weight, 0);
    const threshold = Math.min(2, totalWeight);

    const sealClient = new SealClient({
        suiClient: params.suiClient as never,
        serverConfigs,
        verifyKeyServers: true,
    });

    // Same adapter shape manual.ts builds around a dapp-kit wallet.
    const signerAdapter = {
        toSuiAddress: () => params.signer.address,
        getPublicKey: () => ({ toSuiAddress: () => params.signer.address }),
        sign: async (data: Uint8Array) => {
            const result = await params.signer.signPersonalMessage({ message: data });
            return { signature: result.signature };
        },
        signPersonalMessage: async (data: Uint8Array) => {
            const result = await params.signer.signPersonalMessage({ message: data });
            return { signature: result.signature };
        },
    };

    // One SessionKey for the whole batch — one wallet popup.
    const sessionKey = await SessionKey.create({
        address: params.signer.address,
        packageId: params.packageId,
        ttlMin: params.sessionTtlMin ?? 5,
        signer: signerAdapter as never,
        suiClient: params.suiClient as never,
    });

    const results: RecallManualMemory[] = [];
    let failed = 0;
    for (const blob of params.blobs) {
        try {
            const data = base64ToBytes(blob.data_b64);
            const parsed = EncryptedObject.parse(data);
            const fullId: string = parsed.id;

            const idBytes = Array.from(
                Uint8Array.from(fullId.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16))),
            );
            const tx = new Transaction();
            tx.moveCall({
                target: `${params.packageId}::character::seal_approve_owner`,
                arguments: [
                    tx.pure("vector<u8>", idBytes),
                    tx.object(params.characterId),
                    tx.object(params.ownerCapId),
                ],
            });
            const txBytes = await tx.build({
                client: params.suiClient as never,
                onlyTransactionKind: true,
            });

            await sealClient.fetchKeys({
                ids: [fullId],
                txBytes,
                sessionKey,
                threshold,
            });
            const plaintext = await sealClient.decrypt({ data, sessionKey, txBytes });
            results.push({
                blob_id: blob.blob_id,
                text: new TextDecoder().decode(plaintext),
                distance: blob.distance,
            });
        } catch (err) {
            failed += 1;
            console.error(`[owner-decrypt] SEAL decrypt failed for ${blob.blob_id}:`, err);
        }
    }

    return { results, failed };
}
