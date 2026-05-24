/// Public ENDLESS faucet — anyone can drip; admin tunes the spigot.
///
/// **Shape:**
///   - `Faucet` is a shared object holding the `TreasuryCap<CURRENCY>`.
///   - `FaucetAdminCap` is a separate, transferrable cap (transfer to runner
///     after bootstrap so devnet operator can hot-tune limits).
///
/// **Knobs (all admin-only):**
///   - `drip_amount`      — base units minted per `drip` call (decimals=6).
///   - `cooldown_ms`      — minimum wall-clock ms between drips per address.
///   - `total_supply_cap` — hard ceiling on cumulative drips (0 = unlimited).
///   - `paused`           — emergency stop; `drip` aborts when true.
///
/// **Admin backdoor:** `admin_mint` mints outside the cooldown/cap rules —
/// useful for seed distributions, refunds, or whitelisted large transfers.
///
/// **Init:** `create_faucet` consumes the publisher-held `TreasuryCap`
/// (issued at currency publish) and wraps it inside the shared Faucet. From
/// that point the cap is unreachable except via `admin_mint` calls — no
/// extraction function by design (less surface area for foot-guns).
///
/// **Rate limit:** per-address `last_drip_ms` lives in a `Table`. Grows
/// unbounded; acceptable for devnet/testnet, prune later if needed.
module endless_story::faucet;

use endless_story::currency::CURRENCY;
use sui::clock;
use sui::coin::{Self, TreasuryCap};
use sui::event;
use sui::table::{Self, Table};

// ─── errors ──────────────────────────────────────────────────────────

const ENotAdmin: u64 = 1;
const EOnCooldown: u64 = 2;
const ESupplyExhausted: u64 = 3;
const EFaucetPaused: u64 = 4;
const EInvalidConfig: u64 = 5;

// ─── caps ────────────────────────────────────────────────────────────

public struct FaucetAdminCap has key, store {
    id: UID,
    faucet_id: ID,
}

// ─── faucet ──────────────────────────────────────────────────────────

public struct Faucet has key {
    id: UID,
    treasury_cap: TreasuryCap<CURRENCY>,
    drip_amount: u64,
    cooldown_ms: u64,
    /// 0 = unlimited.
    total_supply_cap: u64,
    /// Cumulative base units minted across all drip + admin_mint calls.
    total_minted: u64,
    paused: bool,
    /// address → last drip timestamp_ms (only updated by `drip`, not `admin_mint`).
    last_drip_by: Table<address, u64>,
    created_at_ms: u64,
}

// ─── events ──────────────────────────────────────────────────────────

public struct FaucetCreated has copy, drop {
    faucet_id: ID,
    admin_cap_id: ID,
    drip_amount: u64,
    cooldown_ms: u64,
    total_supply_cap: u64,
    created_at_ms: u64,
}

public struct Dripped has copy, drop {
    faucet_id: ID,
    recipient: address,
    amount: u64,
    total_minted: u64,
    dripped_at_ms: u64,
}

public struct AdminMinted has copy, drop {
    faucet_id: ID,
    recipient: address,
    amount: u64,
    total_minted: u64,
    minted_at_ms: u64,
}

public struct ConfigUpdated has copy, drop {
    faucet_id: ID,
    drip_amount: u64,
    cooldown_ms: u64,
    total_supply_cap: u64,
    paused: bool,
    updated_at_ms: u64,
}

// ─── defaults ────────────────────────────────────────────────────────

/// 10 ENDLESS per drip (decimals = 6 → 10_000_000 base units).
const DEFAULT_DRIP_AMOUNT: u64 = 10_000_000;
/// 24 hours between drips per address.
const DEFAULT_COOLDOWN_MS: u64 = 24 * 60 * 60 * 1000;
/// 0 = unlimited initially; admin can lock it later.
const DEFAULT_SUPPLY_CAP: u64 = 0;

// ─── init ────────────────────────────────────────────────────────────

