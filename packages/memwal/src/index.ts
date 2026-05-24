/**
 * @endless-story/memwal — vendored MemWalManual client.
 *
 * Mirrors the upstream `@mysten-incubation/memwal/manual` entry point.
 * Patches against the upstream sources land in `manual.ts`; see README.md.
 */

export { MemWalManual } from "./manual.js";

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
