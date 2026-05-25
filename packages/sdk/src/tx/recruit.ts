/**
 * Recruit PTB builders — voucher mint, voucher redeem, JoinIntent flow.
 *
 * Thin wrappers around `generated/endless_story/recruit.ts` — drop the
 * `package` plumbing, expose typed argument shapes. No business logic.
 *
 * Use `raw.*` directly if you need a function not surfaced here, or want
 * to override `package` (e.g. multi-deployment testing).
 */
import * as gen from '../generated/endless_story/recruit.js';
import { pkg } from './_package.js';

export { gen as raw };

// ── VoucherRequirements constructors ─────────────────────────────────────
export const noRequirements = () => gen.noRequirements({ package: pkg() });

export const newVoucherRequirements = (args: gen.NewVoucherRequirementsArguments) =>
  gen.newVoucherRequirements({ package: pkg(), arguments: args });

export const checkVoucherRequirements = (args: gen.CheckVoucherRequirementsArguments) =>
  gen.checkVoucherRequirements({ package: pkg(), arguments: args });

// ── Voucher lifecycle (mint → redeem) ───────────────────────────────────
export const mintGenesisVoucher = (args: gen.MintGenesisVoucherArguments) =>
  gen.mintGenesisVoucher({ package: pkg(), arguments: args });

export const redeemVoucherToCharacter = (args: gen.RedeemVoucherToCharacterArguments) =>
  gen.redeemVoucherToCharacter({ package: pkg(), arguments: args });

// ── JoinIntent (wild → saga) ────────────────────────────────────────────
export const requestJoinSaga = (args: gen.RequestJoinSagaArguments) =>
  gen.requestJoinSaga({ package: pkg(), arguments: args });

export const revokeJoinIntent = (args: gen.RevokeJoinIntentArguments) =>
  gen.revokeJoinIntent({ package: pkg(), arguments: args });

export const acceptCharacterIntoSaga = (args: gen.AcceptCharacterIntoSagaArguments) =>
  gen.acceptCharacterIntoSaga({ package: pkg(), arguments: args });
