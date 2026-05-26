/// Commitment — Layer 1 (產品層) memory provenance anchor.
///
/// **What this is**: a saga-scoped, storyteller-signed record on chain that
/// says "blob X (with content hash H) is the canonical thing committed for
/// subject Y at time T". Discovered via the `CommitmentCreated` event log,
/// indexed off-chain by (saga_id, subject_id).
///
/// **What this is NOT** (intentionally — see Layer 2 notes below):
///   - a chain-of-hashes / parent-linked history
///   - a cryptographic replay proof of agent decisions
///   - a multi-kind commitment registry
///
/// **Auth**: caller must hold the `StorytellerCap` of the saga. Anyone can
/// READ the resulting shared object or scan events.
///
/// **Layer 2 (research) note**: when the博班 "verifiable agent decision
/// chain" research module gets built, it will live in a SEPARATE package
/// and may either (a) wrap these commitments in its own ChainedCommit
/// struct, or (b) define an independent commit type. This module makes no
/// affordance for that future work — keeping it lean so the product
/// surface stays small and stable.
module endless_story::commitment;

use sui::clock::{Self, Clock};
use sui::event;
use sui::transfer;

use endless_story::saga::{Self, Saga, StorytellerCap};

// ─── errors ──────────────────────────────────────────────────────────

#[error]
const EEmptyHash: vector<u8> = b"content_hash must not be empty";

#[error]
const EEmptyBlobId: vector<u8> = b"blob_id must not be empty";

// ─── structs ─────────────────────────────────────────────────────────

/// A single committed reference. Shared so any reader (web, indexer,
/// future verifier) can fetch by object id without owner gating. Object
/// itself is immutable after creation — no setters exposed.
public struct Commitment has key {
    id: UID,
    /// Saga this commitment belongs to. Lets readers filter by world arc.
    saga_id: ID,
    /// Free-form subject — typically `character_id`, but the module does
    /// not enforce a type so future surfaces (scene-level commits, saga-
    /// level commits) can reuse the struct.
    subject_id: ID,
    /// Hash of the committed content. Caller's responsibility to pick a
    /// hash function and pre-hash off-chain; module treats it as opaque
    /// bytes so we don't lock in an algorithm.
    content_hash: vector<u8>,
    /// Walrus blob id (or any other off-chain storage reference). Opaque
    /// bytes; readers know how to resolve based on application context.
    blob_id: vector<u8>,
    /// Address that signed the commit (= the StorytellerCap holder at
    /// time of commit). Useful for audit even though the cap itself can
    /// be transferred later.
    committer: address,
    committed_at_ms: u64,
}

// ─── events ──────────────────────────────────────────────────────────

/// Emitted on every successful commit. Off-chain indexers tail this and
/// build the "latest commitment for subject X" lookup. Carries enough
/// fields that most UIs don't need to fetch the Commitment object.
public struct CommitmentCreated has copy, drop {
    commitment_id: ID,
    saga_id: ID,
    subject_id: ID,
    committer: address,
    committed_at_ms: u64,
}

// ─── entry ───────────────────────────────────────────────────────────

/// Publish a commitment. Storyteller-only.
///
/// Lifecycle:
///   1. caller hashes the off-chain blob, uploads to Walrus, gets blob_id
///   2. caller invokes `commit(cap, saga, subject_id, hash, blob_id, ...)`
///   3. module creates shared Commitment, emits CommitmentCreated
///
/// The caller chooses `subject_id` — it is not validated against any
/// existing object on chain. This is deliberate: it lets us commit for
/// subjects that may not be Move objects (off-chain entities) and keeps
/// the module independent of character/scene module APIs. Misuse (e.g.
/// committing for a non-existent id) is caught by the caller's own
/// indexing logic, not on chain.
public fun commit(
    cap: &StorytellerCap,
    saga: &Saga,
    subject_id: ID,
    content_hash: vector<u8>,
    blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    saga::assert_cap(cap, saga);
    assert!(!vector::is_empty(&content_hash), EEmptyHash);
    assert!(!vector::is_empty(&blob_id), EEmptyBlobId);

    let now = clock::timestamp_ms(clock);
    let committer = tx_context::sender(ctx);
    let saga_id = saga::saga_id(saga);

    let commitment = Commitment {
        id: object::new(ctx),
        saga_id,
        subject_id,
        content_hash,
        blob_id,
        committer,
        committed_at_ms: now,
    };
    let commitment_id = object::id(&commitment);

    event::emit(CommitmentCreated {
        commitment_id,
        saga_id,
        subject_id,
        committer,
        committed_at_ms: now,
    });

    transfer::share_object(commitment);
}

