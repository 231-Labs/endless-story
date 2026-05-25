/**
 * Saga (saga.move) — create + governance + card weighting + attribute defs.
 *
 * Thin wrappers around `generated/endless_story/saga.ts`.
 */
import * as gen from '../generated/endless_story/saga.js';
import { pkg } from './_package.js';

export { gen as raw };

// ── Lifecycle ──────────────────────────────────────────────────────────
export const createSaga = (args: gen.CreateSagaArguments) =>
  gen.createSaga({ package: pkg(), arguments: args });

export const markSagaInactive = (args: gen.MarkSagaInactiveArguments) =>
  gen.markSagaInactive({ package: pkg(), arguments: args });

export const withdrawFromTreasury = (args: gen.WithdrawFromTreasuryArguments) =>
  gen.withdrawFromTreasury({ package: pkg(), arguments: args });

// ── Coverage / departure policy ────────────────────────────────────────
export const coverLocation = (args: gen.CoverLocationArguments) =>
  gen.coverLocation({ package: pkg(), arguments: args });

export const setSagaDeparturePolicy = (args: gen.SetSagaDeparturePolicyArguments) =>
  gen.setSagaDeparturePolicy({ package: pkg(), arguments: args });

// ── Card weighting (R3.2) ──────────────────────────────────────────────
export const enableCardWeighting = (args: gen.EnableCardWeightingArguments) =>
  gen.enableCardWeighting({ package: pkg(), arguments: args });

export const disableCardWeighting = (args: gen.DisableCardWeightingArguments) =>
  gen.disableCardWeighting({ package: pkg(), arguments: args });

export const setCardWeightRule = (args: gen.SetCardWeightRuleArguments) =>
  gen.setCardWeightRule({ package: pkg(), arguments: args });

export const clearCardWeightRule = (args: gen.ClearCardWeightRuleArguments) =>
  gen.clearCardWeightRule({ package: pkg(), arguments: args });

// ── Saga attribute defs (R3.3) ─────────────────────────────────────────
export const defineSagaAttribute = (args: gen.DefineSagaAttributeArguments) =>
  gen.defineSagaAttribute({ package: pkg(), arguments: args });

export const clearSagaAttribute = (args: gen.ClearSagaAttributeArguments) =>
  gen.clearSagaAttribute({ package: pkg(), arguments: args });

// ── Cap helpers ────────────────────────────────────────────────────────
export const verifyCap = (args: gen.VerifyCapArguments) =>
  gen.verifyCap({ package: pkg(), arguments: args });

export const assertCap = (args: gen.AssertCapArguments) =>
  gen.assertCap({ package: pkg(), arguments: args });

// ── Value constructors ─────────────────────────────────────────────────
export const kindStandard = () => gen.kindStandard({ package: pkg() });
export const kindReincarnation = () => gen.kindReincarnation({ package: pkg() });
export const newRevenueConfig = (args: gen.NewRevenueConfigArguments) =>
  gen.newRevenueConfig({ package: pkg(), arguments: args });