/// Wrap a `TreasuryCap<CURRENCY>` (issued at currency publish) inside a new
/// shared Faucet. Returns the `FaucetAdminCap` to the caller.
///
/// Typical bootstrap PTB:
///   1. publish endless_story package         (currency::init → TreasuryCap to sender)
///   2. call faucet::create_faucet(treasury_cap, ..., clock)  → admin cap
///   3. transfer admin cap to runner address
public fun create_faucet(
    treasury_cap: TreasuryCap<CURRENCY>,
    drip_amount: u64,
    cooldown_ms: u64,
    total_supply_cap: u64,
    clock: &clock::Clock,
    ctx: &mut TxContext,
): FaucetAdminCap {
    assert!(drip_amount > 0, EInvalidConfig);

    let created_at_ms = clock::timestamp_ms(clock);
    let faucet = Faucet {
        id: object::new(ctx),
        treasury_cap,
        drip_amount,
        cooldown_ms,
        total_supply_cap,
        total_minted: 0,
        paused: false,
        last_drip_by: table::new<address, u64>(ctx),
        created_at_ms,
    };
    let faucet_id = object::id(&faucet);
    let admin_cap = FaucetAdminCap { id: object::new(ctx), faucet_id };

    event::emit(FaucetCreated {
        faucet_id,
        admin_cap_id: object::id(&admin_cap),
        drip_amount,
        cooldown_ms,
        total_supply_cap,
        created_at_ms,
    });

    transfer::share_object(faucet);
    admin_cap
}

/// Same as `create_faucet` but uses sensible defaults
/// (10 ENDLESS / 24h cooldown / unlimited supply).
public fun create_faucet_with_defaults(
    treasury_cap: TreasuryCap<CURRENCY>,
    clock: &clock::Clock,
    ctx: &mut TxContext,
): FaucetAdminCap {
    create_faucet(
        treasury_cap,
        DEFAULT_DRIP_AMOUNT,
        DEFAULT_COOLDOWN_MS,
        DEFAULT_SUPPLY_CAP,
        clock,
        ctx,
    )
}

// ─── drip ────────────────────────────────────────────────────────────

/// Public drip — any address can call. Mints `drip_amount` to `ctx.sender()`
/// if (a) faucet not paused, (b) cooldown elapsed for this sender, (c) supply
/// cap not exhausted.
///
/// The self-transfer lint is intentionally suppressed: a faucet's UX *is*
/// "call once, receive tokens". For composable mint flows use `admin_mint`
/// which lets the caller pick the recipient.
#[allow(lint(self_transfer))]
public fun drip(faucet: &mut Faucet, clock: &clock::Clock, ctx: &mut TxContext) {
    assert!(!faucet.paused, EFaucetPaused);

    let recipient = ctx.sender();
    let now_ms = clock::timestamp_ms(clock);

    // Cooldown check.
    if (table::contains(&faucet.last_drip_by, recipient)) {
        let last_ms = *table::borrow(&faucet.last_drip_by, recipient);
        assert!(now_ms >= last_ms + faucet.cooldown_ms, EOnCooldown);
    };

    // Supply check (0 = unlimited).
    let new_total = faucet.total_minted + faucet.drip_amount;
    if (faucet.total_supply_cap > 0) {
        assert!(new_total <= faucet.total_supply_cap, ESupplyExhausted);
    };

    // Mint and update bookkeeping.
    let coin = coin::mint(&mut faucet.treasury_cap, faucet.drip_amount, ctx);
    transfer::public_transfer(coin, recipient);
    faucet.total_minted = new_total;

    if (table::contains(&faucet.last_drip_by, recipient)) {
        let entry = table::borrow_mut(&mut faucet.last_drip_by, recipient);
        *entry = now_ms;
    } else {
        table::add(&mut faucet.last_drip_by, recipient, now_ms);
    };

    event::emit(Dripped {
        faucet_id: object::id(faucet),
        recipient,
        amount: faucet.drip_amount,
        total_minted: faucet.total_minted,
        dripped_at_ms: now_ms,
    });
}

// ─── admin mint (no cooldown, still bound by supply cap) ─────────────

