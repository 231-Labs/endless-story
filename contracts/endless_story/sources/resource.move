/// Drama Engine — on-chain resource ledger (the SUPPLY side of the Desire/Resource model).
///
/// This is the trustless half of the drama engine: scarce, conserved resources that
/// characters contend over (e.g. the 孟雲屏 partnership slot, capacity = 1). The DEMAND
/// side (satisfaction / tension relaxation) stays off-chain as a deterministic, publicly
/// recomputable function of this ledger's allocation history (see `packages/drama`); it is
/// NOT stored here, by design — only the contested, must-be-verifiable scarcity is on-chain.
///
/// Design mirror (Move ↔ TS): this module is the Move counterpart of `applyTick`'s RESOURCE
/// PHASE. `apply_transfers` reproduces the TS "apply in canonical order, reject the WHOLE
/// batch on any conservation violation" semantics: within a single transaction, any `abort`
/// rolls back every prior mutation, so atomic-reject is structural (no scratch-copy needed).
/// The conservation invariant `sum(allocations) <= capacity` is asserted after every mutator.
///
/// Units are u64 (Sui-native, matches the TS `bigint` ledger values). The SCALE-based
/// fixed-point arithmetic lives on the DEMAND side; resource amounts here are plain counts.
module endless_story::resource;

use std::string::String;
use sui::event as event_bus;
use sui::table::{Self, Table};
use endless_story::saga::{Self, Saga, StorytellerCap};

// ─── errors ────────────────────────────────────────────────────────────────────────────
const ECapMismatch: u64 = 0; // StorytellerCap does not match this resource's saga
const ECapacityExceeded: u64 = 2; // a transfer would push total_allocated past capacity
const EInsufficientHeld: u64 = 3; // `from` holder lacks the requested amount
const EZeroCapacity: u64 = 4; // capacity must be > 0 at instantiation
const ENotEmptyOnRetire: u64 = 5; // cannot retire a resource that still holds allocations
const ESelfTransfer: u64 = 6; // from == to is a no-op and disallowed (keeps traces clean)

// ─── object ────────────────────────────────────────────────────────────────────────────

/// A single contested resource. `allocations[holder] = units`; absent holder holds 0.
/// INVARIANT (conservation, verifiable): `total_allocated == sum(allocations) <= capacity`.
public struct DramaResource has key {
    id: UID,
    saga_id: ID,
    /// archetype tag — the "bone" (structural kind, e.g. "capacity-1-slot") the LLM dressed
    /// in scenario "skin". Narrative-facing; not used in conservation math.
    archetype: String,
    /// human label (e.g. "partnership:孟雲屏"); narrative-facing only.
    label: String,
    capacity: u64,
    /// holder (Character ID) -> units held.
    allocations: Table<ID, u64>,
    /// cached sum(allocations) so conservation checks are O(1), not O(table).
    total_allocated: u64,
    created_at_ms: u64,
}

/// One unit-of-work in a batch reallocation. `from` absent (option none) = draw from the
/// free pool (total rises, must stay within capacity). `to` always present.
public struct Transfer has copy, drop, store {
    from: Option<ID>,
    to: ID,
    amount: u64,
}

// ─── events ──────────────────────────────────────────────────────────────────────────────
public struct ResourceInstantiated has copy, drop {
    resource_id: ID,
    saga_id: ID,
    archetype: String,
    label: String,
    capacity: u64,
    created_at_ms: u64,
}

public struct ResourceRetired has copy, drop {
    resource_id: ID,
    saga_id: ID,
}

/// Emitted once per accepted batch — the off-chain SATISFACTION PHASE keys on these to
/// rebuild the allocation-snapshot history it needs to recompute tension deterministically.
public struct AllocationChanged has copy, drop {
    resource_id: ID,
    saga_id: ID,
    transfer_count: u64,
    total_allocated: u64,
    changed_at_ms: u64,
}

// ─── constructors for Transfer (so other modules / tests can build batches) ──────────────

/// Acquire `amount` from the free pool to `to`.
public fun acquire(to: ID, amount: u64): Transfer {
    Transfer { from: option::none(), to, amount }
}

/// Move `amount` of an already-held unit from `from` to `to` (seize / hand-off).
public fun reallocate(from: ID, to: ID, amount: u64): Transfer {
    Transfer { from: option::some(from), to, amount }
}

// accessors so other modules (event.move) can validate a transfer's holders.
public fun transfer_to(t: &Transfer): ID { t.to }
public fun transfer_from(t: &Transfer): Option<ID> { t.from }
public fun transfer_amount(t: &Transfer): u64 { t.amount }

