/// E2E integration test for the drama engine's SUPPLY side (DR-1 + DR-2).
///
/// Proves the full on-chain causal chain that backs the product's core claim
/// ("anyone can re-run and get the same outcome"):
///
///   instantiate contested resource (柳 holds the 孟雲屏 slot)
///     → push BudgetEvent with two participants (柳, 白) in a real Scene
///     → both submit cards
///     → resolve_event with a resource-transfer outcome (白 seizes the slot)
///     → apply_resource_transfers settles the ledger (conservation re-checked on-chain)
///     → assert the zero-sum seize: 柳=0, 白=1, total still 1
///
/// This is the deterministic, verifiable "dispose" half. The off-chain SATISFACTION PHASE
/// (packages/drama) reads exactly this allocation result to derive tension; a separate
/// TS↔Move golden-vector test keeps the two byte-aligned.
#[test_only]
module endless_story::drama_e2e;

use std::unit_test::assert_eq;
use endless_story::world::{Self, Location};
use endless_story::saga::{kind_standard, new_saga_for_testing, destroy_saga_for_testing};
use endless_story::scene;
use endless_story::resource::{Self, DramaResource};
use endless_story::event;

#[test_only]
fun fake_id(ctx: &mut TxContext): ID {
    let uid = object::new(ctx);
    let id = uid.to_inner();
    object::delete(uid);
    id
}

#[test]
fun e2e_event_resolve_settles_resource_ledger() {
    let mut ctx = sui::tx_context::dummy();
    let mut clock = sui::clock::create_for_testing(&mut ctx);
    clock.set_for_testing(8000);

    // ── world + location + saga + cap ─────────────────────────────────────────────────────
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"World".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        8000,
        &mut ctx,
    );
    let loc: Location = world::new_location_for_testing(
        &admin_cap,
        &mut world,
        world::new_location_info(0, b"戲台".to_string(), b"".to_string(), b"".to_string()),
        world::new_position(0, 0),
        world::new_location_graph(vector[]),
        8001,
        &mut ctx,
    );
    let (mut saga, cap) = new_saga_for_testing(
        &mut world, kind_standard(),
        b"梨園".to_string(), b"s".to_string(), b"s".to_string(),
        4000, 5000, 1000, vector[world::location_id(&loc)], @0xA, 8002, &clock, &mut ctx,
    );

    // ── a real Scene (we need its real id for the event) ──────────────────────────────────
    let mut scene = scene::new_scene_for_testing(
        &cap, &mut saga, &loc,
        scene::new_scene_info(b"後台".to_string(), b"".to_string(), b"".to_string()),
        scene::new_scene_access(0),
        0, 0,
        scene::new_scene_params(500, 300, 200),
        vector[],
        8003,
        &mut ctx,
    );
    let scene_id = scene::scene_id(&scene);

    // ── contested resource: 孟雲屏 partnership slot, capacity 1 ───────────────────────────
    let mut slot: DramaResource = resource::new_resource_for_testing(object::id(&saga), 1, &mut ctx);
    let slot_id = object::id(&slot);

    let liu = fake_id(&mut ctx); // 柳生春
    let bai = fake_id(&mut ctx); // 白牡丹

    // 柳 starts holding the slot
    resource::apply_transfers(&cap, &saga, &mut slot, vector[resource::acquire(liu, 1)], &clock);
    assert_eq!(resource::held_by(&slot, liu), 1);
    assert_eq!(resource::total_allocated(&slot), 1);

    // ── push an event with both performers as participants ────────────────────────────────
    let catalog = vector[
        event::new_card_template_for_testing(0, 4 /*SOCIAL*/, b"陪排戲".to_string(), b""),
        event::new_card_template_for_testing(1, 1 /*ATTACK*/, b"搶戲".to_string(), b""),
    ];
    let mut budget_event = event::new_event_for_testing(
        &cap, &saga, scene_id,
        b"後台爭位".to_string(), b"".to_string(), 1,
        vector[liu, bai],
        catalog,
        2,
        8004,
        &mut ctx,
    );

    // both submit a card
    event::submit_action(&cap, &saga, &mut budget_event, liu, 0, &clock);
    event::submit_action(&cap, &saga, &mut budget_event, bai, 1, &clock);
    assert_eq!(event::submitted_action_count(&budget_event), 2);

    // ── resolve with the supply-side outcome: 白 SEIZES the slot from 柳 (zero-sum) ────────
    let seize = event::new_resource_transfer_op(slot_id, option::some(liu), bai, 1);
    let outcomes = event::outcomes_with_resource_transfers(vector[seize]);
    event::resolve_event(&cap, &saga, &mut budget_event, &mut scene, outcomes, &clock);
    assert_eq!(event::status(&budget_event), 1 /*RESOLVED*/);
    assert_eq!(event::resource_transfer_count(&budget_event), 1);

    // ── apply the resolved transfers to the ledger (conservation re-checked on-chain) ─────
    event::apply_resource_transfers(&cap, &saga, &budget_event, &mut slot, &clock);

    // ── ASSERT the zero-sum seize landed and conservation held ────────────────────────────
    assert_eq!(resource::held_by(&slot, liu), 0); // 柳 lost the slot
    assert_eq!(resource::held_by(&slot, bai), 1); // 白 now holds it
    assert_eq!(resource::total_allocated(&slot), 1); // still exactly 1 unit (conserved)
    assert_eq!(resource::free_capacity(&slot), 0);

    // ── teardown ──────────────────────────────────────────────────────────────────────────
    resource::destroy_resource_for_testing(slot);
    scene::destroy_scene_for_testing(scene);
    event::destroy_event_for_testing(budget_event);
    destroy_saga_for_testing(saga, cap);
    world::destroy_location_for_testing(loc);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

