/**
 * @endless-story/memwal — vendored MemWalManual client.
 *
 * Two surfaces:
 *   - SagaMemoryClient / OwnerAuditClient — character-bound wrappers that
 *     encode the read-only-Owner vs read-write-Saga split in the type system.
 *     Prefer these from app code.
 *   - MemWalManual — the patched upstream class. Exposed for advanced cases
 *     where the wrappers' surface is too narrow.
 *
 * Patches against the upstream sources live in `manual.ts`; see README.md.
 */

export { MemWalManual } from "./manual.js";

export {
    SagaMemoryClient,
    OwnerAuditClient,
} from "./character-clients.js";

export type {
    CharacterMemoryReader,
    CharacterMemoryWriter,
    SagaClientConfig,
    OwnerAuditClientConfig,
} from "./character-clients.js";

// Owner-side wallet decryption of recallEncrypted blobs (browser-safe).
export { decryptWithOwnerCap } from "./owner-decrypt.js";
export type {
    OwnerWalletSigner,
    OwnerDecryptParams,
    OwnerDecryptResult,
} from "./owner-decrypt.js";

export type {
    MemWalManualConfig,
    SealServerConfig,
    WalletSigner,
    RememberManualResult,
    RecallManualResult,
    RecallManualHit,
    RecallManualMemory,
    EncryptedRecallBlob,
    RecallEncryptedResult,
    RememberMeta,
    RecallOpts,
} from "./types.js";

// Raw blob storage — minimal HTTP client over the public Walrus
// publisher/aggregator. Use this for portraits, attachments, anything that
// just needs to live on Walrus without the full memory (encrypt + vector)
// pipeline.
export * as blob from "./blob.js";
export type {
    WalrusNetwork,
    PutBlobOptions,
    PutBlobResult,
    QuiltFile,
    QuiltPatch,
    PutQuiltResult,
} from "./blob.js";
