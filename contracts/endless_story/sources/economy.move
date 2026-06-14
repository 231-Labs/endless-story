/// Economy — on-chain fund-custody authority for the character economy (Part D · D1).
///
/// Ports the VALIDATED economy core (`packages/economy/src/{transfer,settle,derive}.ts`,
/// 41 tests + 6 hypotheses) onto chain at CURRENCY 6-decimals. It gives every
/// `Character` a lazy-init **per-character wallet** — a `Balance<CURRENCY>` attached
/// as a plain `dynamic_field` under `CharacterWalletKey` on the Character's UID — and
/// exposes the fund-moving rails the off-chain settle drives.
///
/// **Authority = the cap, never `ctx.sender()`:**
///   - `owner_fund_character` (挹注) — OwnerCap-id-match (mirrors `dream.move`).
///   - `transfer_between_characters` (接濟) — a ControlCap that `is_valid` for the
///     FROM/debit character (id-match AND epoch == control_epoch, so revoked /
///     reassigned caps abort). The cap authorizes the funds SOURCE; crediting any
///     recipient is intended (you may gift to anyone).
///   - settle rails (Layer 2) — StorytellerCap, saga-bound to the character.
///
/// **Conservation is structural:** the module holds NO `TreasuryCap` and mints
/// NOTHING. Every rail is a checked `balance::split` immediately `balance::join`'d,
/// so total `Balance<CURRENCY>` across {saga treasury, protocol sink, all character
/// wallets} is invariant per call. No overdraft: every debit asserts
/// `character_balance >= amount` before `split`, so a wallet can never go negative.
///
/// **Dependency direction (one-way, no cycle):** economy imports DOWN on
/// character + saga + currency; those modules MUST NOT import economy. The wallet DF
/// needs `character::uid/uid_mut` (package-visible, added alongside this module —
/// mirrors `scene::uid` consumed by `chamber.move`).
///
/// **Scope (D1):** fund-custody RAILS only. The per-day vitality / age / death state
/// machine and dailyCost/salary computation stay OFF-CHAIN (decision ⑤ / §6 MVP切點);
/// the chain receives already-resolved `amount`s. Estate-on-death sweep and owner
/// revenue inflow are D2. KNOWN LIMITATION: until D2 ships the estate sweep, funds in
/// a wallet whose character later dies are unreachable (`transfer` asserts
/// `!is_dead(from)`) — see `economy_test::stranded_funds_on_dead_wallet`.
module endless_story::economy;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::event;

use endless_story::currency::CURRENCY;
use endless_story::character::{Self, Character, OwnerCap, ControlCap};
use endless_story::saga::{Self, Saga, StorytellerCap};

// ─── errors ──────────────────────────────────────────────────────────
// Plain u64 codes (matches still.move; `expected_failure(abort_code = ...)`
// binds reliably). Meanings:
//   1 ESelfTransfer        — from and to are the same character (transfer.ts 'self')
//   2 ENonPositiveAmount   — amount == 0 (transfer.ts 'nonpositive'; reused by fund)
//   3 EInsufficientBalance — wallet balance < amount (transfer.ts 'insufficient')
//   4 EFromDead            — source character is dead (transfer.ts 'from-dead')
//   5 EToDead              — recipient character is dead (transfer.ts 'to-dead')
//   6 EWrongOwnerCap       — OwnerCap does not match the target Character
//   7 EControlCapInvalid   — ControlCap not valid for FROM (wrong character or revoked epoch)
//   8 EInvalidMemo         — memo_kind >= MEMO_COUNT (catches adapter encoding bugs)
const ESelfTransfer: u64 = 1;
const ENonPositiveAmount: u64 = 2;
const EInsufficientBalance: u64 = 3;
const EFromDead: u64 = 4;
const EToDead: u64 = 5;
const EWrongOwnerCap: u64 = 6;
const EControlCapInvalid: u64 = 7;
const EInvalidMemo: u64 = 8;
// Layer 2 (settle/payroll):
//   9  ECharSagaMismatch    — character is not bound to the given saga
//   10 EConfigSagaMismatch  — PayrollAdminCap does not target the config's saga
//   11 EInvalidBps          — owner+storyteller+treasury bps != 10000
const ECharSagaMismatch: u64 = 9;
const EConfigSagaMismatch: u64 = 10;
const EInvalidBps: u64 = 11;

/// bps split denominator (== saga.move BPS_DENOMINATOR, types.ts BPS).
const BPS_DENOMINATOR: u16 = 10_000;

