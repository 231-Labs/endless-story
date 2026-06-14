/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Economy — on-chain fund-custody authority for the character economy (Part D ·
 * D1).
 * 
 * Ports the VALIDATED economy core
 * (`packages/economy/src/{transfer,settle,derive}.ts`, 41 tests + 6 hypotheses)
 * onto chain at CURRENCY 6-decimals. It gives every `Character` a lazy-init
 * **per-character wallet** — a `Balance<CURRENCY>` attached as a plain
 * `dynamic_field` under `CharacterWalletKey` on the Character's UID — and exposes
 * the fund-moving rails the off-chain settle drives.
 * 
 * **Authority = the cap, never `ctx.sender()`:**
 * 
 * - `owner_fund_character` (挹注) — OwnerCap-id-match (mirrors `dream.move`).
 * - `transfer_between_characters` (接濟) — a ControlCap that `is_valid` for the
 *   FROM/debit character (id-match AND epoch == control_epoch, so revoked /
 *   reassigned caps abort). The cap authorizes the funds SOURCE; crediting any
 *   recipient is intended (you may gift to anyone).
 * - settle rails (Layer 2) — StorytellerCap, saga-bound to the character.
 * 
 * **Conservation is structural:** the module holds NO `TreasuryCap` and mints
 * NOTHING. Every rail is a checked `balance::split` immediately `balance::join`'d,
 * so total `Balance<CURRENCY>` across {saga treasury, protocol sink, all character
 * wallets} is invariant per call. No overdraft: every debit asserts
 * `character_balance >= amount` before `split`, so a wallet can never go negative.
 * 
 * **Dependency direction (one-way, no cycle):** economy imports DOWN on
 * character + saga + currency; those modules MUST NOT import economy. The wallet
 * DF needs `character::uid/uid_mut` (package-visible, added alongside this module
 * — mirrors `scene::uid` consumed by `chamber.move`).
 * 
 * **Scope (D1):** fund-custody RAILS only. The per-day vitality / age / death
 * state machine and dailyCost/salary computation stay OFF-CHAIN (decision ⑤ / §6
 * MVP切點); the chain receives already-resolved `amount`s. Estate-on-death sweep
 * and owner revenue inflow are D2. KNOWN LIMITATION: until D2 ships the estate
 * sweep, funds in a wallet whose character later dies are unreachable (`transfer`
 * asserts `!is_dead(from)`) — see `economy_test::stranded_funds_on_dead_wallet`.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as balance from './deps/sui/balance.js';
const $moduleName = '@local-pkg/endless-story::economy';
export const CharacterWalletKey = new MoveStruct({ name: `${$moduleName}::CharacterWalletKey`, fields: {
        dummy_field: bcs.bool()
    } });
export const CharacterFunded = new MoveStruct({ name: `${$moduleName}::CharacterFunded`, fields: {
        character_id: bcs.Address,
        funder: bcs.Address,
        amount: bcs.u64(),
        new_balance: bcs.u64()
    } });
export const CharacterTransfer = new MoveStruct({ name: `${$moduleName}::CharacterTransfer`, fields: {
        from_id: bcs.Address,
        to_id: bcs.Address,
        amount: bcs.u64(),
        /**
         * relationship-tone metadata only (gift/patronage/loan/repay/bribe/tribute); NEVER
         * branches value math.
         */
        memo_kind: bcs.u8(),
        from_balance: bcs.u64(),
        to_balance: bcs.u64()
    } });
export const ProtocolSink = new MoveStruct({ name: `${$moduleName}::ProtocolSink`, fields: {
        id: bcs.Address,
        treasury: balance.Balance,
        total_collected: bcs.u64()
    } });
export const ProtocolSinkCreated = new MoveStruct({ name: `${$moduleName}::ProtocolSinkCreated`, fields: {
        sink_id: bcs.Address,
        creator_saga_id: bcs.Address
    } });
export const SagaPayrollConfig = new MoveStruct({ name: `${$moduleName}::SagaPayrollConfig`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address,
        sub_price: bcs.u64(),
        owner_bps: bcs.u16(),
        storyteller_bps: bcs.u16(),
        treasury_bps: bcs.u16(),
        c_run: bcs.u64(),
        c_mem: bcs.u64(),
        c_img: bcs.u64(),
        c_seal: bcs.u64(),
        active_live_milli: bcs.u64(),
        active_dormant_milli: bcs.u64(),
        recall_active: bcs.u64(),
        recall_dormant: bcs.u64(),
        slot_bonus_milli: bcs.u64()
    } });
export const PayrollAdminCap = new MoveStruct({ name: `${$moduleName}::PayrollAdminCap`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address
    } });
