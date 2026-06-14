/**
 * Economy (economy.move) — on-chain fund-custody rails (Part D · D1).
 *
 * Thin wrappers around `generated/endless_story/economy.ts`; auto-inject the
 * deployed packageId. Authority is the cap, never the sender:
 *   - owner_fund_character          → OwnerCap (挹注)
 *   - transfer_between_characters   → ControlCap valid-for-FROM (接濟)
 *   - credit_salary / collect_daily_cost / create_payroll_config → StorytellerCap
 *   - set_payroll_params            → PayrollAdminCap
 *
 * Reads (character_balance / protocol_sink_* / payroll_* views) are Move
 * functions — devInspect them, or read the wallet DF directly, when the web
 * settle adapter is wired post-redeploy.
 */
import * as gen from '../generated/endless_story/economy.js';
import { pkg } from './_package.js';

export { gen as raw };

/** 挹注 — owner deposits a Coin<CURRENCY> into their character's wallet. */
export const ownerFundCharacter = (args: gen.OwnerFundCharacterArguments) =>
    gen.ownerFundCharacter({ package: pkg(), arguments: args });

/** 接濟 — move funds between two characters (ControlCap-gated on FROM). */
export const transferBetweenCharacters = (args: gen.TransferBetweenCharactersArguments) =>
    gen.transferBetweenCharacters({ package: pkg(), arguments: args });

/** Credit salary from the saga treasury into a character's wallet. */
export const creditSalary = (args: gen.CreditSalaryArguments) =>
    gen.creditSalary({ package: pkg(), arguments: args });

/** Debit dailyCost from a character's wallet into the protocol sink. */
export const collectDailyCost = (args: gen.CollectDailyCostArguments) =>
    gen.collectDailyCost({ package: pkg(), arguments: args });

/** Create + share the shared ProtocolSink (once; StorytellerCap-gated). */
export const initProtocolSink = (args: gen.InitProtocolSinkArguments) =>
    gen.initProtocolSink({ package: pkg(), arguments: args });

/** Create + share the per-saga SagaPayrollConfig (StorytellerCap-gated). */
export const createPayrollConfig = (args: gen.CreatePayrollConfigArguments) =>
    gen.createPayrollConfig({ package: pkg(), arguments: args });

/** Update payroll knobs (PayrollAdminCap-gated; D7 SalaryPolicyPanel). */
export const setPayrollParams = (args: gen.SetPayrollParamsArguments) =>
    gen.setPayrollParams({ package: pkg(), arguments: args });
