/// Scene — an anchored stage in a (Saga, Location) cell.
///
/// A `Scene` carries:
///   - `SceneInfo`      — display name / description / image metadata URI
///   - `ScenePlacement` — (world, saga, location) coordinates + (pos_x, pos_y) for map layout
///   - `SceneAccess`    — privacy_level (0 = public … 4 = extremely private; not enforced on-chain, LLM hint)
///   - `SceneParams`    — atmosphere / danger / prosperity (event mechanics input)
///   - `SceneState`     — causal_commitment_ids + current_character_ids + created_at_ms
///
/// **Created via:** `StorytellerCap` of the parent Saga. Scene auto-registers
/// itself as an anchor scene on the Saga via `saga::add_anchor_scene`.
///
/// **Mutations** (package-only): add/remove characters (called by
/// `character.move` walk_in_world), apply_params_delta (called by
/// `event.move` after resolve).
///
/// Phase 1.4 — depends on saga.move (StorytellerCap + Saga + assert_cap +
/// add_anchor_scene) and world.move (Location + location_world_id).
module endless_story::scene;

use std::string::String;
use sui::clock;
use sui::display;
use sui::event;
use sui::package;

use endless_story::saga::{Self, Saga, StorytellerCap};
use endless_story::world::{Self, Location};

// ─── errors ──────────────────────────────────────────────────────────

const ELocationWorldMismatch: u64 = 1;

// ─── one-time witness (Display V2) ───────────────────────────────────

public struct SCENE has drop {}

// ─── value types ─────────────────────────────────────────────────────

public struct SceneInfo has copy, drop, store {
    name: String,
    description: String,
    metadata_uri: String,
}

public struct ScenePlacement has copy, drop, store {
    world_id: ID,
    saga_id: ID,
    location_id: ID,
    pos_x: u64,
    pos_y: u64,
}

/// `privacy_level` semantics: 0 = public, 1 = semi-public, 2 = semi-private,
/// 3 = private, 4 = extremely private. **Not enforced on-chain** — it's a
/// hint the storyteller LLM uses when deciding who can witness scene events.
public struct SceneAccess has copy, drop, store {
    privacy_level: u8,
}

/// Scene mechanics input. Conventional range 0–1000 each; event resolution
/// reads these to tilt outcomes. `apply_params_delta` saturates at 0 on
/// the low end (no underflow); high end is unbounded (no realistic overflow
/// with story-seed-driven values).
public struct SceneParams has copy, drop, store {
    atmosphere: u64,
    danger: u64,
    prosperity: u64,
}

public struct SceneState has copy, drop, store {
    causal_commitment_ids: vector<ID>,
    current_character_ids: vector<ID>,
    created_at_ms: u64,
}

public struct Scene has key {
    id: UID,
    info: SceneInfo,
    placement: ScenePlacement,
    access: SceneAccess,
    params: SceneParams,
    state: SceneState,
}

// ─── events ──────────────────────────────────────────────────────────

public struct SceneCreated has copy, drop {
    scene_id: ID,
    saga_id: ID,
    world_id: ID,
    location_id: ID,
    name: String,
    privacy_level: u8,
    created_at_ms: u64,
}

// ─── init (Display V2) ───────────────────────────────────────────────

fun init(otw: SCENE, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    let keys = vector[
        b"name".to_string(),
        b"description".to_string(),
        b"image_url".to_string(),
    ];
    let values = vector[
        b"{info.name}".to_string(),
        b"{info.description}".to_string(),
        b"{info.metadata_uri}".to_string(),
    ];
    let mut scene_display = display::new_with_fields<Scene>(&publisher, keys, values, ctx);
    display::update_version(&mut scene_display);
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(scene_display, ctx.sender());
}

// ─── scene lifecycle ─────────────────────────────────────────────────

public fun create_scene(
    cap: &StorytellerCap,
    saga: &mut Saga,
    location: &Location,
    info: SceneInfo,
    access: SceneAccess,
    pos_x: u64,
    pos_y: u64,
    params: SceneParams,
    causal_commitment_ids: vector<ID>,
    clock: &clock::Clock,
    ctx: &mut TxContext,
) {
    saga::assert_cap(cap, saga);
    let world_id = saga::world_id(saga);
    assert!(world::location_world_id(location) == world_id, ELocationWorldMismatch);

    let created_at_ms = clock::timestamp_ms(clock);
    let placement = ScenePlacement {
        world_id,
        saga_id: saga::saga_id(saga),
        location_id: world::location_id(location),
        pos_x,
        pos_y,
    };
    let scene = Scene {
        id: object::new(ctx),
        info,
        placement,
        access,
        params,
        state: SceneState {
            causal_commitment_ids,
            current_character_ids: vector[],
            created_at_ms,
        },
    };
    let scene_id = object::id(&scene);
    saga::add_anchor_scene(saga, scene_id);

    event::emit(SceneCreated {
        scene_id,
        saga_id: scene.placement.saga_id,
        world_id,
        location_id: scene.placement.location_id,
        name: scene.info.name,
        privacy_level: scene.access.privacy_level,
        created_at_ms,
    });

    transfer::share_object(scene);
}