// ─── memo_kind (FROZEN — mirrors transfer.ts:19 / settle MEMOS order) ─

const MEMO_GIFT: u8 = 0;
const MEMO_PATRONAGE: u8 = 1;
const MEMO_LOAN: u8 = 2;
const MEMO_REPAY: u8 = 3;
const MEMO_BRIBE: u8 = 4;
const MEMO_TRIBUTE: u8 = 5;
/// One past the last valid memo_kind; transfer asserts memo_kind < MEMO_COUNT.
const MEMO_COUNT: u8 = 6;

// ─── per-character wallet (dynamic field) ────────────────────────────

/// DF key for the per-character wallet. Plain `dynamic_field` (NOT dof) because
/// `Balance<CURRENCY>` is a value type (has `store`, no `key`). Value under it =
/// `Balance<CURRENCY>`.
public struct CharacterWalletKey has copy, drop, store {}

// ─── events ──────────────────────────────────────────────────────────

public struct CharacterFunded has copy, drop {
    character_id: ID,
    funder: address,
    amount: u64,
    new_balance: u64,
}

public struct CharacterTransfer has copy, drop {
    from_id: ID,
    to_id: ID,
    amount: u64,
    /// relationship-tone metadata only (gift/patronage/loan/repay/bribe/tribute);
    /// NEVER branches value math.
    memo_kind: u8,
    from_balance: u64,
    to_balance: u64,
}

// ─── wallet helpers (private; callers are already cap-gated) ─────────

fun wallet_exists(c: &Character): bool {
    df::exists(character::uid(c), CharacterWalletKey {})
}

/// Lazy-init: create a zero wallet on first use. `df::add` aborts if the field
/// already exists, so the `exists` guard is mandatory — never blind-add. Mirrors
/// `character::ensure_skills_field` / `chamber.move`'s furnishing init.
fun ensure_wallet(c: &mut Character) {
    if (!df::exists(character::uid(c), CharacterWalletKey {})) {
        df::add<CharacterWalletKey, Balance<CURRENCY>>(
            character::uid_mut(c),
            CharacterWalletKey {},
            balance::zero<CURRENCY>(),
        );
    }
}

fun wallet_mut(c: &mut Character): &mut Balance<CURRENCY> {
    df::borrow_mut<CharacterWalletKey, Balance<CURRENCY>>(
        character::uid_mut(c),
        CharacterWalletKey {},
    )
}

// ─── views ───────────────────────────────────────────────────────────

/// A character's wallet balance in ENDLESS base units. Returns 0 for a
/// never-funded character (the DF is absent) — never aborts.
public fun character_balance(c: &Character): u64 {
    if (!wallet_exists(c)) {
        0
    } else {
        balance::value(
            df::borrow<CharacterWalletKey, Balance<CURRENCY>>(character::uid(c), CharacterWalletKey {}),
        )
    }
}

// ─── 挹注: owner funds their character (OwnerCap-gated) ───────────────

/// Deposit an existing `Coin<CURRENCY>` into a character's wallet. Gated by the
/// character's OwnerCap (epoch-less; possession + id-match is full authority).
/// Pure inflow — no saga / treasury touch; the Coin already existed (no mint).
public fun owner_fund_character(
    owner_cap: &OwnerCap,
    character: &mut Character,
    payment: Coin<CURRENCY>,
    ctx: &TxContext,
) {
    assert!(
        character::owner_cap_character_id(owner_cap) == character::character_id(character),
        EWrongOwnerCap,
    );
    let amount = coin::value(&payment);
    assert!(amount > 0, ENonPositiveAmount);

    ensure_wallet(character);
    balance::join(wallet_mut(character), coin::into_balance(payment));

    let new_balance = character_balance(character);
    event::emit(CharacterFunded {
        character_id: character::character_id(character),
        funder: ctx.sender(),
        amount,
        new_balance,
    });
}

// ─── 接濟: transfer between characters (ControlCap-gated on FROM) ─────

