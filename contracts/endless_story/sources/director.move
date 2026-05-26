/// Director — saga-level capability bus.
///
/// The saga storyteller (or LLM director acting on their behalf) emits
/// typed events from this module to nudge the world without writing
/// prose. Downstream services (character workers, gazette compiler,
/// reflection trigger) subscribe to these events and react.
///
/// **Why a separate module**: keeping director vocabulary out of
/// `saga.move` keeps the surface small and easily extensible. New
/// capabilities = new entry function + new event type, no schema
/// migration on existing Saga objects.
///
/// **Why events only (no state)**: every capability is fire-and-forget
/// from the chain's perspective. The CHAIN doesn't track active
/// storylets, attribute pressures, etc. — off-chain runner services
/// reduce these events into their own internal state. This keeps the
/// chain footprint minimal and matches the "events are message bus"
/// architectural decision.
///
/// **Auth**: every capability requires the saga's `StorytellerCap`.
/// Runner (admin signer) holds the cap during demo phase.
module endless_story::director;

use std::string::String;
use sui::clock::{Self, Clock};
use sui::event;

use endless_story::saga::{Self, Saga, StorytellerCap};

// ─── events ──────────────────────────────────────────────────────────

/// Activate a storylet template inside a scene. `template_id` is a
/// runner-side identifier (string slug, e.g. "confession_after_show").
/// Chain doesn't validate templates — that's the runner's storylet
/// library job. Chain just records the intent + audit trail.
public struct StoryletOpened has copy, drop {
    /// Synthetic id minted at emit time — `tx_digest || event_seq` style.
    /// Allows downstream services to dedupe + reference back.
    storylet_id: ID,
    saga_id: ID,
    template_id: String,
    scene_id: ID,
    character_ids: vector<ID>,
    opened_at_ms: u64,
}

/// Nudge a scene's ambient parameters. Magnitude clamped to ±20.
public struct AttributePressureApplied has copy, drop {
    saga_id: ID,
    scene_id: ID,
    /// "atmosphere" | "danger" | "prosperity"
    axis: String,
    delta: u8,
    /// true = subtract delta, false = add delta (Move u8 can't be negative)
    is_negative: bool,
    applied_at_ms: u64,
}

/// Soft invitation for a character to enter a scene. Worker may ignore.
public struct CharacterCalled has copy, drop {
    saga_id: ID,
    scene_id: ID,
    character_id: ID,
    reason: String,
    called_at_ms: u64,
}

/// Seed a relationship tension in scene context.
public struct RelationshipSeeded has copy, drop {
    saga_id: ID,
    scene_id: ID,
    character_a: ID,
    character_b: ID,
    /// e.g. "romance" | "tension" | "rivalry" | "wary" | "estrangement" | "mentorship"
    tone: String,
    seeded_at_ms: u64,
}

/// Saga advances to a new narrative phase.
public struct PhaseAdvanced has copy, drop {
    saga_id: ID,
    next_phase: String,
    advanced_at_ms: u64,
}

// ─── errors ──────────────────────────────────────────────────────────

#[error]
const EDeltaOutOfRange: vector<u8> = b"attribute_pressure delta must be in [-20, 20]";

#[error]
const EEmptyTemplateId: vector<u8> = b"storylet template_id must not be empty";

#[error]
const EEmptyCharacterIds: vector<u8> = b"open_storylet requires at least one character_id";

#[error]
const EBadAxis: vector<u8> = b"attribute axis must be atmosphere / danger / prosperity";

// ─── entry functions ─────────────────────────────────────────────────

/// Storyteller signals a storylet should activate. The runner picks
/// this up off-chain and starts driving the scene + character workers.
public fun open_storylet(
    cap: &StorytellerCap,
    saga: &Saga,
    template_id: String,
    scene_id: ID,
    character_ids: vector<ID>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    saga::assert_cap(cap, saga);
    assert!(!std::string::is_empty(&template_id), EEmptyTemplateId);
    assert!(!vector::is_empty(&character_ids), EEmptyCharacterIds);
    let now = clock::timestamp_ms(clock);
    // Synthetic id from a fresh UID, immediately deleted — gives us
    // a unique handle without leaving a shared object lying around.
    let uid = object::new(ctx);
    let storylet_id = uid.to_inner();
    uid.delete();
    event::emit(StoryletOpened {
        storylet_id,
        saga_id: saga::saga_id(saga),
        template_id,
        scene_id,
        character_ids,
        opened_at_ms: now,
    });
}