// ─── lifecycle ───────────────────────────────────────────────────────────────────────────

/// Instantiate a contested resource under a saga. Gated by the saga's StorytellerCap (the
/// "director"). In the genesis pipeline this is called AFTER the off-chain simulator has
/// dry-run-validated the schema; here we only enforce the structural floor (capacity > 0).
public fun instantiate(
    cap: &StorytellerCap,
    saga: &mut Saga,
    archetype: String,
    label: String,
    capacity: u64,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
) {
    let resource = instantiate_inner(cap, saga, archetype, label, capacity, clock, ctx);
    transfer::share_object(resource);
}

/// Core of `instantiate` that RETURNS the resource instead of sharing it. Splitting this out
/// lets tests exercise the real genesis path (cap check, capacity floor, saga registration,
/// event) and then inspect / retire the object — the same `*_for_testing`-alongside-`create`
/// idiom used by `saga::new_saga_for_testing`. Production callers use `instantiate` (shares).
fun instantiate_inner(
    cap: &StorytellerCap,
    saga: &mut Saga,
    archetype: String,
    label: String,
    capacity: u64,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
): DramaResource {
    saga::assert_cap(cap, saga);
    assert!(capacity > 0, EZeroCapacity);
    let saga_id = object::id(saga);
    let created_at_ms = sui::clock::timestamp_ms(clock);
    let resource = DramaResource {
        id: object::new(ctx),
        saga_id,
        archetype,
        label,
        capacity,
        allocations: table::new<ID, u64>(ctx),
        total_allocated: 0,
        created_at_ms,
    };
    let resource_id = object::id(&resource);
    // register on the saga (DOF) so off-chain can read the saga's resource set directly,
    // mirroring how scene::create registers anchor scenes.
    saga::register_resource(saga, resource_id);
    event_bus::emit(ResourceInstantiated {
        resource_id,
        saga_id,
        archetype: resource.archetype,
        label: resource.label,
        capacity,
        created_at_ms,
    });
    resource
}

#[test_only]
/// Test entry: runs the REAL instantiate path (cap/capacity/register/event) but returns the
/// resource so tests can assert on it + retire it. Mirrors saga::new_saga_for_testing.
public fun instantiate_for_testing(
    cap: &StorytellerCap,
    saga: &mut Saga,
    archetype: String,
    label: String,
    capacity: u64,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
): DramaResource {
    instantiate_inner(cap, saga, archetype, label, capacity, clock, ctx)
}

/// Retire a fully-drained resource (all allocations released). We refuse to retire while
/// units are still held so the conservation history stays coherent (no orphaned holdings).
public fun retire(cap: &StorytellerCap, saga: &Saga, resource: DramaResource) {
    saga::assert_cap(cap, saga);
    assert!(resource.saga_id == object::id(saga), ECapMismatch);
    assert!(resource.total_allocated == 0, ENotEmptyOnRetire);
    let DramaResource { id, saga_id, archetype: _, label: _, capacity: _, allocations, total_allocated: _, created_at_ms: _ } = resource;
    table::destroy_empty(allocations);
    event_bus::emit(ResourceRetired { resource_id: id.to_inner(), saga_id });
    object::delete(id);
}

// ─── the load-bearing op: atomic batch reallocation ──────────────────────────────────────

/// Apply a batch of transfers in the given (canonical) order, atomically. Any conservation
/// violation `abort`s the whole transaction → every prior mutation in this call rolls back,
/// which is exactly the TS RESOURCE PHASE's "reject the whole action, leave state untouched".
///
/// The off-chain SDK is responsible for ordering `transfers` canonically (by actor, index);
/// the chain replays that order faithfully and re-validates conservation — it never trusts
/// the off-chain computation, it re-checks it. This is the trustless guarantee.
///
/// Gated by StorytellerCap so only the saga's director can settle a resolved event's
/// resource outcomes (called from `event::resolve_event` in DR-2).
public fun apply_transfers(
    cap: &StorytellerCap,
    saga: &Saga,
    resource: &mut DramaResource,
    transfers: vector<Transfer>,
    clock: &sui::clock::Clock,
) {
    saga::assert_cap(cap, saga);
    assert!(resource.saga_id == object::id(saga), ECapMismatch);

    let n = vector::length(&transfers);
    let mut i = 0;
    while (i < n) {
        let t = vector::borrow(&transfers, i);
        apply_one(resource, t);
        i = i + 1;
    };

    // conservation invariant — must hold after the whole batch (each step also upholds it)
    assert!(resource.total_allocated <= resource.capacity, ECapacityExceeded);

    event_bus::emit(AllocationChanged {
        resource_id: object::id(resource),
        saga_id: resource.saga_id,
        transfer_count: n,
        total_allocated: resource.total_allocated,
        changed_at_ms: sui::clock::timestamp_ms(clock),
    });
}