/// Move `amount` from `from`'s wallet to `to`'s wallet. Gated by a ControlCap
/// that `is_valid` for the FROM character. Ports `transfer.ts applyTransfer`
/// guards in EXACT order; net-0 within Σ-wallet. `memo_kind` is event metadata
/// only (relationship tone) and never affects value math.
public fun transfer_between_characters(
    control_cap: &ControlCap,
    from: &mut Character,
    to: &mut Character,
    amount: u64,
    memo_kind: u8,
) {
    // Guards — transfer.ts:64-72 order.
    assert!(character::character_id(from) != character::character_id(to), ESelfTransfer);
    assert!(amount > 0, ENonPositiveAmount);
    assert!(memo_kind < MEMO_COUNT, EInvalidMemo);
    assert!(character::is_valid(control_cap, from), EControlCapInvalid);
    assert!(!character::is_dead(from), EFromDead);
    assert!(!character::is_dead(to), EToDead);
    assert!(character_balance(from) >= amount, EInsufficientBalance);

    // Move: split into a local Balance (releases the FROM borrow) then join TO.
    // (from's wallet must exist — the balance >= amount > 0 guard above implies it;
    // only the recipient may need lazy-init.)
    ensure_wallet(to);
    let moved = balance::split(wallet_mut(from), amount);
    balance::join(wallet_mut(to), moved);

    let from_balance = character_balance(from);
    let to_balance = character_balance(to);
    event::emit(CharacterTransfer {
        from_id: character::character_id(from),
        to_id: character::character_id(to),
        amount,
        memo_kind,
        from_balance,
        to_balance,
    });
}

// ─── memo_kind views (so the SDK encoder stays aligned) ──────────────

public fun memo_gift(): u8 { MEMO_GIFT }
public fun memo_patronage(): u8 { MEMO_PATRONAGE }
public fun memo_loan(): u8 { MEMO_LOAN }
public fun memo_repay(): u8 { MEMO_REPAY }
public fun memo_bribe(): u8 { MEMO_BRIBE }
public fun memo_tribute(): u8 { MEMO_TRIBUTE }

// ═════════════════════════════════════════════════════════════════════
// LAYER 2 — settle / payroll rails (StorytellerCap-driven)
//
// These are the FUND-MOVE primitives the off-chain settle drives; the chain
// does NOT self-compute salary/dailyCost (they need off-chain memoryCount /
// imageCount / recall — §6 / decision ⑤), it receives already-resolved amounts.
// `accrue_owner_revenue` is intentionally NOT here: OwnerCap is owner-held, so a
// StorytellerCap settle PTB can never hold &mut OwnerCap — owner inflow is D2's
// estate sweep (the real Balance path). See the audit.
// ═════════════════════════════════════════════════════════════════════

// ─── protocol sink (holds collected dailyCost as a real Balance) ─────

/// Shared singleton holding the dailyCost protocolSink as a real
/// `Balance<CURRENCY>` so global conservation is physically assertable on-chain
/// (collect_daily_cost joins the debit here, never into a tracked u64).
public struct ProtocolSink has key {
    id: UID,
    treasury: Balance<CURRENCY>,
    total_collected: u64,
}

public struct ProtocolSinkCreated has copy, drop {
    sink_id: ID,
    creator_saga_id: ID,
}

/// Create + share the protocol sink (once; StorytellerCap proves operator).
public fun init_protocol_sink(cap: &StorytellerCap, saga: &Saga, ctx: &mut TxContext) {
    saga::assert_cap(cap, saga);
    let sink = ProtocolSink { id: object::new(ctx), treasury: balance::zero<CURRENCY>(), total_collected: 0 };
    event::emit(ProtocolSinkCreated { sink_id: object::id(&sink), creator_saga_id: saga::saga_id(saga) });
    transfer::share_object(sink);
}

public fun protocol_sink_balance(sink: &ProtocolSink): u64 { balance::value(&sink.treasury) }
public fun protocol_sink_total_collected(sink: &ProtocolSink): u64 { sink.total_collected }

// ─── saga payroll config (passive on-chain record for off-chain settle) ─

/// Per-saga payroll calibration. Shared object (like DreamConfig); the
/// off-chain settle READS it (bps + cost knobs), the fund rails do NOT consume
/// it. Carries its OWN bps split (decoupled from saga RevenueConfig, like
/// DreamConfig owns its price). Mutable knobs in milli / base units.
public struct SagaPayrollConfig has key {
    id: UID,
    saga_id: ID,
    sub_price: u64,
    owner_bps: u16,
    storyteller_bps: u16,
    treasury_bps: u16,
    c_run: u64,
    c_mem: u64,
    c_img: u64,
    c_seal: u64,
    active_live_milli: u64,
    active_dormant_milli: u64,
    recall_active: u64,
    recall_dormant: u64,
    slot_bonus_milli: u64,
}

/// Mint at config creation; holder can set_payroll_params (D7 SalaryPolicyPanel).
public struct PayrollAdminCap has key, store {
    id: UID,
    saga_id: ID,
}

