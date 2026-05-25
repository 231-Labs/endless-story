/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Native protocol coin for Endless Story.
 * 
 * `ENDLESS` is the unit used by saga fees, recruitment vouchers, event resolution
 * flows, and revenue splits. One-time witness pattern: the `CURRENCY` struct is
 * consumed by `init` and never re-instantiated, so supply is bounded by the single
 * `TreasuryCap<CURRENCY>` issued at publish time.
 * 
 * **Decimals:** 6 (1 ENDLESS = 1_000_000 base units).
 * 
 * **TreasuryCap owner:** at publish time the cap is transferred to the publisher
 * (the address running `sui client publish`). Bootstrap is expected to transfer it
 * onward to the runner address — see `@endless-story/cli`.
 * 
 * **Metadata:** registered via `coin_registry::new_currency_with_otw` (Sui
 * framework 1.45+). The `MetadataCap<CURRENCY>` is **retained** (transferred to
 * publisher alongside `TreasuryCap`) so we keep the option to update symbol /
 * description / icon_url later. Bootstrap can decide whether to freeze (via
 * `delete_metadata_cap`) once the final brand is locked.
 * 
 * Phase 1.1 — first module after Phase 0 publish skeleton.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::currency';
export const CURRENCY = new MoveStruct({ name: `${$moduleName}::CURRENCY`, fields: {
        dummy_field: bcs.bool()
    } });
export const CurrencyMinted = new MoveStruct({ name: `${$moduleName}::CurrencyMinted`, fields: {
        recipient: bcs.Address,
        amount: bcs.u64()
    } });
export interface MintArguments {
    treasuryCap: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
    recipient: RawTransactionArgument<string>;
}
export interface MintOptions {
    package?: string;
    arguments: MintArguments | [
        treasuryCap: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>,
        recipient: RawTransactionArgument<string>
    ];
}
/**
 * Mint `amount` (base units) of ENDLESS to `recipient`. Caller must hold the
 * `TreasuryCap<CURRENCY>` issued at publish time.
 */
export function mint(options: MintOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        'u64',
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["treasuryCap", "amount", "recipient"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'currency',
        function: 'mint',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}