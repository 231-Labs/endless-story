/// 劇照 Still tests: editions auto-increment per moment on-chain (many fans
/// can collect the same moment), and a curated edition cap sells out.
#[test_only]
module endless_story::still_test;

use std::unit_test::{assert_eq, destroy};
use endless_story::world::{Self, Location};
use endless_story::saga::{Self, Saga, StorytellerCap, kind_standard, new_saga_for_testing, destroy_saga_for_testing};
use endless_story::currency;
use endless_story::still;
use endless_story::world::{World, AdminCap};

#[test_only]
fun fake_id(ctx: &mut TxContext): ID {
    let uid = object::new(ctx);
    let id = uid.to_inner();
    object::delete(uid);
    id
}

#[test_only]
fun fixture(ctx: &mut TxContext): (World, AdminCap, Location, Saga, StorytellerCap, sui::clock::Clock) {
    let clock = sui::clock::create_for_testing(ctx);
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"World".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        8000,
        ctx,
    );
    let loc: Location = world::new_location_for_testing(
        &admin_cap,
        &mut world,
        world::new_location_info(0, b"戲台".to_string(), b"".to_string(), b"".to_string()),
        world::new_position(0, 0),
        world::new_location_graph(vector[]),
        8001,
        ctx,
    );
    let (saga, cap) = new_saga_for_testing(
        &mut world, kind_standard(),
        b"梨園".to_string(), b"s".to_string(), b"s".to_string(),
        4000, 5000, 1000, vector[world::location_id(&loc)], @0xA, 8002, &clock, ctx,
    );
    (world, admin_cap, loc, saga, cap, clock)
}

#[test_only]
fun teardown(
    world: World,
    admin_cap: AdminCap,
    loc: Location,
    saga: Saga,
    cap: StorytellerCap,
    clock: sui::clock::Clock,
) {
    destroy_saga_for_testing(saga, cap);
    world::destroy_location_for_testing(loc);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test]
fun editions_autoincrement_per_moment() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, loc, saga, cap, clock) = fixture(&mut ctx);
    let mut registry = still::new_registry_for_testing(&saga, &mut ctx);
    let character_id = fake_id(&mut ctx);

    // two fans collect the SAME moment → editions 1 and 2
    let s1 = still::mint_still(
        &cap, &saga, &mut registry, character_id,
        b"blobA".to_string(), b"https://agg/blobA".to_string(), b"水袖那一夜".to_string(),
        &mut ctx,
    );
    let s2 = still::mint_still(
        &cap, &saga, &mut registry, character_id,
        b"blobA".to_string(), b"https://agg/blobA".to_string(), b"水袖那一夜".to_string(),
        &mut ctx,
    );
    assert_eq!(still::edition(&s1), 1);
    assert_eq!(still::edition(&s2), 2);
    assert_eq!(still::minted_count(&registry, b"blobA".to_string()), 2);

    // a different moment starts back at edition 1
    let s3 = still::mint_still(
        &cap, &saga, &mut registry, character_id,
        b"blobB".to_string(), b"https://agg/blobB".to_string(), b"大合影".to_string(),
        &mut ctx,
    );
    assert_eq!(still::edition(&s3), 1);
    assert_eq!(still::title(&s3), b"大合影".to_string());

    still::destroy_still_for_testing(s1);
    still::destroy_still_for_testing(s2);
    still::destroy_still_for_testing(s3);
    still::destroy_registry_for_testing(registry);
    teardown(world, admin_cap, loc, saga, cap, clock);
}

#[test]
fun paid_mint_charges_fee_into_treasury() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, loc, mut saga, cap, clock) = fixture(&mut ctx);
    let mut registry = still::new_registry_for_testing(&saga, &mut ctx);
    let config = still::new_mint_config_for_testing(&saga, 1_000_000, &mut ctx);
    let character_id = fake_id(&mut ctx);

    let mut tcap = currency::new_treasury_for_testing(&mut ctx);
    // Overpay (1.5 ENDLESS for a 1 ENDLESS fee) — the full coin flows to treasury.
    let payment = sui::coin::mint(&mut tcap, 1_500_000, &mut ctx);

    let before = saga::treasury_balance(&saga);
    let s = still::mint_still_paid(
        &config, &mut saga, &mut registry, payment, character_id,
        b"blobA".to_string(), b"https://agg/blobA".to_string(), b"水袖那一夜".to_string(),
        &mut ctx,
    );
    assert_eq!(still::edition(&s), 1);
    assert_eq!(still::minted_count(&registry, b"blobA".to_string()), 1);
    assert_eq!(saga::treasury_balance(&saga), before + 1_500_000);

    still::destroy_still_for_testing(s);
    still::destroy_mint_config_for_testing(config);
    still::destroy_registry_for_testing(registry);
    destroy(tcap);
    teardown(world, admin_cap, loc, saga, cap, clock);
}

#[test, expected_failure(abort_code = still::EInsufficientPayment)]
fun paid_mint_rejects_underpayment() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, loc, mut saga, cap, clock) = fixture(&mut ctx);
    let mut registry = still::new_registry_for_testing(&saga, &mut ctx);
    let config = still::new_mint_config_for_testing(&saga, 1_000_000, &mut ctx);
    let character_id = fake_id(&mut ctx);

    let mut tcap = currency::new_treasury_for_testing(&mut ctx);
    // One base unit short of the fee → aborts EInsufficientPayment.
    let payment = sui::coin::mint(&mut tcap, 999_999, &mut ctx);

    let s = still::mint_still_paid(
        &config, &mut saga, &mut registry, payment, character_id,
        b"blobA".to_string(), b"https://agg/blobA".to_string(), b"水袖那一夜".to_string(),
        &mut ctx,
    );

    // unreachable cleanup (abort above); satisfies the type checker
    still::destroy_still_for_testing(s);
    still::destroy_mint_config_for_testing(config);
    still::destroy_registry_for_testing(registry);
    destroy(tcap);
    teardown(world, admin_cap, loc, saga, cap, clock);
}

#[test, expected_failure(abort_code = still::EEditionSoldOut)]
fun limited_edition_sells_out() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, loc, saga, cap, clock) = fixture(&mut ctx);
    let mut registry = still::new_registry_for_testing(&saga, &mut ctx);
    let character_id = fake_id(&mut ctx);

    // 名場面 capped at 1 edition
    still::set_edition_limit(&cap, &saga, &mut registry, b"blobA".to_string(), 1);
    let s1 = still::mint_still(
        &cap, &saga, &mut registry, character_id,
        b"blobA".to_string(), b"https://agg/blobA".to_string(), b"名場面".to_string(),
        &mut ctx,
    );
    // second collector → sold out, aborts here
    let s2 = still::mint_still(
        &cap, &saga, &mut registry, character_id,
        b"blobA".to_string(), b"https://agg/blobA".to_string(), b"名場面".to_string(),
        &mut ctx,
    );

    // unreachable cleanup (abort above); satisfies the type checker
    still::destroy_still_for_testing(s1);
    still::destroy_still_for_testing(s2);
    still::destroy_registry_for_testing(registry);
    teardown(world, admin_cap, loc, saga, cap, clock);
}