/// Apply one transfer, upholding conservation. Aborts (→ rolls back the batch) on violation.
fun apply_one(resource: &mut DramaResource, t: &Transfer) {
    if (t.amount == 0) return; // no-op; keeps batches tolerant of zero entries
    if (option::is_some(&t.from)) {
        let from = *option::borrow(&t.from);
        assert!(from != t.to, ESelfTransfer);
        let have = held(resource, from);
        assert!(have >= t.amount, EInsufficientHeld);
        // move units: total_allocated unchanged (conservation trivially preserved)
        set_held(resource, from, have - t.amount);
        let to_have = held(resource, t.to);
        set_held(resource, t.to, to_have + t.amount);
    } else {
        // draw from the free pool: total rises, must stay within capacity
        let after = resource.total_allocated + t.amount;
        assert!(after <= resource.capacity, ECapacityExceeded);
        let to_have = held(resource, t.to);
        set_held(resource, t.to, to_have + t.amount);
        resource.total_allocated = after;
    };
}

/// Escape hatch: release a holder's units back to the free pool (e.g. when a character is
/// released to wild / dies mid-saga, so the ledger stays coherent without a full event).
/// StorytellerCap-gated, consistent with the rest of the module. (An AdminCap-gated emergency
/// variant can land in DR-3 alongside the director wiring, with a proper &Saga world check.)
public fun release_holder(
    cap: &StorytellerCap,
    saga: &Saga,
    resource: &mut DramaResource,
    holder: ID,
    clock: &sui::clock::Clock,
) {
    saga::assert_cap(cap, saga);
    assert!(resource.saga_id == object::id(saga), ECapMismatch);
    let have = held(resource, holder);
    if (have == 0) return;
    set_held(resource, holder, 0);
    resource.total_allocated = resource.total_allocated - have;
    event_bus::emit(AllocationChanged {
        resource_id: object::id(resource),
        saga_id: resource.saga_id,
        transfer_count: 1,
        total_allocated: resource.total_allocated,
        changed_at_ms: sui::clock::timestamp_ms(clock),
    });
}

// ─── internal allocation helpers ─────────────────────────────────────────────────────────
fun held(resource: &DramaResource, holder: ID): u64 {
    if (table::contains(&resource.allocations, holder)) *table::borrow(&resource.allocations, holder)
    else 0
}

fun set_held(resource: &mut DramaResource, holder: ID, value: u64) {
    if (table::contains(&resource.allocations, holder)) {
        let slot = table::borrow_mut(&mut resource.allocations, holder);
        *slot = value;
    } else {
        table::add(&mut resource.allocations, holder, value);
    };
}

// ─── read-only views (for SDK / off-chain SATISFACTION PHASE) ────────────────────────────
public fun resource_saga_id(resource: &DramaResource): ID { resource.saga_id }
public fun capacity(resource: &DramaResource): u64 { resource.capacity }
public fun total_allocated(resource: &DramaResource): u64 { resource.total_allocated }
public fun free_capacity(resource: &DramaResource): u64 { resource.capacity - resource.total_allocated }
public fun held_by(resource: &DramaResource, holder: ID): u64 { held(resource, holder) }
public fun archetype(resource: &DramaResource): String { resource.archetype }
public fun label(resource: &DramaResource): String { resource.label }

// ═══════════════════════════════════════════════════════════════════════════════════════
// Tests — prove the conservation invariant + atomic-reject mirror the TS RESOURCE PHASE.
// ═══════════════════════════════════════════════════════════════════════════════════════
#[test_only]
use std::unit_test::assert_eq;
#[test_only]
use endless_story::world;
#[test_only]
use endless_story::saga::{kind_standard, new_saga_for_testing, destroy_saga_for_testing};

/// Build a world + saga + cap + clock for a test. Returns everything the caller must destroy.
#[test_only]
fun setup(ctx: &mut TxContext): (world::World, world::AdminCap, Saga, StorytellerCap, sui::clock::Clock) {
    let mut clock = sui::clock::create_for_testing(ctx);
    clock.set_for_testing(8000);
    let (world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        8000,
        ctx,
    );
    let mut world = world;
    let (saga, cap) = new_saga_for_testing(
        &mut world, kind_standard(),
        b"S".to_string(), b"s".to_string(), b"s".to_string(),
        4000, 5000, 1000, vector[], @0xA, 8003, &clock, ctx,
    );
    (world, admin_cap, saga, cap, clock)
}

