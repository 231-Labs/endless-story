/// Native protocol coin for Endless Story.
///
/// `ENDLESS` is the unit used by saga fees, recruitment vouchers, event
/// resolution flows, and revenue splits. One-time witness pattern: the
/// `CURRENCY` struct is consumed by `init` and never re-instantiated, so
/// supply is bounded by the single `TreasuryCap<CURRENCY>` issued at
/// publish time.
///
/// **Decimals:** 6 (1 ENDLESS = 1_000_000 base units).
///
/// **TreasuryCap owner:** at publish time the cap is transferred to the
/// publisher (the address running `sui client publish`). Bootstrap is
/// expected to transfer it onward to the runner address — see
/// `@endless-story/cli`.
///
/// **Metadata:** registered via `coin_registry::new_currency_with_otw`
/// (Sui framework 1.45+). The `MetadataCap<CURRENCY>` is **retained**
/// (transferred to publisher alongside `TreasuryCap`) so we keep the
/// option to update symbol / description / icon_url later. Bootstrap
/// can decide whether to freeze (via `delete_metadata_cap`) once the
/// final brand is locked.
///
/// Phase 1.1 — first module after Phase 0 publish skeleton.
module endless_story::currency;

use sui::coin::{Self, TreasuryCap};
use sui::coin_registry;
use sui::event;

// ─── one-time witness ────────────────────────────────────────────────

public struct CURRENCY has drop {}

// ─── events ──────────────────────────────────────────────────────────

public struct CurrencyMinted has copy, drop {
    recipient: address,
    amount: u64,
}

// ─── init ────────────────────────────────────────────────────────────

fun init(witness: CURRENCY, ctx: &mut TxContext) {
    let (initializer, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        6,
        b"ENDLESS".to_string(),
        b"EndlessCoin".to_string(),
        b"Protocol coin for Endless Story saga fees, commitments, events, and revenue splits.".to_string(),
        b"".to_string(), // icon_url — populate later if/when we host one.
        ctx,
    );

    // Retain MetadataCap so metadata can be updated later (icon_url etc.).
    // Bootstrap may transfer both caps onward to the runner address.
    let metadata_cap = coin_registry::finalize(initializer, ctx);

    transfer::public_transfer(treasury_cap, ctx.sender());
    transfer::public_transfer(metadata_cap, ctx.sender());
}

// ─── mint ────────────────────────────────────────────────────────────

/// Mint `amount` (base units) of ENDLESS to `recipient`. Caller must hold
/// the `TreasuryCap<CURRENCY>` issued at publish time.
public fun mint(
    treasury_cap: &mut TreasuryCap<CURRENCY>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    let coin = coin::mint(treasury_cap, amount, ctx);
    transfer::public_transfer(coin, recipient);
    event::emit(CurrencyMinted { recipient, amount });
}