/// Negative E2E: a transfer naming a NON-participant must abort at resolve (scope guard).
#[test, expected_failure(abort_code = endless_story::event::EResourceTransferToNotParticipant)]
fun e2e_resolve_rejects_nonparticipant_holder() {
    let mut ctx = sui::tx_context::dummy();
    let mut clock = sui::clock::create_for_testing(&mut ctx);
    clock.set_for_testing(8000);
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        8000, &mut ctx,
    );
    let loc = world::new_location_for_testing(
        &admin_cap, &mut world,
        world::new_location_info(0, b"L".to_string(), b"".to_string(), b"".to_string()),
        world::new_position(0, 0), world::new_location_graph(vector[]), 8001, &mut ctx,
    );
    let (mut saga, cap) = new_saga_for_testing(
        &mut world, kind_standard(), b"S".to_string(), b"s".to_string(), b"s".to_string(),
        4000, 5000, 1000, vector[world::location_id(&loc)], @0xA, 8002, &clock, &mut ctx,
    );
    let mut scene = scene::new_scene_for_testing(
        &cap, &mut saga, &loc,
        scene::new_scene_info(b"sc".to_string(), b"".to_string(), b"".to_string()),
        scene::new_scene_access(0), 0, 0, scene::new_scene_params(0,0,0), vector[], 8003, &mut ctx,
    );
    let scene_id = scene::scene_id(&scene);
    let slot_id = fake_id(&mut ctx);
    let liu = fake_id(&mut ctx);
    let outsider = fake_id(&mut ctx); // NOT a participant

    let catalog = vector[event::new_card_template_for_testing(0, 4, b"c".to_string(), b"")];
    let mut be = event::new_event_for_testing(
        &cap, &saga, scene_id, b"e".to_string(), b"".to_string(), 1,
        vector[liu], catalog, 1, 8004, &mut ctx,
    );
    event::submit_action(&cap, &saga, &mut be, liu, 0, &clock);
    // transfer TO an outsider who is not a participant → must abort at resolve
    let bad = event::new_resource_transfer_op(slot_id, option::none(), outsider, 1);
    let outcomes = event::outcomes_with_resource_transfers(vector[bad]);
    event::resolve_event(&cap, &saga, &mut be, &mut scene, outcomes, &clock); // aborts here

    // unreachable cleanup (abort above); present to satisfy the type checker
    scene::destroy_scene_for_testing(scene);
    event::destroy_event_for_testing(be);
    destroy_saga_for_testing(saga, cap);
    world::destroy_location_for_testing(loc);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}
