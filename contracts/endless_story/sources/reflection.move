/// Reflection — character interior monologue, anchored on chain.
///
/// **What this is**: a separate-from-POV memory artefact. POV chapters
/// are the character's *public* face (what they say + do in scene).
/// Reflections are the *private* face (what they really felt, alone
/// off-stage). The two can — and often should — contradict each other.
///
/// **Two activation paths**:
///   - **Active**: owner pays a small ENDLESS (Phase 1 demo: free) and
///     asks a specific question; LLM writes the character's answer.
///   - **Passive**: importance debt accumulates from POV chapters; once
///     the threshold is crossed, runner triggers a free-form reflection
///     (no question, just the character's interior at this moment).
///
/// **Why a separate module from commitment.move**: reflections share
/// the same anchor pattern (hash + walrus blob_id) but have distinct
/// semantics — `mode`, optional `question`, separate visibility tier.
/// Keeping them in a dedicated event stream lets web filter cleanly
/// without parsing content frontmatter.
///
/// **Auth**: storyteller cap. Owner-initiated reflections go through
/// the runner (server signs); chain doesn't verify the owner relationship
/// because the runner already does (off-chain auth + LLM gating). This
/// keeps the contract surface small — no need to bring OwnerCap in.
module endless_story::reflection;

use std::string::String;
use sui::clock::{Self, Clock};
use sui::event;
use sui::transfer;

use endless_story::saga::{Self, Saga, StorytellerCap};

// ─── errors ──────────────────────────────────────────────────────────

#[error]
const EEmptyHash: vector<u8> = b"content_hash must not be empty";

#[error]
const EEmptyBlobId: vector<u8> = b"blob_id must not be empty";

#[error]
const EBadMode: vector<u8> = b"mode must be active or passive";

// ─── structs ─────────────────────────────────────────────────────────

/// A single reflection anchor. Shared so anyone with the right
/// premium-tier access (enforced off-chain by web) can fetch + verify.
public struct Reflection has key {
    id: UID,
    saga_id: ID,
    /// The character this reflection belongs to.
    character_id: ID,
    /// "active" (owner-initiated, has `question`) or "passive"
    /// (runner-triggered, free-form).
    mode: String,
    /// When mode = "active", the owner's question. Empty otherwise.
    question: String,
    /// Hash of the reflection prose (walrus content).
    content_hash: vector<u8>,
    /// Walrus blob id.
    blob_id: vector<u8>,
    /// 0–10 importance — passive may bump character's debt counter
    /// resetting after reflection; active is typically higher because
    /// the owner is paying attention. Default: active=7, passive=6.
    importance: u8,
    committed_at_ms: u64,
}

// ─── events ──────────────────────────────────────────────────────────

public struct ReflectionCommitted has copy, drop {
    reflection_id: ID,
    saga_id: ID,
    character_id: ID,
    mode: String,
    /// Echoed for indexer convenience (cheaper than fetching the
    /// Reflection object per row).
    question: String,
    importance: u8,
    committed_at_ms: u64,
}

// ─── entry ───────────────────────────────────────────────────────────

/// Storyteller (runner) anchors a reflection.
///
/// Caller responsibility:
///   1. Run reflection LLM (active mode includes question + character
///      context; passive mode is free-form interior)
///   2. Upload to Walrus → blob_id
///   3. Hash optimised bytes → content_hash
///   4. Call this entry with cap + payload
public fun submit(
    cap: &StorytellerCap,
    saga: &Saga,
    character_id: ID,
    mode: String,
    question: String,
    content_hash: vector<u8>,
    blob_id: vector<u8>,
    importance: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    saga::assert_cap(cap, saga);
    assert!(is_valid_mode(&mode), EBadMode);
    assert!(!vector::is_empty(&content_hash), EEmptyHash);
    assert!(!vector::is_empty(&blob_id), EEmptyBlobId);

    let now = clock::timestamp_ms(clock);
    let reflection = Reflection {
        id: object::new(ctx),
        saga_id: saga::saga_id(saga),
        character_id,
        mode,
        question,
        content_hash,
        blob_id,
        importance,
        committed_at_ms: now,
    };
    let reflection_id = object::id(&reflection);

    event::emit(ReflectionCommitted {
        reflection_id,
        saga_id: reflection.saga_id,
        character_id: reflection.character_id,
        mode: reflection.mode,
        question: reflection.question,
        importance: reflection.importance,
        committed_at_ms: now,
    });

    transfer::share_object(reflection);
}

// ─── views ───────────────────────────────────────────────────────────

public fun reflection_id(r: &Reflection): ID { object::id(r) }
public fun reflection_character_id(r: &Reflection): ID { r.character_id }
public fun reflection_saga_id(r: &Reflection): ID { r.saga_id }
public fun reflection_mode(r: &Reflection): &String { &r.mode }
public fun reflection_question(r: &Reflection): &String { &r.question }
public fun reflection_content_hash(r: &Reflection): &vector<u8> { &r.content_hash }
public fun reflection_blob_id(r: &Reflection): &vector<u8> { &r.blob_id }
public fun reflection_importance(r: &Reflection): u8 { r.importance }
public fun reflection_committed_at_ms(r: &Reflection): u64 { r.committed_at_ms }

// ─── helpers ─────────────────────────────────────────────────────────

fun is_valid_mode(s: &String): bool {
    let bytes = s.as_bytes();
    *bytes == b"active" || *bytes == b"passive"
}

// ─── tests ───────────────────────────────────────────────────────────

#[test_only]
use endless_story::world::{Self, World, AdminCap};

#[test_only]
fun setup(ctx: &mut TxContext, clock: &Clock): (World, AdminCap, Saga, StorytellerCap) {
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
fun submit_active_reflection() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock::set_for_testing(&mut clock, 1000);
    let (world, admin_cap, saga, cap) = setup(&mut ctx, &clock);

    submit(
        &cap,
        &saga,
        object::id_from_address(@0xC0DE),
        b"active".to_string(),
        b"你後悔嗎？".to_string(),
        vector[0x01, 0x02],
        b"walrus-xyz",
        7,
        &clock,
        &mut ctx,
    );

    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap);
}

#[test]
fun submit_passive_reflection() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (world, admin_cap, saga, cap) = setup(&mut ctx, &clock);

    submit(
        &cap,
        &saga,
        object::id_from_address(@0xC0DE),
        b"passive".to_string(),
        b"".to_string(),
        vector[0x01, 0x02],
        b"walrus-abc",
        6,
        &clock,
        &mut ctx,
    );

    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap);
}

#[test]
#[expected_failure(abort_code = EBadMode)]
fun submit_bad_mode_aborts() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (world, admin_cap, saga, cap) = setup(&mut ctx, &clock);

    submit(
        &cap,
        &saga,
        object::id_from_address(@0xC0DE),
        b"daydream".to_string(),
        b"".to_string(),
        vector[0x01],
        b"x",
        5,
        &clock,
        &mut ctx,
    );

    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap);
}