#[test_only]
fun fake_id(ctx: &mut TxContext): ID {
    let uid = object::new(ctx);
    let id = uid.to_inner();
    object::delete(uid);
    id
}

#[test_only]
fun teardown(world: world::World, admin_cap: world::AdminCap, saga: Saga, cap: StorytellerCap, clock: sui::clock::Clock) {
    destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test_only]
/// build a capacity-N resource and take it back out of the shared pool isn't possible;
/// instead we construct one directly for unit testing the ledger math.
fun bare_resource_for_test(saga: &Saga, capacity: u64, ctx: &mut TxContext): DramaResource {
    new_resource_for_testing(object::id(saga), capacity, ctx)
}

#[test_only]
/// Public test-only constructor so cross-module integration tests (tests/drama_e2e.move)
/// can build a DramaResource without share/take dance.
public fun new_resource_for_testing(saga_id: ID, capacity: u64, ctx: &mut TxContext): DramaResource {
    DramaResource {
        id: object::new(ctx),
        saga_id,
        archetype: b"capacity-1-slot".to_string(),
        label: b"partnership:test".to_string(),
        capacity,
        allocations: table::new<ID, u64>(ctx),
        total_allocated: 0,
        created_at_ms: 8000,
    }
}

#[test_only]
/// Public test-only destructor (drops a non-empty allocation table; for test cleanup only).
public fun destroy_resource_for_testing(r: DramaResource) {
    let DramaResource { id, saga_id: _, archetype: _, label: _, capacity: _, allocations, total_allocated: _, created_at_ms: _ } = r;
    table::drop(allocations);
    object::delete(id);
}

#[test]
fun acquire_from_pool_respects_capacity_and_conservation() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, saga, cap, clock) = setup(&mut ctx);
    let mut r = bare_resource_for_test(&saga, 1, &mut ctx);
    let liu = fake_id(&mut ctx);

    apply_transfers(&cap, &saga, &mut r, vector[acquire(liu, 1)], &clock);
    assert_eq!(held_by(&r, liu), 1);
    assert_eq!(total_allocated(&r), 1);
    assert_eq!(free_capacity(&r), 0);

    destroy_resource_for_test(r);
    teardown(world, admin_cap, saga, cap, clock);
}

#[test, expected_failure(abort_code = ECapacityExceeded)]
fun acquire_beyond_capacity_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, saga, cap, clock) = setup(&mut ctx);
    let mut r = bare_resource_for_test(&saga, 1, &mut ctx);
    let liu = fake_id(&mut ctx);
    // capacity 1, try to take 2 → abort
    apply_transfers(&cap, &saga, &mut r, vector[acquire(liu, 2)], &clock);
    destroy_resource_for_test(r);
    teardown(world, admin_cap, saga, cap, clock);
}

#[test]
fun seize_is_zero_sum_one_holder_at_a_time() {
    // The 孟雲屏 partnership: capacity 1. 柳 holds it, 白 seizes it → 柳=0, 白=1, total stays 1.
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, saga, cap, clock) = setup(&mut ctx);
    let mut r = bare_resource_for_test(&saga, 1, &mut ctx);
    let liu = fake_id(&mut ctx);
    let bai = fake_id(&mut ctx);

    apply_transfers(&cap, &saga, &mut r, vector[acquire(liu, 1)], &clock);
    assert_eq!(held_by(&r, liu), 1);
    // 白 seizes the slot from 柳
    apply_transfers(&cap, &saga, &mut r, vector[reallocate(liu, bai, 1)], &clock);
    assert_eq!(held_by(&r, liu), 0);
    assert_eq!(held_by(&r, bai), 1);
    assert_eq!(total_allocated(&r), 1); // conservation: still exactly 1 unit in play

    destroy_resource_for_test(r);
    teardown(world, admin_cap, saga, cap, clock);
}

#[test, expected_failure(abort_code = EInsufficientHeld)]
fun seize_more_than_held_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, saga, cap, clock) = setup(&mut ctx);
    let mut r = bare_resource_for_test(&saga, 3, &mut ctx);
    let liu = fake_id(&mut ctx);
    let bai = fake_id(&mut ctx);
    apply_transfers(&cap, &saga, &mut r, vector[acquire(liu, 1)], &clock);
    // 白 tries to take 2 from 柳 who only holds 1 → abort
    apply_transfers(&cap, &saga, &mut r, vector[reallocate(liu, bai, 2)], &clock);
    destroy_resource_for_test(r);
    teardown(world, admin_cap, saga, cap, clock);
}

