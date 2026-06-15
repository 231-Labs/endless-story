/// economy.move tests — Layer 1 (fund-custody core). Proves: lazy-init wallet,
/// OwnerCap-gated 挹注, ControlCap-gated 接濟 with every transfer.ts guard, net-0
/// conservation, and the known dead-wallet stranded-funds limitation (until D2).
#[test_only]
module endless_story::economy_test;

use std::unit_test::assert_eq;
use sui::coin::{Self, TreasuryCap};
use std::unit_test::destroy;
use endless_story::currency::{Self, CURRENCY};
use endless_story::character::{Self, Character, OwnerCap};
use endless_story::world::{Self, World, AdminCap};
use endless_story::saga::{Self, Saga, StorytellerCap};
use endless_story::economy;

const MUNIT: u64 = 1_000_000;

// ─── helpers ─────────────────────────────────────────────────────────

#[test_only]
fun fund(
    ch: &mut Character,
    cap: &OwnerCap,
    amount: u64,
    tcap: &mut TreasuryCap<CURRENCY>,
    ctx: &mut TxContext,
) {
    let c = coin::mint(tcap, amount, ctx);
    economy::owner_fund_character(cap, ch, c, ctx);
}

#[test_only]
fun mark_dead(ch: &mut Character) {
    let id = character::character_id(ch);
    let rec = character::new_death_record(id, 1000, option::none<ID>(), vector[]);
    character::mark_dead(ch, rec);
}

#[test_only]
fun teardown(ch: Character, cap: OwnerCap) {
    let mut ch = ch;
    economy::drain_wallet_for_testing(&mut ch);
    character::destroy_wild_for_testing(ch, cap);
}

// ── Layer 2 fixture ──────────────────────────────────────────────────

#[test_only]
fun saga_fixture(
    ctx: &mut TxContext,
    clock: &sui::clock::Clock,
): (World, AdminCap, Saga, StorytellerCap) {
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        1000,
        ctx,
    );
    let (saga, cap) = saga::new_saga_for_testing(
        &mut world,
        saga::kind_standard(),
        b"S".to_string(),
        b"s".to_string(),
        b"u".to_string(),
        4000,
        5000,
        1000,
        vector[],
        @0xA,
        1001,
        clock,
        ctx,
    );
    (world, admin_cap, saga, cap)
}

/// Mint a character already bound to `saga` (the saga-bound path settle drives).
#[test_only]
fun bound_char(saga: &Saga, ctx: &mut TxContext): (Character, OwnerCap) {
    let (mut ch, cap) = character::mint_character_for_testing(ctx);
    character::bind_saga_for_testing(&mut ch, saga::saga_id(saga));
    (ch, cap)
}

/// Drain a Coin into the saga treasury (package-visible deposit).
#[test_only]
fun deposit(saga: &mut Saga, amount: u64, tcap: &mut TreasuryCap<CURRENCY>, ctx: &mut TxContext) {
    let c = coin::mint(tcap, amount, ctx);
    saga::deposit_to_treasury(saga, c);
}

// ─── SagaPayrollConfig ───────────────────────────────────────────────

#[test]
fun payroll_config_view_getters() {
    let mut ctx = sui::tx_context::dummy();
    let fake = sui::object::id_from_address(@0xBEEF);
    let cfg = economy::new_payroll_config_for_testing(fake, &mut ctx);
    assert_eq!(economy::payroll_sub_price(&cfg), 3_000_000);
    assert_eq!(economy::payroll_owner_bps(&cfg), 2_000);
    assert_eq!(economy::payroll_storyteller_bps(&cfg), 3_000);
    assert_eq!(economy::payroll_treasury_bps(&cfg), 5_000);
    assert_eq!(economy::payroll_c_img(&cfg), 100_000); // CODE includes img in dailyCost
    economy::destroy_payroll_config_for_testing(cfg);
}