/// Admin can mint any amount to any address. Bypasses cooldown, but still
/// respects `total_supply_cap` (so the cap is a true ceiling on supply, not
/// just on the public drip path).
public fun admin_mint(
    admin: &FaucetAdminCap,
    faucet: &mut Faucet,
    amount: u64,
    recipient: address,
    clock: &clock::Clock,
    ctx: &mut TxContext,
) {
    assert!(admin.faucet_id == object::id(faucet), ENotAdmin);
    assert!(amount > 0, EInvalidConfig);

    let new_total = faucet.total_minted + amount;
    if (faucet.total_supply_cap > 0) {
        assert!(new_total <= faucet.total_supply_cap, ESupplyExhausted);
    };

    let coin = coin::mint(&mut faucet.treasury_cap, amount, ctx);
    transfer::public_transfer(coin, recipient);
    faucet.total_minted = new_total;

    event::emit(AdminMinted {
        faucet_id: object::id(faucet),
        recipient,
        amount,
        total_minted: faucet.total_minted,
        minted_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── admin config ────────────────────────────────────────────────────

/// Update any subset of knobs in a single call. `total_supply_cap` of 0
/// means "unlimited"; setting it below `total_minted` is invalid.
public fun set_config(
    admin: &FaucetAdminCap,
    faucet: &mut Faucet,
    drip_amount: u64,
    cooldown_ms: u64,
    total_supply_cap: u64,
    paused: bool,
    clock: &clock::Clock,
) {
    assert!(admin.faucet_id == object::id(faucet), ENotAdmin);
    assert!(drip_amount > 0, EInvalidConfig);
    if (total_supply_cap > 0) {
        assert!(total_supply_cap >= faucet.total_minted, EInvalidConfig);
    };

    faucet.drip_amount = drip_amount;
    faucet.cooldown_ms = cooldown_ms;
    faucet.total_supply_cap = total_supply_cap;
    faucet.paused = paused;

    event::emit(ConfigUpdated {
        faucet_id: object::id(faucet),
        drip_amount,
        cooldown_ms,
        total_supply_cap,
        paused,
        updated_at_ms: clock::timestamp_ms(clock),
    });
}

/// Emergency pause/unpause — minimal cap for hot-fixes.
public fun set_paused(
    admin: &FaucetAdminCap,
    faucet: &mut Faucet,
    paused: bool,
    clock: &clock::Clock,
) {
    assert!(admin.faucet_id == object::id(faucet), ENotAdmin);
    faucet.paused = paused;
    event::emit(ConfigUpdated {
        faucet_id: object::id(faucet),
        drip_amount: faucet.drip_amount,
        cooldown_ms: faucet.cooldown_ms,
        total_supply_cap: faucet.total_supply_cap,
        paused,
        updated_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── views ───────────────────────────────────────────────────────────

public fun faucet_id(faucet: &Faucet): ID { object::id(faucet) }

public fun admin_faucet_id(admin: &FaucetAdminCap): ID { admin.faucet_id }

public fun drip_amount(faucet: &Faucet): u64 { faucet.drip_amount }

public fun cooldown_ms(faucet: &Faucet): u64 { faucet.cooldown_ms }

public fun total_supply_cap(faucet: &Faucet): u64 { faucet.total_supply_cap }

public fun total_minted(faucet: &Faucet): u64 { faucet.total_minted }

public fun is_paused(faucet: &Faucet): bool { faucet.paused }

/// 0 = unlimited (no cap set).
public fun remaining_supply(faucet: &Faucet): u64 {
    if (faucet.total_supply_cap == 0) return 0;
    faucet.total_supply_cap - faucet.total_minted
}

/// Returns the wall-clock ms at which `who` may next call `drip`.
/// 0 if never dripped (i.e. eligible immediately).
public fun next_drip_at_ms(faucet: &Faucet, who: address): u64 {
    if (!table::contains(&faucet.last_drip_by, who)) return 0;
    *table::borrow(&faucet.last_drip_by, who) + faucet.cooldown_ms
}

// ─── tests ───────────────────────────────────────────────────────────

#[test_only]
use endless_story::currency;
#[test_only]
use std::unit_test::{assert_eq, destroy};

/// Build a Faucet without sharing it (so tests can pass `&mut faucet`
/// directly). Mirrors the publish + create_faucet flow but stays in test
/// land — no `share_object`, no events.
#[test_only]
fun mint_faucet_for_testing(
    drip_amount: u64,
    cooldown_ms: u64,
    total_supply_cap: u64,
    ctx: &mut TxContext,
): (Faucet, FaucetAdminCap) {
    let treasury_cap = currency::new_treasury_for_testing(ctx);
    let faucet = Faucet {
        id: object::new(ctx),
        treasury_cap,
        drip_amount,
        cooldown_ms,
        total_supply_cap,
        total_minted: 0,
        paused: false,
        last_drip_by: table::new<address, u64>(ctx),
        created_at_ms: 0,
    };
    let admin_cap = FaucetAdminCap {
        id: object::new(ctx),
        faucet_id: object::id(&faucet),
    };
    (faucet, admin_cap)
}

#[test]
fun drip_mints_and_records_timestamp() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut faucet, admin_cap) = mint_faucet_for_testing(1_000, 60_000, 0, &mut ctx);

    drip(&mut faucet, &clock, &mut ctx);

    assert_eq!(total_minted(&faucet), 1_000);
    // Sender (dummy ctx) is in the table now.
    assert!(table::contains(&faucet.last_drip_by, ctx.sender()));

    destroy(faucet);
    destroy(admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = EOnCooldown)]
fun drip_aborts_when_called_again_before_cooldown() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut faucet, admin_cap) = mint_faucet_for_testing(1_000, 60_000, 0, &mut ctx);

    drip(&mut faucet, &clock, &mut ctx);
    // Second drip immediately → still on cooldown (clock not advanced).
    drip(&mut faucet, &clock, &mut ctx);

    destroy(faucet);
    destroy(admin_cap);
    clock.destroy_for_testing();
}

#[test]
fun drip_after_cooldown_succeeds() {
    let mut ctx = tx_context::dummy();
    let mut clock = sui::clock::create_for_testing(&mut ctx);
    let (mut faucet, admin_cap) = mint_faucet_for_testing(1_000, 1_000, 0, &mut ctx);

    drip(&mut faucet, &clock, &mut ctx);
    sui::clock::increment_for_testing(&mut clock, 1_001);
    drip(&mut faucet, &clock, &mut ctx);

    assert_eq!(total_minted(&faucet), 2_000);

    destroy(faucet);
    destroy(admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = ESupplyExhausted)]
fun drip_aborts_when_supply_cap_reached() {
    let mut ctx = tx_context::dummy();
    let mut clock = sui::clock::create_for_testing(&mut ctx);
    // cap = 1500, drip = 1000. Second drip would push total to 2000 → abort.
    let (mut faucet, admin_cap) = mint_faucet_for_testing(1_000, 100, 1_500, &mut ctx);

    drip(&mut faucet, &clock, &mut ctx);
    sui::clock::increment_for_testing(&mut clock, 200);
    drip(&mut faucet, &clock, &mut ctx); // ← abort here

    destroy(faucet);
    destroy(admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = EFaucetPaused)]
fun drip_aborts_when_paused() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut faucet, admin_cap) = mint_faucet_for_testing(100, 1_000, 0, &mut ctx);

    set_paused(&admin_cap, &mut faucet, true, &clock);
    drip(&mut faucet, &clock, &mut ctx); // ← abort here

    destroy(faucet);
    destroy(admin_cap);
    clock.destroy_for_testing();
}