/// Apply attribute pressure. Delta is split into `(u8, bool)` since
/// Move u8 is unsigned — caller passes magnitude + sign flag.
public fun attribute_pressure(
    cap: &StorytellerCap,
    saga: &Saga,
    scene_id: ID,
    axis: String,
    delta_magnitude: u8,
    is_negative: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let _ = ctx;
    saga::assert_cap(cap, saga);
    assert!(is_valid_axis(&axis), EBadAxis);
    assert!(delta_magnitude <= 20, EDeltaOutOfRange);
    let now = clock::timestamp_ms(clock);
    event::emit(AttributePressureApplied {
        saga_id: saga::saga_id(saga),
        scene_id,
        axis,
        delta: delta_magnitude,
        is_negative,
        applied_at_ms: now,
    });
}

public fun character_call(
    cap: &StorytellerCap,
    saga: &Saga,
    scene_id: ID,
    character_id: ID,
    reason: String,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let _ = ctx;
    saga::assert_cap(cap, saga);
    let now = clock::timestamp_ms(clock);
    event::emit(CharacterCalled {
        saga_id: saga::saga_id(saga),
        scene_id,
        character_id,
        reason,
        called_at_ms: now,
    });
}

public fun relationship_seed(
    cap: &StorytellerCap,
    saga: &Saga,
    scene_id: ID,
    character_a: ID,
    character_b: ID,
    tone: String,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let _ = ctx;
    saga::assert_cap(cap, saga);
    let now = clock::timestamp_ms(clock);
    event::emit(RelationshipSeeded {
        saga_id: saga::saga_id(saga),
        scene_id,
        character_a,
        character_b,
        tone,
        seeded_at_ms: now,
    });
}

public fun advance_phase(
    cap: &StorytellerCap,
    saga: &Saga,
    next_phase: String,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let _ = ctx;
    saga::assert_cap(cap, saga);
    let now = clock::timestamp_ms(clock);
    event::emit(PhaseAdvanced {
        saga_id: saga::saga_id(saga),
        next_phase,
        advanced_at_ms: now,
    });
}

// ─── helpers ─────────────────────────────────────────────────────────

fun is_valid_axis(s: &String): bool {
    let bytes = s.as_bytes();
    *bytes == b"atmosphere" || *bytes == b"danger" || *bytes == b"prosperity"
}

// ─── tests ───────────────────────────────────────────────────────────

#[test_only]
use endless_story::world::{Self, World, AdminCap};

#[test_only]
fun setup_saga(ctx: &mut TxContext, clock: &Clock): (World, AdminCap, Saga, StorytellerCap) {
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
        1002,
        clock,
        ctx,
    );
    (world, admin_cap, saga, cap)
}

#[test_only]
fun teardown(world: World, admin_cap: AdminCap, saga: Saga, cap: StorytellerCap) {
    saga::destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
}

#[test]
fun open_storylet_emits_event() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock::set_for_testing(&mut clock, 12345);
    let (world, admin_cap, saga, cap) = setup_saga(&mut ctx, &clock);

    open_storylet(
        &cap,
        &saga,
        b"confession_after_show".to_string(),
        object::id_from_address(@0xBEEF),
        vector[object::id_from_address(@0xC0DE)],
        &clock,
        &mut ctx,
    );

    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap);
}

#[test]
#[expected_failure(abort_code = EEmptyTemplateId)]
fun open_storylet_rejects_empty_template() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (world, admin_cap, saga, cap) = setup_saga(&mut ctx, &clock);

    open_storylet(
        &cap,
        &saga,
        b"".to_string(),
        object::id_from_address(@0xBEEF),
        vector[object::id_from_address(@0xC0DE)],
        &clock,
        &mut ctx,
    );

    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap);
}

#[test]
fun attribute_pressure_applies() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (world, admin_cap, saga, cap) = setup_saga(&mut ctx, &clock);

    attribute_pressure(
        &cap,
        &saga,
        object::id_from_address(@0xBEEF),
        b"atmosphere".to_string(),
        15,
        false,
        &clock,
        &mut ctx,
    );

    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap);
}

#[test]
#[expected_failure(abort_code = EDeltaOutOfRange)]
fun attribute_pressure_rejects_out_of_range() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (world, admin_cap, saga, cap) = setup_saga(&mut ctx, &clock);

    attribute_pressure(
        &cap,
        &saga,
        object::id_from_address(@0xBEEF),
        b"atmosphere".to_string(),
        25,
        false,
        &clock,
        &mut ctx,
    );

    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap);
}

#[test]
#[expected_failure(abort_code = EBadAxis)]
fun attribute_pressure_rejects_bad_axis() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (world, admin_cap, saga, cap) = setup_saga(&mut ctx, &clock);

    attribute_pressure(
        &cap,
        &saga,
        object::id_from_address(@0xBEEF),
        b"chaos".to_string(),
        5,
        false,
        &clock,
        &mut ctx,
    );

    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap);
}