// ─── views ───────────────────────────────────────────────────────────
// Read accessors so off-chain callers / future contracts can introspect
// without needing to know struct layout. Kept minimal — extend only when
// a real consumer needs it.

public fun commitment_id(c: &Commitment): ID { object::id(c) }
public fun saga_id(c: &Commitment): ID { c.saga_id }
public fun subject_id(c: &Commitment): ID { c.subject_id }
public fun content_hash(c: &Commitment): &vector<u8> { &c.content_hash }
public fun blob_id(c: &Commitment): &vector<u8> { &c.blob_id }
public fun committer(c: &Commitment): address { c.committer }
public fun committed_at_ms(c: &Commitment): u64 { c.committed_at_ms }

// ─── test helpers ────────────────────────────────────────────────────
// Tagged #[test_only] so they don't bloat the production surface but
// downstream test modules can still drive the flow.

#[test_only]
public fun commit_for_testing(
    cap: &StorytellerCap,
    saga: &Saga,
    subject_id: ID,
    content_hash: vector<u8>,
    blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): Commitment {
    saga::assert_cap(cap, saga);
    let now = clock::timestamp_ms(clock);
    let committer = tx_context::sender(ctx);
    let saga_id = saga::saga_id(saga);
    Commitment {
        id: object::new(ctx),
        saga_id,
        subject_id,
        content_hash,
        blob_id,
        committer,
        committed_at_ms: now,
    }
}

#[test_only]
public fun destroy_for_testing(c: Commitment) {
    let Commitment {
        id,
        saga_id: _,
        subject_id: _,
        content_hash: _,
        blob_id: _,
        committer: _,
        committed_at_ms: _,
    } = c;
    object::delete(id);
}

// ─── tests ───────────────────────────────────────────────────────────

#[test_only]
use endless_story::world::{Self, World, AdminCap};
#[test_only]
use std::unit_test::assert_eq;

#[test_only]
fun setup_saga(ctx: &mut TxContext, clock: &Clock): (World, AdminCap, Saga, StorytellerCap) {
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(
            vector[b"human".to_string()],
            vector[],
        ),
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
fun commit_happy_path_records_all_fields() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock::set_for_testing(&mut clock, 12345);
    let (world, admin_cap, saga, cap) = setup_saga(&mut ctx, &clock);

    let subject = object::id_from_address(@0xBEEF);
    let hash = vector[0x01, 0x02, 0x03];
    let blob = b"walrus-blob-id-xyz";

    let c = commit_for_testing(&cap, &saga, subject, hash, blob, &clock, &mut ctx);

    assert_eq!(saga_id(&c), saga::saga_id(&saga));
    assert_eq!(subject_id(&c), subject);
    assert_eq!(*content_hash(&c), vector[0x01, 0x02, 0x03]);
    assert_eq!(*blob_id(&c), b"walrus-blob-id-xyz");
    assert_eq!(committed_at_ms(&c), 12345);

    destroy_for_testing(c);
    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap);
}

#[test]
#[expected_failure(abort_code = saga::ECapSagaMismatch)]
fun commit_with_foreign_cap_aborts() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock::set_for_testing(&mut clock, 1);
    let (mut world1, admin1, saga1, cap1) = setup_saga(&mut ctx, &clock);
    // Second saga in the same world — its cap should NOT validate against saga1.
    let (saga2, cap2) = saga::new_saga_for_testing(
        &mut world1,
        saga::kind_standard(),
        b"S2".to_string(),
        b"s".to_string(),
        b"u".to_string(),
        4000,
        5000,
        1000,
        vector[],
        @0xB,
        2000,
        &clock,
        &mut ctx,
    );

    // Use cap2 (saga2's cap) against saga1 — must abort.
    let c = commit_for_testing(
        &cap2,
        &saga1,
        object::id_from_address(@0xC0DE),
        vector[0x09],
        b"x",
        &clock,
        &mut ctx,
    );
    destroy_for_testing(c);

    clock::destroy_for_testing(clock);
    saga::destroy_saga_for_testing(saga2, cap2);
    teardown(world1, admin1, saga1, cap1);
}
