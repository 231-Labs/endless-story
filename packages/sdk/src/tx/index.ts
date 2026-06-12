/**
 * PTB (Programmable Transaction Block) builders.
 *
 * One file per Move module. Each builder takes a `Transaction` and pushes
 * the calls — the caller decides when to sign / submit.
 *
 * **Pattern:** thin wrappers around generated bindings; auto-inject the
 * deployed packageId, expose typed argument shapes. No business logic.
 * Each module also re-exports `raw` (the full generated namespace) as an
 * escape hatch for advanced cases.
 *
 * Usage:
 * ```ts
 * import { tx } from '@endless-story/sdk';
 * const ptb = new Transaction();
 * const reqs = ptb.add(tx.recruit.noRequirements());
 * ptb.add(tx.recruit.mintGenesisVoucher({ saga, payment, ... }));
 * ```
 */

export * as currency from './currency.js';
export * as faucet from './faucet.js';
export * as world from './world.js';
export * as saga from './saga.js';
export * as scene from './scene.js';
export * as character from './character.js';
export * as recruit from './recruit.js';
export * as commitment from './commitment.js';
export * as director from './director.js';
export * as subscribe from './subscribe.js';
export * as dream from './dream.js';
export * as reflection from './reflection.js';
export * as event from './event.js';
export * as resource from './resource.js';
export * as still from './still.js';
export * as chamber from './chamber.js';