// ─── package-internal: character presence ────────────────────────────

public(package) fun add_character(scene: &mut Scene, character_id: ID) {
    if (!scene.state.current_character_ids.contains(&character_id)) {
        vector::push_back(&mut scene.state.current_character_ids, character_id);
    };
}

/// Idempotent: removing an absent character is a no-op (so composer drift
/// doesn't abort transitions). Returns true iff a removal actually
/// happened — callers may want to assert.
public(package) fun remove_character(scene: &mut Scene, character_id: ID): bool {
    let idx_opt = scene.state.current_character_ids.find_index!(|id| *id == character_id);
    if (idx_opt.is_some()) {
        let _ = vector::remove(&mut scene.state.current_character_ids, *idx_opt.borrow());
        true
    } else {
        false
    }
}

public fun has_character(scene: &Scene, character_id: ID): bool {
    scene.state.current_character_ids.contains(&character_id)
}

// ─── package-internal: params delta (event resolution) ───────────────

public(package) fun apply_params_delta(
    scene: &mut Scene,
    atmosphere_magnitude: u64,
    atmosphere_negative: bool,
    danger_magnitude: u64,
    danger_negative: bool,
    prosperity_magnitude: u64,
    prosperity_negative: bool,
) {
    scene.params.atmosphere = saturating_apply(
        scene.params.atmosphere,
        atmosphere_magnitude,
        atmosphere_negative,
    );
    scene.params.danger = saturating_apply(
        scene.params.danger,
        danger_magnitude,
        danger_negative,
    );
    scene.params.prosperity = saturating_apply(
        scene.params.prosperity,
        prosperity_magnitude,
        prosperity_negative,
    );
}

fun saturating_apply(current: u64, magnitude: u64, negative: bool): u64 {
    if (negative) {
        if (magnitude > current) 0 else current - magnitude
    } else {
        current + magnitude
    }
}

// ─── views ───────────────────────────────────────────────────────────

public fun scene_id(scene: &Scene): ID { object::id(scene) }

// ── chamber.move support: package-visible UID accessors ──────────────
// Let the sibling `chamber` module attach/read a furnishing dynamic field
// on the Scene's UID without touching the Scene struct or its constructors.
public(package) fun uid(scene: &Scene): &UID { &scene.id }
public(package) fun uid_mut(scene: &mut Scene): &mut UID { &mut scene.id }

public fun saga_id(scene: &Scene): ID { scene.placement.saga_id }

public fun world_id(scene: &Scene): ID { scene.placement.world_id }

public fun location_id(scene: &Scene): ID { scene.placement.location_id }

public fun atmosphere(scene: &Scene): u64 { scene.params.atmosphere }

public fun danger(scene: &Scene): u64 { scene.params.danger }

public fun prosperity(scene: &Scene): u64 { scene.params.prosperity }

public fun privacy_level(scene: &Scene): u8 { scene.access.privacy_level }

public fun character_count(scene: &Scene): u64 {
    vector::length(&scene.state.current_character_ids)
}

// ─── constructors (used by cli PTB bootstrap) ────────────────────────

public fun new_scene_info(name: String, description: String, metadata_uri: String): SceneInfo {
    SceneInfo { name, description, metadata_uri }
}

public fun new_scene_access(privacy_level: u8): SceneAccess {
    SceneAccess { privacy_level }
}

public fun new_scene_params(atmosphere: u64, danger: u64, prosperity: u64): SceneParams {
    SceneParams { atmosphere, danger, prosperity }
}

// ─── tests ───────────────────────────────────────────────────────────

#[test_only]
use std::unit_test::{assert_eq, destroy};

/// Mint a fresh dummy ID. Each call advances the ctx counter, so successive
/// invocations return distinct IDs (don't reuse a dummy ctx — its counter
/// resets every time tx_context::dummy() is called).
#[test_only]
fun fake_id(ctx: &mut TxContext): ID {
    let uid = object::new(ctx);
    let id = object::uid_to_inner(&uid);
    object::delete(uid);
    id
}

