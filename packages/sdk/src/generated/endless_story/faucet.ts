/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Public ENDLESS faucet — anyone can drip; admin tunes the spigot.
 * 
 * **Shape:**
 * 
 * - `Faucet` is a shared object holding the `TreasuryCap<CURRENCY>`.
 * - `FaucetAdminCap` is a separate, transferrable cap (transfer to runner after
 *   bootstrap so devnet operator can hot-tune limits).
 * 
 * **Knobs (all admin-only):**
 * 
 * - `drip_amount` — base units minted per `drip` call (decimals=6).
 * - `cooldown_ms` — minimum wall-clock ms between drips per address.
 * - `total_supply_cap` — hard ceiling on cumulative drips (0 = unlimited).
 * - `paused` — emergency stop; `drip` aborts when true.
 * 
 * **Admin backdoor:** `admin_mint` mints outside the cooldown/cap rules — useful
 * for seed distributions, refunds, or whitelisted large transfers.
 * 
 * **Init:** `create_faucet` consumes the publisher-held `TreasuryCap` (issued at
 * currency publish) and wraps it inside the shared Faucet. From that point the cap
 * is unreachable except via `admin_mint` calls — no extraction function by design
 * (less surface area for foot-guns).
 * 
 * **Rate limit:** per-address `last_drip_ms` lives in a `Table`. Grows unbounded;
 * acceptable for devnet/testnet, prune later if needed.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as coin from './deps/sui/coin.js';
import * as table from './deps/sui/table.js';
const $moduleName = '@local-pkg/endless-story::faucet';
export const FaucetAdminCap = new MoveStruct({ name: `${$moduleName}::FaucetAdminCap`, fields: {
        id: bcs.Address,
        faucet_id: bcs.Address
    } });
export const Faucet = new MoveStruct({ name: `${$moduleName}::Faucet`, fields: {
        id: bcs.Address,
        treasury_cap: coin.TreasuryCap,
        drip_amount: bcs.u64(),
        cooldown_ms: bcs.u64(),
        /** 0 = unlimited. */
        total_supply_cap: bcs.u64(),
        /** Cumulative base units minted across all drip + admin_mint calls. */
        total_minted: bcs.u64(),
        paused: bcs.bool(),
        /** address → last drip timestamp_ms (only updated by `drip`, not `admin_mint`). */
        last_drip_by: table.Table,
        created_at_ms: bcs.u64()
    } });
export const FaucetCreated = new MoveStruct({ name: `${$moduleName}::FaucetCreated`, fields: {
        faucet_id: bcs.Address,
        admin_cap_id: bcs.Address,
        drip_amount: bcs.u64(),
        cooldown_ms: bcs.u64(),
        total_supply_cap: bcs.u64(),
        created_at_ms: bcs.u64()
    } });
export const Dripped = new MoveStruct({ name: `${$moduleName}::Dripped`, fields: {
        faucet_id: bcs.Address,
        recipient: bcs.Address,
        amount: bcs.u64(),
        total_minted: bcs.u64(),
        dripped_at_ms: bcs.u64()
    } });
export const AdminMinted = new MoveStruct({ name: `${$moduleName}::AdminMinted`, fields: {
        faucet_id: bcs.Address,
        recipient: bcs.Address,
        amount: bcs.u64(),
        total_minted: bcs.u64(),
        minted_at_ms: bcs.u64()
    } });
export const ConfigUpdated = new MoveStruct({ name: `${$moduleName}::ConfigUpdated`, fields: {
        faucet_id: bcs.Address,
        drip_amount: bcs.u64(),
        cooldown_ms: bcs.u64(),
        total_supply_cap: bcs.u64(),
        paused: bcs.bool(),
        updated_at_ms: bcs.u64()
    } });