#[test, expected_failure(abort_code = economy::EInvalidBps)]
fun create_payroll_config_bad_bps_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, saga, cap) = saga_fixture(&mut ctx, &clock);

    // 2000+3000+4000 = 9000 != 10000 → abort
    economy::create_payroll_config(
        &cap, &saga, 3_000_000, 2_000, 3_000, 4_000,
        6_000_000, 20_000, 100_000, 250_000, 1_000, 300, 4, 1, 1_500, &mut ctx,
    );

    saga::destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

// ─── credit_salary (treasury → wallet) ───────────────────────────────

#[test]
fun credit_salary_happy_and_conservation() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, mut saga, cap) = saga_fixture(&mut ctx, &clock);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);
    let (mut ch, ocap) = bound_char(&saga, &mut ctx);

    deposit(&mut saga, 100 * MUNIT, &mut tcap, &mut ctx);
    economy::credit_salary(&cap, &mut saga, &mut ch, 12 * MUNIT);

    assert_eq!(economy::character_balance(&ch), 12 * MUNIT);
    assert_eq!(saga::treasury_balance(&saga), 88 * MUNIT); // carryover stays in treasury
    // conservation: treasury + wallet == injected
    assert_eq!(saga::treasury_balance(&saga) + economy::character_balance(&ch), 100 * MUNIT);

    teardown(ch, ocap);
    destroy(tcap);
    saga::destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = saga::EInsufficientTreasury)]
fun credit_salary_insufficient_treasury_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, mut saga, cap) = saga_fixture(&mut ctx, &clock);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);
    let (mut ch, ocap) = bound_char(&saga, &mut ctx);

    deposit(&mut saga, 5 * MUNIT, &mut tcap, &mut ctx);
    economy::credit_salary(&cap, &mut saga, &mut ch, 12 * MUNIT); // > treasury → abort

    teardown(ch, ocap);
    destroy(tcap);
    saga::destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = economy::ECharSagaMismatch)]
fun credit_salary_wrong_character_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, mut saga, cap) = saga_fixture(&mut ctx, &clock);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);
    // character NOT bound to this saga (wild) → ECharSagaMismatch
    let (mut wild, ocap) = character::mint_character_for_testing(&mut ctx);

    deposit(&mut saga, 100 * MUNIT, &mut tcap, &mut ctx);
    economy::credit_salary(&cap, &mut saga, &mut wild, 12 * MUNIT);

    teardown(wild, ocap);
    destroy(tcap);
    saga::destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

// ─── collect_daily_cost (wallet → protocol sink) ─────────────────────

#[test]
fun collect_daily_cost_solvent_then_insolvent() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, saga, cap) = saga_fixture(&mut ctx, &clock);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);
    let (mut ch, ocap) = bound_char(&saga, &mut ctx);
    let mut sink = economy::new_protocol_sink_for_testing(&mut ctx);

    fund(&mut ch, &ocap, 100 * MUNIT, &mut tcap, &mut ctx);

    // solvent: pays full 8, returns false
    let insolvent1 = economy::collect_daily_cost(&cap, &saga, &mut ch, 8 * MUNIT, &mut sink);
    assert_eq!(insolvent1, false);
    assert_eq!(economy::character_balance(&ch), 92 * MUNIT);
    assert_eq!(economy::protocol_sink_total_collected(&sink), 8 * MUNIT);

    // drain to 3 then request 8: insolvent, pays only 3, returns true
    let ccap = character::issue_control_cap(&ch, &ocap, &mut ctx);
    let (mut other, ocap2) = bound_char(&saga, &mut ctx);
    economy::transfer_between_characters(&ccap, &mut ch, &mut other, 89 * MUNIT, economy::memo_gift());
    assert_eq!(economy::character_balance(&ch), 3 * MUNIT);
    let insolvent2 = economy::collect_daily_cost(&cap, &saga, &mut ch, 8 * MUNIT, &mut sink);
    assert_eq!(insolvent2, true);
    assert_eq!(economy::character_balance(&ch), 0);
    assert_eq!(economy::protocol_sink_total_collected(&sink), 11 * MUNIT); // 8 + 3

    destroy(ccap);
    economy::destroy_protocol_sink_for_testing(sink);
    teardown(ch, ocap);
    teardown(other, ocap2);
    destroy(tcap);
    saga::destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = economy::ECharSagaMismatch)]
