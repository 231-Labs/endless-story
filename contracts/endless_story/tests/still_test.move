/// Unit test for 劇照 Still minting: StorytellerCap-gated mint produces a
/// Still carrying the saga/character/moment fields, ready for Kiosk trade.
#[test_only]
module endless_story::still_test;

use std::unit_test::assert_eq;
use endless_story::world::{Self, Location};
use endless_story::saga::{kind_standard, new_saga_for_testing, destroy_saga_for_testing};
use endless_story::still;

#[test_only]
fun fake_id(ctx: &mut TxContext): ID {
    let uid = object::new(ctx);
    let id = uid.to_inner();
    object::delete(uid);
    id
}

#[test]
fun mint_still_carries_fields() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);

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
    let (saga, cap) = new_saga_for_testing(
        &mut world, kind_standard(),
        b"梨園".to_string(), b"s".to_string(), b"s".to_string(),
        4000, 5000, 1000, vector[world::location_id(&loc)], @0xA, 8002, &clock, &mut ctx,
    );

    let character_id = fake_id(&mut ctx);
    let s = still::mint_still(
        &cap,
        &saga,
        character_id,
        b"blob123".to_string(),
        b"https://aggregator.example/v1/blobs/blob123".to_string(),
        b"水袖那一夜".to_string(),
        1,
        &mut ctx,
    );

    assert_eq!(still::saga_id(&s), endless_story::saga::saga_id(&saga));
    assert_eq!(still::character_id(&s), character_id);
    assert_eq!(still::title(&s), b"水袖那一夜".to_string());
    assert_eq!(still::edition(&s), 1);
    assert_eq!(still::walrus_blob_id(&s), b"blob123".to_string());

    still::destroy_still_for_testing(s);
    destroy_saga_for_testing(saga, cap);
    world::destroy_location_for_testing(loc);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}