public struct PayrollConfigCreated has copy, drop {
    config_id: ID,
    saga_id: ID,
    sub_price: u64,
}

public struct PayrollConfigUpdated has copy, drop {
    config_id: ID,
    saga_id: ID,
    sub_price: u64,
}

/// Storyteller creates the SagaPayrollConfig (one per saga, at bootstrap).
public fun create_payroll_config(
    cap: &StorytellerCap,
    saga: &Saga,
    sub_price: u64,
    owner_bps: u16,
    storyteller_bps: u16,
    treasury_bps: u16,
    c_run: u64,
    c_mem: u64,
    c_img: u64,
    c_seal: u64,
    active_live_milli: u64,
    active_dormant_milli: u64,
    recall_active: u64,
    recall_dormant: u64,
    slot_bonus_milli: u64,
    ctx: &mut TxContext,
) {
    saga::assert_cap(cap, saga);
    assert!(
        (owner_bps as u64) + (storyteller_bps as u64) + (treasury_bps as u64) == (BPS_DENOMINATOR as u64),
        EInvalidBps,
    );
    let saga_id = saga::saga_id(saga);
    let config = SagaPayrollConfig {
        id: object::new(ctx),
        saga_id,
        sub_price,
        owner_bps,
        storyteller_bps,
        treasury_bps,
        c_run,
        c_mem,
        c_img,
        c_seal,
        active_live_milli,
        active_dormant_milli,
        recall_active,
        recall_dormant,
        slot_bonus_milli,
    };
    let config_id = object::id(&config);
    let admin = PayrollAdminCap { id: object::new(ctx), saga_id };
    event::emit(PayrollConfigCreated { config_id, saga_id, sub_price });
    transfer::share_object(config);
    transfer::transfer(admin, ctx.sender());
}

/// Bulk setter (D7). PayrollAdminCap-gated, saga-bound. Re-asserts bps sum.
public fun set_payroll_params(
    admin: &PayrollAdminCap,
    config: &mut SagaPayrollConfig,
    sub_price: u64,
    owner_bps: u16,
    storyteller_bps: u16,
    treasury_bps: u16,
    c_run: u64,
    c_mem: u64,
    c_img: u64,
    c_seal: u64,
    active_live_milli: u64,
    active_dormant_milli: u64,
    recall_active: u64,
    recall_dormant: u64,
    slot_bonus_milli: u64,
) {
    assert!(admin.saga_id == config.saga_id, EConfigSagaMismatch);
    assert!(
        (owner_bps as u64) + (storyteller_bps as u64) + (treasury_bps as u64) == (BPS_DENOMINATOR as u64),
        EInvalidBps,
    );
    config.sub_price = sub_price;
    config.owner_bps = owner_bps;
    config.storyteller_bps = storyteller_bps;
    config.treasury_bps = treasury_bps;
    config.c_run = c_run;
    config.c_mem = c_mem;
    config.c_img = c_img;
    config.c_seal = c_seal;
    config.active_live_milli = active_live_milli;
    config.active_dormant_milli = active_dormant_milli;
    config.recall_active = recall_active;
    config.recall_dormant = recall_dormant;
    config.slot_bonus_milli = slot_bonus_milli;
    event::emit(PayrollConfigUpdated { config_id: object::id(config), saga_id: config.saga_id, sub_price });
}

// ─── SagaPayrollConfig views (off-chain settle reads these) ──────────

public fun payroll_saga_id(c: &SagaPayrollConfig): ID { c.saga_id }
public fun payroll_sub_price(c: &SagaPayrollConfig): u64 { c.sub_price }
public fun payroll_owner_bps(c: &SagaPayrollConfig): u16 { c.owner_bps }
public fun payroll_storyteller_bps(c: &SagaPayrollConfig): u16 { c.storyteller_bps }
public fun payroll_treasury_bps(c: &SagaPayrollConfig): u16 { c.treasury_bps }
public fun payroll_c_run(c: &SagaPayrollConfig): u64 { c.c_run }
public fun payroll_c_mem(c: &SagaPayrollConfig): u64 { c.c_mem }
public fun payroll_c_img(c: &SagaPayrollConfig): u64 { c.c_img }
public fun payroll_c_seal(c: &SagaPayrollConfig): u64 { c.c_seal }

// ─── settle fund moves (StorytellerCap-gated, saga-bound) ────────────