fun collect_daily_cost_wrong_character_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, saga, cap) = saga_fixture(&mut ctx, &clock);
    let (mut wild, ocap) = character::mint_character_for_testing(&mut ctx); // not in saga
    let mut sink = economy::new_protocol_sink_for_testing(&mut ctx);

    economy::collect_daily_cost(&cap, &saga, &mut wild, 8 * MUNIT, &mut sink);

    economy::destroy_protocol_sink_for_testing(sink);
    teardown(wild, ocap);
    saga::destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

// ─── end-to-end conservation across all rails ────────────────────────

#[test]
fun e2e_conservation_mint_fund_settle_transfer() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, mut saga, cap) = saga_fixture(&mut ctx, &clock);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);
    let (mut a, acap) = bound_char(&saga, &mut ctx);
    let (mut b, bcap) = bound_char(&saga, &mut ctx);
    let mut sink = economy::new_protocol_sink_for_testing(&mut ctx);

    // injected = treasury deposit (T0) + owner fund of A (F)
    let t0 = 80 * MUNIT;
    let f = 40 * MUNIT;
    deposit(&mut saga, t0, &mut tcap, &mut ctx);
    fund(&mut a, &acap, f, &mut tcap, &mut ctx);

    // salary to both from treasury
    economy::credit_salary(&cap, &mut saga, &mut a, 10 * MUNIT);
    economy::credit_salary(&cap, &mut saga, &mut b, 6 * MUNIT);
    // daily cost from both into sink
    economy::collect_daily_cost(&cap, &saga, &mut a, 4 * MUNIT, &mut sink);
    economy::collect_daily_cost(&cap, &saga, &mut b, 2 * MUNIT, &mut sink);
    // A gifts B
    let ccap = character::issue_control_cap(&a, &acap, &mut ctx);
    economy::transfer_between_characters(&ccap, &mut a, &mut b, 5 * MUNIT, economy::memo_patronage());

    // CONSERVATION: injected == treasury + sink + Σwallet
    let total = saga::treasury_balance(&saga)
        + economy::protocol_sink_total_collected(&sink)
        + economy::character_balance(&a)
        + economy::character_balance(&b);
    assert_eq!(total, t0 + f);

    destroy(ccap);
    economy::destroy_protocol_sink_for_testing(sink);
    teardown(a, acap);
    teardown(b, bcap);
    destroy(tcap);
    saga::destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

// ─── 挹注: owner_fund_character ──────────────────────────────────────

#[test]
fun owner_fund_character_happy() {
    let mut ctx = sui::tx_context::dummy();
    let (mut ch, cap) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    fund(&mut ch, &cap, 100 * MUNIT, &mut tcap, &mut ctx);
    assert_eq!(economy::character_balance(&ch), 100 * MUNIT);

    teardown(ch, cap);
    destroy(tcap);
}

#[test]
fun character_balance_zero_when_unfunded() {
    let mut ctx = sui::tx_context::dummy();
    let (ch, cap) = character::mint_character_for_testing(&mut ctx);
    assert_eq!(economy::character_balance(&ch), 0); // df absent → 0, never aborts
    character::destroy_wild_for_testing(ch, cap);
}

#[test]
fun owner_fund_twice_accumulates() {
    let mut ctx = sui::tx_context::dummy();
    let (mut ch, cap) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    fund(&mut ch, &cap, 30 * MUNIT, &mut tcap, &mut ctx);
    fund(&mut ch, &cap, 20 * MUNIT, &mut tcap, &mut ctx); // ensure_wallet idempotent
    assert_eq!(economy::character_balance(&ch), 50 * MUNIT);

    teardown(ch, cap);
    destroy(tcap);
}

