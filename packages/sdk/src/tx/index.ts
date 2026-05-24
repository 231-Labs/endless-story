/**
 * PTB (Programmable Transaction Block) builders.
 *
 * One file per Move module. Each builder takes a `Transaction` and pushes
 * the calls — the caller decides when to sign / submit.
 *
 * **Pattern:** thin wrappers around generated bindings; add ergonomic
 * argument shapes (string IDs → `tx.object(id)`, etc.) but no business logic.
 *
 * Phase 1 modules land here in order: currency → world → saga → scene →
 * character (including voucher mint/redeem) → event → commitment.
 */

// Phase 0: only character.move exists.
export * as character from './character';

// Phase 1+: re-exports added as modules ship.
// export * as currency from './currency';
// export * as world from './world';
// export * as saga from './saga';
// export * as scene from './scene';
// export * as event from './event';
// export * as commitment from './commitment';