export const PayrollConfigCreated = new MoveStruct({ name: `${$moduleName}::PayrollConfigCreated`, fields: {
        config_id: bcs.Address,
        saga_id: bcs.Address,
        sub_price: bcs.u64()
    } });
export const PayrollConfigUpdated = new MoveStruct({ name: `${$moduleName}::PayrollConfigUpdated`, fields: {
        config_id: bcs.Address,
        saga_id: bcs.Address,
        sub_price: bcs.u64()
    } });
export const SalaryCredited = new MoveStruct({ name: `${$moduleName}::SalaryCredited`, fields: {
        saga_id: bcs.Address,
        character_id: bcs.Address,
        amount: bcs.u64(),
        new_balance: bcs.u64()
    } });
export const DailyCostCollected = new MoveStruct({ name: `${$moduleName}::DailyCostCollected`, fields: {
        saga_id: bcs.Address,
        character_id: bcs.Address,
        amount: bcs.u64(),
        requested: bcs.u64(),
        insolvent: bcs.bool(),
        new_balance: bcs.u64()
    } });
export interface CharacterBalanceArguments {
    c: RawTransactionArgument<string>;
}
export interface CharacterBalanceOptions {
    package?: string;
    arguments: CharacterBalanceArguments | [
        c: RawTransactionArgument<string>
    ];
}
/**
 * A character's wallet balance in ENDLESS base units. Returns 0 for a never-funded
 * character (the DF is absent) — never aborts.
 */
export function characterBalance(options: CharacterBalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'character_balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OwnerFundCharacterArguments {
    ownerCap: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    payment: RawTransactionArgument<string>;
}
export interface OwnerFundCharacterOptions {
    package?: string;
    arguments: OwnerFundCharacterArguments | [
        ownerCap: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        payment: RawTransactionArgument<string>
    ];
}
/**
 * Deposit an existing `Coin<CURRENCY>` into a character's wallet. Gated by the
 * character's OwnerCap (epoch-less; possession + id-match is full authority). Pure
 * inflow — no saga / treasury touch; the Coin already existed (no mint).
 */
