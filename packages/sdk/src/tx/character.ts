/**
 * Character PTB builders.
 *
 * Phase 0: nothing — codegen hasn't run yet. Once `pnpm codegen` produces
 * `src/generated/endless_story/character.ts`, port wrappers here:
 *
 *   - `mintGenesisCharacter(tx, { name, ... })` — character.move scope 1
 *   - `transferControl(tx, { ownerCap, newController })` — scope 2
 *   - `mintGenesisVoucher(tx, { ... })` — Phase 1.5 (recruitment)
 *   - `redeemVoucherToCharacter(tx, { voucher, ... })` — Phase 1.5
 *
 * **Rule:** these wrappers add ergonomics (string IDs → `tx.object()`),
 * NOT business logic. Anything stateful goes to read/ or runner.
 */
import type { Transaction } from '@mysten/sui/transactions';

// Placeholder export so the module is non-empty (and `export *` from index works).
export const _PHASE_0_PLACEHOLDER = true as const;

// Type guard to silence "unused import" until Phase 1.
type _Tx = Transaction;