#[test, expected_failure(abort_code = ECapacityExceeded)]
fun batch_is_atomic_partial_then_overflow_rolls_back() {
    // THE load-bearing test: a batch where the FIRST transfer is legal but the SECOND breaks
    // capacity must roll back the FIRST too (whole-batch reject = TS atomic-reject mirror).
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, saga, cap, clock) = setup(&mut ctx);
    let mut r = bare_resource_for_test(&saga, 1, &mut ctx);
    let liu = fake_id(&mut ctx);
    let bai = fake_id(&mut ctx);
    // [acquire liu 1 (ok), acquire bai 1 (overflow→abort)] — the abort rolls back liu's gain.
    // We can't observe r after abort (the tx unwinds), so the assertion is the abort itself;
    // the no-partial-state guarantee is what `expected_failure` certifies here.
    apply_transfers(&cap, &saga, &mut r, vector[acquire(liu, 1), acquire(bai, 1)], &clock);
    destroy_resource_for_test(r);
    teardown(world, admin_cap, saga, cap, clock);
}

#[test]
fun release_holder_frees_units() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, saga, cap, clock) = setup(&mut ctx);
    let mut r = bare_resource_for_test(&saga, 2, &mut ctx);
    let liu = fake_id(&mut ctx);
    apply_transfers(&cap, &saga, &mut r, vector[acquire(liu, 2)], &clock);
    assert_eq!(total_allocated(&r), 2);
    release_holder(&cap, &saga, &mut r, liu, &clock);
    assert_eq!(held_by(&r, liu), 0);
    assert_eq!(total_allocated(&r), 0);
    destroy_resource_for_test(r);
    teardown(world, admin_cap, saga, cap, clock);
}

#[test]
fun zero_amount_transfer_is_noop() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, saga, cap, clock) = setup(&mut ctx);
    let mut r = bare_resource_for_test(&saga, 1, &mut ctx);
    let liu = fake_id(&mut ctx);
    apply_transfers(&cap, &saga, &mut r, vector[acquire(liu, 0)], &clock);
    assert_eq!(total_allocated(&r), 0);
    destroy_resource_for_test(r);
    teardown(world, admin_cap, saga, cap, clock);
}

#[test_only]
fun destroy_resource_for_test(r: DramaResource) {
    destroy_resource_for_testing(r);
}

// ── genesis path: the REAL instantiate entry (deploy-critical, exercised end to end) ──────
#[test]
fun instantiate_registers_on_saga_and_retire_round_trips() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, mut saga, cap, clock) = setup(&mut ctx);

    // saga starts with no resources
    assert_eq!(vector::length(&saga::saga_resource_ids(&saga)), 0);

    // real instantiate path: cap check + capacity floor + saga DOF registration + event
    let r = instantiate_for_testing(
        &cap, &mut saga,
        b"capacity-1-slot".to_string(), b"partnership:孟雲屏".to_string(),
        1, &clock, &mut ctx,
    );
    let rid = object::id(&r);

    // it registered on the saga (off-chain can read this without scanning events)
    let ids = saga::saga_resource_ids(&saga);
    assert_eq!(vector::length(&ids), 1);
    assert!(ids.contains(&rid));
    assert_eq!(capacity(&r), 1);
    assert_eq!(total_allocated(&r), 0);

    // retire a drained resource succeeds
    retire(&cap, &saga, r);

    destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = EZeroCapacity)]
fun instantiate_zero_capacity_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, mut saga, cap, clock) = setup(&mut ctx);
    let r = instantiate_for_testing(
        &cap, &mut saga, b"x".to_string(), b"x".to_string(), 0, &clock, &mut ctx,
    );
    destroy_resource_for_test(r);
    teardown(world, admin_cap, saga, cap, clock);
}

#[test, expected_failure(abort_code = ENotEmptyOnRetire)]
fun retire_with_held_units_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, mut saga, cap, clock) = setup(&mut ctx);
    let mut r = instantiate_for_testing(
        &cap, &mut saga, b"x".to_string(), b"x".to_string(), 1, &clock, &mut ctx,
    );
    let liu = fake_id(&mut ctx);
    apply_transfers(&cap, &saga, &mut r, vector[acquire(liu, 1)], &clock);
    retire(&cap, &saga, r); // still holds 1 → abort
    teardown(world, admin_cap, saga, cap, clock);
}

#[test]
fun register_resource_is_idempotent() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap, mut saga, cap, clock) = setup(&mut ctx);
    let rid = fake_id(&mut ctx);
    saga::register_resource(&mut saga, rid);
    saga::register_resource(&mut saga, rid); // duplicate → no double entry
    assert_eq!(vector::length(&saga::saga_resource_ids(&saga)), 1);
    teardown(world, admin_cap, saga, cap, clock);
}