#[test, expected_failure(abort_code = economy::EWrongOwnerCap)]
fun owner_fund_wrong_cap_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (mut cha, capa) = character::mint_character_for_testing(&mut ctx);
    let (chb, capb) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    let c = coin::mint(&mut tcap, MUNIT, &mut ctx);
    economy::owner_fund_character(&capb, &mut cha, c, &ctx); // capb ≠ cha's owner → abort

    teardown(cha, capa);
    character::destroy_wild_for_testing(chb, capb);
    destroy(tcap);
}

#[test, expected_failure(abort_code = economy::ENonPositiveAmount)]
fun owner_fund_zero_amount_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (mut ch, cap) = character::mint_character_for_testing(&mut ctx);
    let c = coin::zero<CURRENCY>(&mut ctx);
    economy::owner_fund_character(&cap, &mut ch, c, &ctx); // amount 0 → abort

    teardown(ch, cap);
}

// ─── 接濟: transfer_between_characters ───────────────────────────────

#[test]
fun transfer_happy_and_conservation() {
    let mut ctx = sui::tx_context::dummy();
    let (mut cha, capa) = character::mint_character_for_testing(&mut ctx);
    let (mut chb, capb) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    fund(&mut cha, &capa, 100 * MUNIT, &mut tcap, &mut ctx);
    let ccap = character::issue_control_cap(&cha, &capa, &mut ctx);

    // chb starts with no wallet (DF absent) → ensure_wallet(to) exercised.
    assert_eq!(economy::character_balance(&chb), 0);
    economy::transfer_between_characters(&ccap, &mut cha, &mut chb, 30 * MUNIT, economy::memo_gift());

    assert_eq!(economy::character_balance(&cha), 70 * MUNIT);
    assert_eq!(economy::character_balance(&chb), 30 * MUNIT);
    // net-0: nothing created or destroyed
    assert_eq!(economy::character_balance(&cha) + economy::character_balance(&chb), 100 * MUNIT);

    destroy(ccap);
    teardown(cha, capa);
    teardown(chb, capb);
    destroy(tcap);
}

#[test, expected_failure(abort_code = economy::EInsufficientBalance)]
fun transfer_overdraft_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (mut cha, capa) = character::mint_character_for_testing(&mut ctx);
    let (mut chb, capb) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    fund(&mut cha, &capa, 10 * MUNIT, &mut tcap, &mut ctx);
    let ccap = character::issue_control_cap(&cha, &capa, &mut ctx);
    economy::transfer_between_characters(&ccap, &mut cha, &mut chb, 50 * MUNIT, economy::memo_gift());

    destroy(ccap);
    teardown(cha, capa);
    teardown(chb, capb);
    destroy(tcap);
}

#[test, expected_failure(abort_code = economy::ENonPositiveAmount)]
fun transfer_zero_amount_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (mut cha, capa) = character::mint_character_for_testing(&mut ctx);
    let (mut chb, capb) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    fund(&mut cha, &capa, 10 * MUNIT, &mut tcap, &mut ctx);
    let ccap = character::issue_control_cap(&cha, &capa, &mut ctx);
    economy::transfer_between_characters(&ccap, &mut cha, &mut chb, 0, economy::memo_gift());

    destroy(ccap);
    teardown(cha, capa);
    teardown(chb, capb);
    destroy(tcap);
}

#[test, expected_failure(abort_code = economy::EInvalidMemo)]
fun transfer_bad_memo_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (mut cha, capa) = character::mint_character_for_testing(&mut ctx);
    let (mut chb, capb) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    fund(&mut cha, &capa, 10 * MUNIT, &mut tcap, &mut ctx);
    let ccap = character::issue_control_cap(&cha, &capa, &mut ctx);
    economy::transfer_between_characters(&ccap, &mut cha, &mut chb, MUNIT, 9); // memo 9 >= 6

    destroy(ccap);
    teardown(cha, capa);
    teardown(chb, capb);
    destroy(tcap);
}