/// Credit `amount` of salary from the saga treasury into a character's wallet.
/// The off-chain settle computes the per-char amount (budget/perfPool split,
/// settle.ts) and passes it in; the undistributed remainder stays in the
/// treasury (carryover). Gated by StorytellerCap AND the character must belong
/// to this saga (assert_cap only binds cap→saga, NOT saga→character — without
/// this a StorytellerCap could drain the treasury into any character object).
public fun credit_salary(
    cap: &StorytellerCap,
    saga: &mut Saga,
    character: &mut Character,
    amount: u64,
) {
    saga::assert_cap(cap, saga);
    let sid = saga::saga_id(saga);
    assert!(character::saga_id(character).contains(&sid), ECharSagaMismatch);
    if (amount == 0) return;
    let drained = saga::split_treasury_for_payroll(saga, amount);
    ensure_wallet(character);
    balance::join(wallet_mut(character), drained);
    let new_balance = character_balance(character);
    event::emit(SalaryCredited {
        saga_id: sid,
        character_id: character::character_id(character),
        amount,
        new_balance,
    });
}

/// Debit `requested` dailyCost (computed off-chain) from a character's wallet
/// into the protocol sink. Pays `bmin(balance, requested)` — never overdraws —
/// and returns `insolvent` (paid < requested), matching settle.ts:114-118.
/// Vitality/death are NOT applied here (off-chain D5). StorytellerCap-gated +
/// saga-bound (same authority binding as credit_salary).
public fun collect_daily_cost(
    cap: &StorytellerCap,
    saga: &Saga,
    character: &mut Character,
    requested: u64,
    sink: &mut ProtocolSink,
): bool {
    saga::assert_cap(cap, saga);
    let sid = saga::saga_id(saga);
    assert!(character::saga_id(character).contains(&sid), ECharSagaMismatch);
    let bal = character_balance(character);
    let pay = if (bal < requested) bal else requested;
    if (pay > 0) {
        ensure_wallet(character);
        let debited = balance::split(wallet_mut(character), pay);
        balance::join(&mut sink.treasury, debited);
        sink.total_collected = sink.total_collected + pay;
    };
    let insolvent = pay < requested;
    event::emit(DailyCostCollected {
        saga_id: sid,
        character_id: character::character_id(character),
        amount: pay,
        requested,
        insolvent,
        new_balance: character_balance(character),
    });
    insolvent
}

public struct SalaryCredited has copy, drop {
    saga_id: ID,
    character_id: ID,
    amount: u64,
    new_balance: u64,
}

public struct DailyCostCollected has copy, drop {
    saga_id: ID,
    character_id: ID,
    amount: u64,
    requested: u64,
    insolvent: bool,
    new_balance: u64,
}

// ─── test support ────────────────────────────────────────────────────

/// Detach + destroy a character's wallet DF. MANDATORY before a test tears a
/// funded character down: `character::destroy_*_for_testing` calls
/// `object::delete(id)`, which ABORTS if the UID still carries a dynamic field.
#[test_only]
public fun drain_wallet_for_testing(c: &mut Character) {
    if (df::exists(character::uid(c), CharacterWalletKey {})) {
        let bal = df::remove<CharacterWalletKey, Balance<CURRENCY>>(
            character::uid_mut(c),
            CharacterWalletKey {},
        );
        balance::destroy_for_testing(bal);
    }
}

#[test_only]
public fun new_protocol_sink_for_testing(ctx: &mut TxContext): ProtocolSink {
    ProtocolSink { id: object::new(ctx), treasury: balance::zero<CURRENCY>(), total_collected: 0 }
}

#[test_only]
public fun destroy_protocol_sink_for_testing(sink: ProtocolSink) {
    let ProtocolSink { id, treasury, total_collected: _ } = sink;
    balance::destroy_for_testing(treasury);
    object::delete(id);
}

#[test_only]
public fun new_payroll_config_for_testing(saga_id: ID, ctx: &mut TxContext): SagaPayrollConfig {
    SagaPayrollConfig {
        id: object::new(ctx),
        saga_id,
        sub_price: 3_000_000,
        owner_bps: 2_000,
        storyteller_bps: 3_000,
        treasury_bps: 5_000,
        c_run: 6_000_000,
        c_mem: 20_000,
        c_img: 100_000,
        c_seal: 250_000,
        active_live_milli: 1_000,
        active_dormant_milli: 300,
        recall_active: 4,
        recall_dormant: 1,
        slot_bonus_milli: 1_500,
    }
}

#[test_only]
public fun destroy_payroll_config_for_testing(config: SagaPayrollConfig) {
    let SagaPayrollConfig { id, .. } = config;
    object::delete(id);
}
