/**
 * ENDLESS coin (currency.move) — mint only.
 *
 * Mint requires the `TreasuryCap<ENDLESS>` held by the publisher; usually
 * called once during bootstrap to seed the faucet's coin pool, and later
 * only by `faucet::admin_mint` (which holds its own backdoor reference).
 *
 * Thin wrapper around `generated/endless_story/currency.ts`.
 */
import * as gen from '../generated/endless_story/currency.js';
import { pkg } from './_package.js';

export { gen as raw };

export const mint = (args: gen.MintArguments) =>
  gen.mint({ package: pkg(), arguments: args });
