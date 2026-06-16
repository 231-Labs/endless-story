/**
 * ENDLESS public faucet (faucet.move) — admin setup + per-user drip.
 *
 * Thin wrappers around `generated/endless_story/faucet.ts`.
 */
import * as gen from '../generated/endless_story/faucet.js';
import { pkg } from './_package.js';

export { gen as raw };

// Admin setup (one-shot during deploy).
export const createFaucet = (args: gen.CreateFaucetArguments) =>
  gen.createFaucet({ package: pkg(), arguments: args });

export const createFaucetWithDefaults = (args: gen.CreateFaucetWithDefaultsArguments) =>
  gen.createFaucetWithDefaults({ package: pkg(), arguments: args });

// User-facing.
export const drip = (args: gen.DripArguments) =>
  gen.drip({ package: pkg(), arguments: args });

// Admin operations (cooldown bypass, config, pause).
export const adminMint = (args: gen.AdminMintArguments) =>
  gen.adminMint({ package: pkg(), arguments: args });

// Admin: mint fresh ENDLESS straight into a saga treasury (payroll pool top-up
// → makes 班中俸 > 0 even with zero subscribers).
export const adminFundSagaTreasury = (args: gen.AdminFundSagaTreasuryArguments) =>
  gen.adminFundSagaTreasury({ package: pkg(), arguments: args });

export const setConfig = (args: gen.SetConfigArguments) =>
  gen.setConfig({ package: pkg(), arguments: args });

export const setPaused = (args: gen.SetPausedArguments) =>
  gen.setPaused({ package: pkg(), arguments: args });