#[test, expected_failure(abort_code = economy::EControlCapInvalid)]
fun transfer_revoked_controlcap_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (mut cha, capa) = character::mint_character_for_testing(&mut ctx);
    let (mut chb, capb) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    fund(&mut cha, &capa, 10 * MUNIT, &mut tcap, &mut ctx);
    let ccap = character::issue_control_cap(&cha, &capa, &mut ctx);
    character::revoke_all_control(&mut cha, &capa); // bumps control_epoch → ccap stale
    economy::transfer_between_characters(&ccap, &mut cha, &mut chb, MUNIT, economy::memo_gift());

    destroy(ccap);
    teardown(cha, capa);
    teardown(chb, capb);
    destroy(tcap);
}

#[test, expected_failure(abort_code = economy::EControlCapInvalid)]
fun transfer_wrong_controlcap_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (mut cha, capa) = character::mint_character_for_testing(&mut ctx);
    let (mut chb, capb) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    fund(&mut cha, &capa, 10 * MUNIT, &mut tcap, &mut ctx);
    let ccapb = character::issue_control_cap(&chb, &capb, &mut ctx); // cap for chb
    economy::transfer_between_characters(&ccapb, &mut cha, &mut chb, MUNIT, economy::memo_gift()); // not valid for FROM=cha

    destroy(ccapb);
    teardown(cha, capa);
    teardown(chb, capb);
    destroy(tcap);
}

#[test, expected_failure(abort_code = economy::EToDead)]
fun transfer_to_dead_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (mut cha, capa) = character::mint_character_for_testing(&mut ctx);
    let (mut chb, capb) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    fund(&mut cha, &capa, 10 * MUNIT, &mut tcap, &mut ctx);
    let ccap = character::issue_control_cap(&cha, &capa, &mut ctx);
    mark_dead(&mut chb);
    economy::transfer_between_characters(&ccap, &mut cha, &mut chb, MUNIT, economy::memo_gift());

    destroy(ccap);
    teardown(cha, capa);
    teardown(chb, capb);
    destroy(tcap);
}

#[test, expected_failure(abort_code = economy::EFromDead)]
fun transfer_from_dead_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (mut cha, capa) = character::mint_character_for_testing(&mut ctx);
    let (mut chb, capb) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    fund(&mut cha, &capa, 10 * MUNIT, &mut tcap, &mut ctx);
    let ccap = character::issue_control_cap(&cha, &capa, &mut ctx); // issued while alive (epoch valid)
    mark_dead(&mut cha); // mark_dead does NOT bump control_epoch → cap still is_valid
    // guard order: is_valid passes, then is_dead(from) fires EFromDead
    economy::transfer_between_characters(&ccap, &mut cha, &mut chb, MUNIT, economy::memo_gift());

    destroy(ccap);
    teardown(cha, capa);
    teardown(chb, capb);
    destroy(tcap);
}

// ─── known limitation (until D2 estate sweep) ────────────────────────

#[test]
fun stranded_funds_on_dead_wallet() {
    // A funded character that dies leaves its Balance locked: transfer asserts
    // !is_dead(from) (EFromDead), and D1 has no estate rail. This test documents
    // that the funds remain on-chain (non-zero, conserved) but unreachable until
    // D2's natural_death sweep ships. The redeploy goes out with eyes open.
    let mut ctx = sui::tx_context::dummy();
    let (mut ch, cap) = character::mint_character_for_testing(&mut ctx);
    let mut tcap = currency::new_treasury_for_testing(&mut ctx);

    fund(&mut ch, &cap, 50 * MUNIT, &mut tcap, &mut ctx);
    mark_dead(&mut ch);
    assert_eq!(economy::character_balance(&ch), 50 * MUNIT); // still there, just unreachable by any D1 rail

    teardown(ch, cap); // only the test-only drain can recover it
    destroy(tcap);
}