#[test]
fun add_and_has_character_works() {
    let mut ctx = sui::tx_context::dummy();
    let mut scene = bare_scene_for_test(&mut ctx);

    let char_a = fake_id(&mut ctx);
    assert!(!has_character(&scene, char_a));

    add_character(&mut scene, char_a);
    assert!(has_character(&scene, char_a));
    assert_eq!(character_count(&scene), 1);

    // Idempotent on duplicate add.
    add_character(&mut scene, char_a);
    assert_eq!(character_count(&scene), 1);

    destroy(scene);
}

#[test]
fun remove_character_is_idempotent_and_returns_truth() {
    let mut ctx = sui::tx_context::dummy();
    let mut scene = bare_scene_for_test(&mut ctx);

    let char_a = fake_id(&mut ctx);
    let char_b = fake_id(&mut ctx);

    // Removing missing → false.
    assert!(!remove_character(&mut scene, char_a));

    add_character(&mut scene, char_a);
    add_character(&mut scene, char_b);
    assert_eq!(character_count(&scene), 2);

    // Removing present → true + count drops.
    assert!(remove_character(&mut scene, char_a));
    assert_eq!(character_count(&scene), 1);
    assert!(!has_character(&scene, char_a));
    assert!(has_character(&scene, char_b));

    // Removing again (now missing) → false + count unchanged.
    assert!(!remove_character(&mut scene, char_a));
    assert_eq!(character_count(&scene), 1);

    destroy(scene);
}

#[test]
fun apply_params_delta_saturates_at_zero() {
    let mut ctx = sui::tx_context::dummy();
    let mut scene = bare_scene_for_test(&mut ctx);

    // Initial params: atmosphere=500, danger=300, prosperity=200 (set by helper).
    assert_eq!(atmosphere(&scene), 500);

    // Positive delta on atmosphere, negative on danger (clamped at 0 on
    // overshoot), negative on prosperity (clamped at 0).
    apply_params_delta(&mut scene, 100, false, 999, true, 50, true);
    assert_eq!(atmosphere(&scene), 600);
    assert_eq!(danger(&scene), 0); // 300 - 999 clamps to 0
    assert_eq!(prosperity(&scene), 150); // 200 - 50

    destroy(scene);
}

/// Bare Scene without going through saga/storyteller cap — purely for
/// testing the package-internal mutators in isolation.
#[test_only]
fun bare_scene_for_test(ctx: &mut TxContext): Scene {
    let world_id = fake_id(ctx);
    let saga_id = fake_id(ctx);
    let location_id = fake_id(ctx);
    Scene {
        id: object::new(ctx),
        info: SceneInfo {
            name: b"Test Scene".to_string(),
            description: b"".to_string(),
            metadata_uri: b"".to_string(),
        },
        placement: ScenePlacement {
            world_id,
            saga_id,
            location_id,
            pos_x: 0,
            pos_y: 0,
        },
        access: SceneAccess { privacy_level: 0 },
        params: SceneParams { atmosphere: 500, danger: 300, prosperity: 200 },
        state: SceneState {
            causal_commitment_ids: vector[],
            current_character_ids: vector[],
            created_at_ms: 0,
        },
    }
}

// ─── test helpers exposed to dependent modules' tests ────────────────

#[test_only]
public fun new_scene_for_testing(
    cap: &StorytellerCap,
    saga: &mut Saga,
    location: &Location,
    info: SceneInfo,
    access: SceneAccess,
    pos_x: u64,
    pos_y: u64,
    params: SceneParams,
    causal_commitment_ids: vector<ID>,
    created_at_ms: u64,
    ctx: &mut TxContext,
): Scene {
    saga::assert_cap(cap, saga);
    let world_id = saga::world_id(saga);
    assert!(world::location_world_id(location) == world_id, ELocationWorldMismatch);

    let scene = Scene {
        id: object::new(ctx),
        info,
        placement: ScenePlacement {
            world_id,
            saga_id: saga::saga_id(saga),
            location_id: world::location_id(location),
            pos_x,
            pos_y,
        },
        access,
        params,
        state: SceneState {
            causal_commitment_ids,
            current_character_ids: vector[],
            created_at_ms,
        },
    };
    saga::add_anchor_scene(saga, object::id(&scene));
    scene
}

#[test_only]
public fun character_count_for_testing(scene: &Scene): u64 {
    vector::length(&scene.state.current_character_ids)
}

#[test_only]
public fun destroy_scene_for_testing(scene: Scene) {
    let Scene { id, info: _, placement: _, access: _, params: _, state: _ } = scene;
    id.delete();
}