export function ownerFundCharacter(options: OwnerFundCharacterOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["ownerCap", "character", "payment"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'owner_fund_character',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TransferBetweenCharactersArguments {
    controlCap: RawTransactionArgument<string>;
    from: RawTransactionArgument<string>;
    to: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
    memoKind: RawTransactionArgument<number>;
}
export interface TransferBetweenCharactersOptions {
    package?: string;
    arguments: TransferBetweenCharactersArguments | [
        controlCap: RawTransactionArgument<string>,
        from: RawTransactionArgument<string>,
        to: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>,
        memoKind: RawTransactionArgument<number>
    ];
}
/**
 * Move `amount` from `from`'s wallet to `to`'s wallet. Gated by a ControlCap that
 * `is_valid` for the FROM character. Ports `transfer.ts applyTransfer` guards in
 * EXACT order; net-0 within Σ-wallet. `memo_kind` is event metadata only
 * (relationship tone) and never affects value math.
 */
export function transferBetweenCharacters(options: TransferBetweenCharactersOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64',
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["controlCap", "from", "to", "amount", "memoKind"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'transfer_between_characters',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MemoGiftOptions {
    package?: string;
    arguments?: [
    ];
}
export function memoGift(options: MemoGiftOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'memo_gift',
    });
}
export interface MemoPatronageOptions {
    package?: string;
    arguments?: [
    ];
}
export function memoPatronage(options: MemoPatronageOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'memo_patronage',
    });
}
export interface MemoLoanOptions {
    package?: string;
    arguments?: [
    ];
}
export function memoLoan(options: MemoLoanOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'memo_loan',
    });
}
export interface MemoRepayOptions {
    package?: string;
    arguments?: [
    ];
}
export function memoRepay(options: MemoRepayOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'memo_repay',
    });
}
export interface MemoBribeOptions {
    package?: string;
    arguments?: [
    ];
}
export function memoBribe(options: MemoBribeOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'memo_bribe',
    });
}
export interface MemoTributeOptions {
    package?: string;
    arguments?: [
    ];
}
export function memoTribute(options: MemoTributeOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'memo_tribute',
    });
}
export interface InitProtocolSinkArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
}
export interface InitProtocolSinkOptions {
    package?: string;
    arguments: InitProtocolSinkArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>
    ];
}
/** Create + share the protocol sink (once; StorytellerCap proves operator). */
export function initProtocolSink(options: InitProtocolSinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'init_protocol_sink',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProtocolSinkBalanceArguments {
    sink: RawTransactionArgument<string>;
}
export interface ProtocolSinkBalanceOptions {
    package?: string;
    arguments: ProtocolSinkBalanceArguments | [
        sink: RawTransactionArgument<string>
    ];
}
export function protocolSinkBalance(options: ProtocolSinkBalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["sink"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'protocol_sink_balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProtocolSinkTotalCollectedArguments {
    sink: RawTransactionArgument<string>;
}
export interface ProtocolSinkTotalCollectedOptions {
    package?: string;
    arguments: ProtocolSinkTotalCollectedArguments | [
        sink: RawTransactionArgument<string>
    ];
}
export function protocolSinkTotalCollected(options: ProtocolSinkTotalCollectedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["sink"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'protocol_sink_total_collected',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreatePayrollConfigArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    subPrice: RawTransactionArgument<number | bigint>;
    ownerBps: RawTransactionArgument<number>;
    storytellerBps: RawTransactionArgument<number>;
    treasuryBps: RawTransactionArgument<number>;
    cRun: RawTransactionArgument<number | bigint>;
    cMem: RawTransactionArgument<number | bigint>;
    cImg: RawTransactionArgument<number | bigint>;
    cSeal: RawTransactionArgument<number | bigint>;
    activeLiveMilli: RawTransactionArgument<number | bigint>;
    activeDormantMilli: RawTransactionArgument<number | bigint>;
    recallActive: RawTransactionArgument<number | bigint>;
    recallDormant: RawTransactionArgument<number | bigint>;
    slotBonusMilli: RawTransactionArgument<number | bigint>;
}
export interface CreatePayrollConfigOptions {
    package?: string;
    arguments: CreatePayrollConfigArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        subPrice: RawTransactionArgument<number | bigint>,
        ownerBps: RawTransactionArgument<number>,
        storytellerBps: RawTransactionArgument<number>,
        treasuryBps: RawTransactionArgument<number>,
        cRun: RawTransactionArgument<number | bigint>,
        cMem: RawTransactionArgument<number | bigint>,
        cImg: RawTransactionArgument<number | bigint>,
        cSeal: RawTransactionArgument<number | bigint>,
        activeLiveMilli: RawTransactionArgument<number | bigint>,
        activeDormantMilli: RawTransactionArgument<number | bigint>,
        recallActive: RawTransactionArgument<number | bigint>,
        recallDormant: RawTransactionArgument<number | bigint>,
        slotBonusMilli: RawTransactionArgument<number | bigint>
    ];
}
/** Storyteller creates the SagaPayrollConfig (one per saga, at bootstrap). */
export function createPayrollConfig(options: CreatePayrollConfigOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'u64',
        'u16',
        'u16',
        'u16',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "subPrice", "ownerBps", "storytellerBps", "treasuryBps", "cRun", "cMem", "cImg", "cSeal", "activeLiveMilli", "activeDormantMilli", "recallActive", "recallDormant", "slotBonusMilli"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'create_payroll_config',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetPayrollParamsArguments {
    admin: RawTransactionArgument<string>;
    config: RawTransactionArgument<string>;
    subPrice: RawTransactionArgument<number | bigint>;
    ownerBps: RawTransactionArgument<number>;
    storytellerBps: RawTransactionArgument<number>;
    treasuryBps: RawTransactionArgument<number>;
    cRun: RawTransactionArgument<number | bigint>;
    cMem: RawTransactionArgument<number | bigint>;
    cImg: RawTransactionArgument<number | bigint>;
    cSeal: RawTransactionArgument<number | bigint>;
    activeLiveMilli: RawTransactionArgument<number | bigint>;
    activeDormantMilli: RawTransactionArgument<number | bigint>;
    recallActive: RawTransactionArgument<number | bigint>;
    recallDormant: RawTransactionArgument<number | bigint>;
    slotBonusMilli: RawTransactionArgument<number | bigint>;
}
export interface SetPayrollParamsOptions {
    package?: string;
    arguments: SetPayrollParamsArguments | [
        admin: RawTransactionArgument<string>,
        config: RawTransactionArgument<string>,
        subPrice: RawTransactionArgument<number | bigint>,
        ownerBps: RawTransactionArgument<number>,
        storytellerBps: RawTransactionArgument<number>,
        treasuryBps: RawTransactionArgument<number>,
        cRun: RawTransactionArgument<number | bigint>,
        cMem: RawTransactionArgument<number | bigint>,
        cImg: RawTransactionArgument<number | bigint>,
        cSeal: RawTransactionArgument<number | bigint>,
        activeLiveMilli: RawTransactionArgument<number | bigint>,
        activeDormantMilli: RawTransactionArgument<number | bigint>,
        recallActive: RawTransactionArgument<number | bigint>,
        recallDormant: RawTransactionArgument<number | bigint>,
        slotBonusMilli: RawTransactionArgument<number | bigint>
    ];
}
/** Bulk setter (D7). PayrollAdminCap-gated, saga-bound. Re-asserts bps sum. */
export function setPayrollParams(options: SetPayrollParamsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'u64',
        'u16',
        'u16',
        'u16',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["admin", "config", "subPrice", "ownerBps", "storytellerBps", "treasuryBps", "cRun", "cMem", "cImg", "cSeal", "activeLiveMilli", "activeDormantMilli", "recallActive", "recallDormant", "slotBonusMilli"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'set_payroll_params',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PayrollSagaIdArguments {
    c: RawTransactionArgument<string>;
}
export interface PayrollSagaIdOptions {
    package?: string;
    arguments: PayrollSagaIdArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function payrollSagaId(options: PayrollSagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'payroll_saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PayrollSubPriceArguments {
    c: RawTransactionArgument<string>;
}
export interface PayrollSubPriceOptions {
    package?: string;
    arguments: PayrollSubPriceArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function payrollSubPrice(options: PayrollSubPriceOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'payroll_sub_price',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PayrollOwnerBpsArguments {
    c: RawTransactionArgument<string>;
}
export interface PayrollOwnerBpsOptions {
    package?: string;
    arguments: PayrollOwnerBpsArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function payrollOwnerBps(options: PayrollOwnerBpsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'payroll_owner_bps',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PayrollStorytellerBpsArguments {
    c: RawTransactionArgument<string>;
}
export interface PayrollStorytellerBpsOptions {
    package?: string;
    arguments: PayrollStorytellerBpsArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function payrollStorytellerBps(options: PayrollStorytellerBpsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'payroll_storyteller_bps',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PayrollTreasuryBpsArguments {
    c: RawTransactionArgument<string>;
}
export interface PayrollTreasuryBpsOptions {
    package?: string;
    arguments: PayrollTreasuryBpsArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function payrollTreasuryBps(options: PayrollTreasuryBpsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'payroll_treasury_bps',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PayrollCRunArguments {
    c: RawTransactionArgument<string>;
}
export interface PayrollCRunOptions {
    package?: string;
    arguments: PayrollCRunArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function payrollCRun(options: PayrollCRunOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'payroll_c_run',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PayrollCMemArguments {
    c: RawTransactionArgument<string>;
}
export interface PayrollCMemOptions {
    package?: string;
    arguments: PayrollCMemArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function payrollCMem(options: PayrollCMemOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'payroll_c_mem',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PayrollCImgArguments {
    c: RawTransactionArgument<string>;
}
export interface PayrollCImgOptions {
    package?: string;
    arguments: PayrollCImgArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function payrollCImg(options: PayrollCImgOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'payroll_c_img',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PayrollCSealArguments {
    c: RawTransactionArgument<string>;
}
export interface PayrollCSealOptions {
    package?: string;
    arguments: PayrollCSealArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function payrollCSeal(options: PayrollCSealOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'payroll_c_seal',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreditSalaryArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
}
export interface CreditSalaryOptions {
    package?: string;
    arguments: CreditSalaryArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Credit `amount` of salary from the saga treasury into a character's wallet. The
 * off-chain settle computes the per-char amount (budget/perfPool split, settle.ts)
 * and passes it in; the undistributed remainder stays in the treasury (carryover).
 * Gated by StorytellerCap AND the character must belong to this saga (assert_cap
 * only binds cap→saga, NOT saga→character — without this a StorytellerCap could
 * drain the treasury into any character object).
 */
export function creditSalary(options: CreditSalaryOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "character", "amount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'credit_salary',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CollectDailyCostArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    requested: RawTransactionArgument<number | bigint>;
    sink: RawTransactionArgument<string>;
}
export interface CollectDailyCostOptions {
    package?: string;
    arguments: CollectDailyCostArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        requested: RawTransactionArgument<number | bigint>,
        sink: RawTransactionArgument<string>
    ];
}
/**
 * Debit `requested` dailyCost (computed off-chain) from a character's wallet into
 * the protocol sink. Pays `bmin(balance, requested)` — never overdraws — and
 * returns `insolvent` (paid < requested), matching settle.ts:114-118.
 * Vitality/death are NOT applied here (off-chain D5). StorytellerCap-gated +
 * saga-bound (same authority binding as credit_salary).
 */
export function collectDailyCost(options: CollectDailyCostOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "character", "requested", "sink"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'economy',
        function: 'collect_daily_cost',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}