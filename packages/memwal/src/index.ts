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

export type {
    MemWalManualConfig,
    SealServerConfig,
    WalletSigner,
    RememberManualOptions,
    RememberManualResult,
    RecallManualOptions,
    RecallManualResult,
    RecallManualHit,
    RecallManualMemory,
} from "./types.js";
