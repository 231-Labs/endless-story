/**
 * View queries — read-only on-chain data fetchers.
 *
 * One file per Move module. Each `get<Name>(client, id)` returns the
 * parsed TypeScript shape (struct fields decoded via `MoveStruct.get`).
 *
 * **Pattern:** thin — no caching, no aggregation, no derived fields.
 * Each module also re-exports `raw` for event parsing or advanced cases.
 *
 * Usage:
 * ```ts
 * import { read, makeSuiClient } from '@endless-story/sdk';
 * const client = makeSuiClient({ network: 'devnet' });
 * const voucher = await read.recruit.getGenesisVoucher(client, '0x…');
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
export * as subscribe from './subscribe.js';
export * as dream from './dream.js';
export * as reflection from './reflection.js';
export * as event from './event.js';