export interface CreateFaucetArguments {
    treasuryCap: RawTransactionArgument<string>;
    dripAmount: RawTransactionArgument<number | bigint>;
    cooldownMs: RawTransactionArgument<number | bigint>;
    totalSupplyCap: RawTransactionArgument<number | bigint>;
}
export interface CreateFaucetOptions {
    package?: string;
    arguments: CreateFaucetArguments | [
        treasuryCap: RawTransactionArgument<string>,
        dripAmount: RawTransactionArgument<number | bigint>,
        cooldownMs: RawTransactionArgument<number | bigint>,
        totalSupplyCap: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Wrap a `TreasuryCap<CURRENCY>` (issued at currency publish) inside a new shared
 * Faucet. Returns the `FaucetAdminCap` to the caller.
 *
 * Typical bootstrap PTB:
 *
 * 1.  publish endless_story package (currency::init → TreasuryCap to sender)
 * 2.  call faucet::create_faucet(treasury_cap, ..., clock) → admin cap
 * 3.  transfer admin cap to runner address
 */
export function createFaucet(options: CreateFaucetOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        'u64',
        'u64',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["treasuryCap", "dripAmount", "cooldownMs", "totalSupplyCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'create_faucet',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateFaucetWithDefaultsArguments {
    treasuryCap: RawTransactionArgument<string>;
}
export interface CreateFaucetWithDefaultsOptions {
    package?: string;
    arguments: CreateFaucetWithDefaultsArguments | [
        treasuryCap: RawTransactionArgument<string>
    ];
}
/**
 * Same as `create_faucet` but uses sensible defaults (10 ENDLESS / 24h cooldown /
 * unlimited supply).
 */
export function createFaucetWithDefaults(options: CreateFaucetWithDefaultsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["treasuryCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'create_faucet_with_defaults',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DripArguments {
    faucet: RawTransactionArgument<string>;
}
export interface DripOptions {
    package?: string;
    arguments: DripArguments | [
        faucet: RawTransactionArgument<string>
    ];
}
/**
 * Public drip — any address can call. Mints `drip_amount` to `ctx.sender()` if (a)
 * faucet not paused, (b) cooldown elapsed for this sender, (c) supply cap not
 * exhausted.
 *
 * The self-transfer lint is intentionally suppressed: a faucet's UX _is_ "call
 * once, receive tokens". For composable mint flows use `admin_mint` which lets the
 * caller pick the recipient.
 */
export function drip(options: DripOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["faucet"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'drip',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AdminMintArguments {
    admin: RawTransactionArgument<string>;
    faucet: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
    recipient: RawTransactionArgument<string>;
}
export interface AdminMintOptions {
    package?: string;
    arguments: AdminMintArguments | [
        admin: RawTransactionArgument<string>,
        faucet: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>,
        recipient: RawTransactionArgument<string>
    ];
}
/**
 * Admin can mint any amount to any address. Bypasses cooldown, but still respects
 * `total_supply_cap` (so the cap is a true ceiling on supply, not just on the
 * public drip path).
 */
export function adminMint(options: AdminMintOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'u64',
        'address',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["admin", "faucet", "amount", "recipient"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'admin_mint',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AdminFundSagaTreasuryArguments {
    admin: RawTransactionArgument<string>;
    faucet: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
}
export interface AdminFundSagaTreasuryOptions {
    package?: string;
    arguments: AdminFundSagaTreasuryArguments | [
        admin: RawTransactionArgument<string>,
        faucet: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Mint `amount` base units of fresh ENDLESS straight into `saga`'s treasury — the
 * on-chain payroll pool the off-chain settle draws role base-floor wages from (so
 * 班中俸 > 0 even with zero subscribers). Like `admin_mint` it bypasses cooldown
 * but still respects `total_supply_cap`.
 */
export function adminFundSagaTreasury(options: AdminFundSagaTreasuryOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["admin", "faucet", "saga", "amount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'admin_fund_saga_treasury',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetConfigArguments {
    admin: RawTransactionArgument<string>;
    faucet: RawTransactionArgument<string>;
    dripAmount: RawTransactionArgument<number | bigint>;
    cooldownMs: RawTransactionArgument<number | bigint>;
    totalSupplyCap: RawTransactionArgument<number | bigint>;
    paused: RawTransactionArgument<boolean>;
}
export interface SetConfigOptions {
    package?: string;
    arguments: SetConfigArguments | [
        admin: RawTransactionArgument<string>,
        faucet: RawTransactionArgument<string>,
        dripAmount: RawTransactionArgument<number | bigint>,
        cooldownMs: RawTransactionArgument<number | bigint>,
        totalSupplyCap: RawTransactionArgument<number | bigint>,
        paused: RawTransactionArgument<boolean>
    ];
}
/**
 * Update any subset of knobs in a single call. `total_supply_cap` of 0 means
 * "unlimited"; setting it below `total_minted` is invalid.
 */
export function setConfig(options: SetConfigOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'u64',
        'u64',
        'u64',
        'bool',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["admin", "faucet", "dripAmount", "cooldownMs", "totalSupplyCap", "paused"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'set_config',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetPausedArguments {
    admin: RawTransactionArgument<string>;
    faucet: RawTransactionArgument<string>;
    paused: RawTransactionArgument<boolean>;
}
export interface SetPausedOptions {
    package?: string;
    arguments: SetPausedArguments | [
        admin: RawTransactionArgument<string>,
        faucet: RawTransactionArgument<string>,
        paused: RawTransactionArgument<boolean>
    ];
}
/** Emergency pause/unpause — minimal cap for hot-fixes. */
export function setPaused(options: SetPausedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'bool',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["admin", "faucet", "paused"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'set_paused',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FaucetIdArguments {
    faucet: RawTransactionArgument<string>;
}
export interface FaucetIdOptions {
    package?: string;
    arguments: FaucetIdArguments | [
        faucet: RawTransactionArgument<string>
    ];
}
export function faucetId(options: FaucetIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["faucet"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'faucet_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AdminFaucetIdArguments {
    admin: RawTransactionArgument<string>;
}
export interface AdminFaucetIdOptions {
    package?: string;
    arguments: AdminFaucetIdArguments | [
        admin: RawTransactionArgument<string>
    ];
}
export function adminFaucetId(options: AdminFaucetIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["admin"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'admin_faucet_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DripAmountArguments {
    faucet: RawTransactionArgument<string>;
}
export interface DripAmountOptions {
    package?: string;
    arguments: DripAmountArguments | [
        faucet: RawTransactionArgument<string>
    ];
}
export function dripAmount(options: DripAmountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["faucet"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'drip_amount',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CooldownMsArguments {
    faucet: RawTransactionArgument<string>;
}
export interface CooldownMsOptions {
    package?: string;
    arguments: CooldownMsArguments | [
        faucet: RawTransactionArgument<string>
    ];
}
export function cooldownMs(options: CooldownMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["faucet"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'cooldown_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TotalSupplyCapArguments {
    faucet: RawTransactionArgument<string>;
}
export interface TotalSupplyCapOptions {
    package?: string;
    arguments: TotalSupplyCapArguments | [
        faucet: RawTransactionArgument<string>
    ];
}
export function totalSupplyCap(options: TotalSupplyCapOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["faucet"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'total_supply_cap',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TotalMintedArguments {
    faucet: RawTransactionArgument<string>;
}
export interface TotalMintedOptions {
    package?: string;
    arguments: TotalMintedArguments | [
        faucet: RawTransactionArgument<string>
    ];
}
export function totalMinted(options: TotalMintedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["faucet"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'total_minted',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsPausedArguments {
    faucet: RawTransactionArgument<string>;
}
export interface IsPausedOptions {
    package?: string;
    arguments: IsPausedArguments | [
        faucet: RawTransactionArgument<string>
    ];
}
export function isPaused(options: IsPausedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["faucet"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'is_paused',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RemainingSupplyArguments {
    faucet: RawTransactionArgument<string>;
}
export interface RemainingSupplyOptions {
    package?: string;
    arguments: RemainingSupplyArguments | [
        faucet: RawTransactionArgument<string>
    ];
}
/** 0 = unlimited (no cap set). */
export function remainingSupply(options: RemainingSupplyOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["faucet"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'remaining_supply',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NextDripAtMsArguments {
    faucet: RawTransactionArgument<string>;
    who: RawTransactionArgument<string>;
}
export interface NextDripAtMsOptions {
    package?: string;
    arguments: NextDripAtMsArguments | [
        faucet: RawTransactionArgument<string>,
        who: RawTransactionArgument<string>
    ];
}
/**
 * Returns the wall-clock ms at which `who` may next call `drip`. 0 if never
 * dripped (i.e. eligible immediately).
 */
export function nextDripAtMs(options: NextDripAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["faucet", "who"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'faucet',
        function: 'next_drip_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}