#[test]
fun admin_mint_bypasses_cooldown_and_respects_cap() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut faucet, admin_cap) = mint_faucet_for_testing(100, 1_000_000, 5_000, &mut ctx);

    // Three admin mints back-to-back without cooldown.
    admin_mint(&admin_cap, &mut faucet, 1_000, @0xA, &clock, &mut ctx);
    admin_mint(&admin_cap, &mut faucet, 2_000, @0xB, &clock, &mut ctx);
    assert_eq!(total_minted(&faucet), 3_000);
    assert_eq!(remaining_supply(&faucet), 2_000);

    destroy(faucet);
    destroy(admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = ESupplyExhausted)]
fun admin_mint_aborts_when_cap_exceeded() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut faucet, admin_cap) = mint_faucet_for_testing(100, 1_000, 1_000, &mut ctx);

    admin_mint(&admin_cap, &mut faucet, 1_001, @0xA, &clock, &mut ctx); // ← abort

    destroy(faucet);
    destroy(admin_cap);
    clock.destroy_for_testing();
}

#[test]
fun set_config_updates_knobs() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut faucet, admin_cap) = mint_faucet_for_testing(100, 1_000, 0, &mut ctx);

    set_config(&admin_cap, &mut faucet, 500, 5_000, 1_000_000, true, &clock);

    assert_eq!(drip_amount(&faucet), 500);
    assert_eq!(cooldown_ms(&faucet), 5_000);
    assert_eq!(total_supply_cap(&faucet), 1_000_000);
    assert!(is_paused(&faucet));

    destroy(faucet);
    destroy(admin_cap);
    clock.destroy_for_testing();
}

#[test]
fun next_drip_at_ms_returns_zero_for_unknown_address() {
    let mut ctx = tx_context::dummy();
    let (faucet, admin_cap) = mint_faucet_for_testing(100, 1_000, 0, &mut ctx);

    assert_eq!(next_drip_at_ms(&faucet, @0xDEADBEEF), 0);

    destroy(faucet);
    destroy(admin_cap);
}
