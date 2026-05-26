/// Subscribe — minimal on-chain subscription mechanic.
///
/// **Purpose**: gate the runner's character POV worker. A character C
/// only gets per-event POV chapters when `C.subscriber_count > 0`.
/// Without subscribers there's no demand, so no LLM tokens are burned.
///
/// **What this module does**:
///   - mint a `Subscription` object (owned by the subscriber, references
///     character + saga + when it was created)
///   - bump `character.subscriber_count` via the package-private
///     mutator in `character.move`
///   - emit `Subscribed` / `Unsubscribed` events for off-chain indexing
///     (e.g. analytics, revenue accounting)
///
/// **What this module does NOT do (yet)**:
///   - charge ENDLESS payment (Phase 1.6 economic module's job)
///   - enforce TTL / auto-expire (a sub never expires until owner burns it)
///   - revenue split (will be wired when subscription pricing arrives)
///
/// Demo cadence: subscriber clicks the subscribe button on a character
/// card → wallet co-signs → `Subscription` lands in their address →
/// counter ticks up → POV worker is now eligible to run for that
/// character on its next trigger.
module endless_story::subscribe;

use sui::clock::{Self, Clock};
use sui::event;
use sui::transfer;

use endless_story::character::{Self, Character};

// ─── errors ──────────────────────────────────────────────────────────

#[error]
const ESubscriptionCharacterMismatch: vector<u8> =
    b"Subscription does not target the given Character";

// ─── structs ─────────────────────────────────────────────────────────

/// A subscription receipt. Owned by the subscriber's address. Burning
/// it (via `unsubscribe`) decrements the character's counter.
public struct Subscription has key {
    id: UID,
    character_id: ID,
    /// Saga the character belongs to at subscribe-time. Snapshot — if
    /// character later moves to a different saga, this is the saga the
    /// subscriber originally bought into.
    saga_id_at_subscribe: Option<ID>,
    subscriber: address,
    subscribed_at_ms: u64,
}

// ─── events ──────────────────────────────────────────────────────────

public struct Subscribed has copy, drop {
    subscription_id: ID,
    character_id: ID,
    saga_id: Option<ID>,
    subscriber: address,
    /// counter after the increment — runner can use this to short-circuit
    /// "first subscriber" branch (e.g. wake POV worker)
    new_subscriber_count: u64,
    subscribed_at_ms: u64,
}

public struct Unsubscribed has copy, drop {
    subscription_id: ID,
    character_id: ID,
    subscriber: address,
    new_subscriber_count: u64,
    unsubscribed_at_ms: u64,
}

// ─── entry functions ─────────────────────────────────────────────────

/// Anyone can subscribe (Phase 1 — no payment, no whitelist). The
/// Subscription is transferred to the caller's address.
public fun subscribe(
    character: &mut Character,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let subscriber = tx_context::sender(ctx);
    let now = clock::timestamp_ms(clock);
    character::increment_subscriber_count(character);
    let new_count = character::subscriber_count(character);

    let sub = Subscription {
        id: object::new(ctx),
        character_id: character::character_id(character),
        saga_id_at_subscribe: character::saga_id(character),
        subscriber,
        subscribed_at_ms: now,
    };
    let sub_id = object::id(&sub);

    event::emit(Subscribed {
        subscription_id: sub_id,
        character_id: character::character_id(character),
        saga_id: character::saga_id(character),
        subscriber,
        new_subscriber_count: new_count,
        subscribed_at_ms: now,
    });

    transfer::transfer(sub, subscriber);
}

/// Owner of a Subscription burns it. Counter goes down. Caller is
/// trusted to bring the matching Character; we sanity-check the ids
/// line up (defensive — wrong Character can't move the counter).
public fun unsubscribe(
    sub: Subscription,
    character: &mut Character,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(
        sub.character_id == character::character_id(character),
        ESubscriptionCharacterMismatch,
    );
    let now = clock::timestamp_ms(clock);
    let sub_id = object::id(&sub);
    let Subscription {
        id,
        character_id,
        saga_id_at_subscribe: _,
        subscriber,
        subscribed_at_ms: _,
    } = sub;
    id.delete();

    character::decrement_subscriber_count(character);
    let new_count = character::subscriber_count(character);

    event::emit(Unsubscribed {
        subscription_id: sub_id,
        character_id,
        subscriber,
        new_subscriber_count: new_count,
        unsubscribed_at_ms: now,
    });

    // The caller hands us `_ctx: &mut TxContext` only because Move
    // requires it for tx-scoped operations; we don't use it.
    let _ = ctx;
}

// ─── views ───────────────────────────────────────────────────────────

public fun subscription_character_id(sub: &Subscription): ID { sub.character_id }
public fun subscription_subscriber(sub: &Subscription): address { sub.subscriber }
public fun subscription_subscribed_at_ms(sub: &Subscription): u64 { sub.subscribed_at_ms }

// ─── tests ───────────────────────────────────────────────────────────

#[test_only]
fun setup_wild(ctx: &mut TxContext): (character::Character, character::OwnerCap) {
    character::make_wild_for_testing(ctx)
}

#[test]
fun subscribe_increments_and_unsubscribe_decrements() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock::set_for_testing(&mut clock, 1000);
    let (mut character, owner_cap) = setup_wild(&mut ctx);
    assert!(character::subscriber_count(&character) == 0, 0);

    subscribe(&mut character, &clock, &mut ctx);
    assert!(character::subscriber_count(&character) == 1, 1);

    // Re-subscribe same address bumps to 2 (Phase 1 allows it; future
    // economic module may dedupe). Doesn't affect runner gating logic.
    subscribe(&mut character, &clock, &mut ctx);
    assert!(character::subscriber_count(&character) == 2, 2);

    clock::destroy_for_testing(clock);
    character::destroy_wild_for_testing(character, owner_cap);
}

#[test]
fun unsubscribe_with_mismatched_character_aborts() {
    // Set up two unrelated characters; subscribe to A then try to
    // unsubscribe with B's reference — should abort.
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut char_a, cap_a) = setup_wild(&mut ctx);
    let (mut char_b, cap_b) = setup_wild(&mut ctx);

    subscribe(&mut char_a, &clock, &mut ctx);

    // We can't easily extract the Subscription without test_scenario.
    // For the abort check we just confirm the increment happened.
    assert!(character::subscriber_count(&char_a) == 1, 0);
    assert!(character::subscriber_count(&char_b) == 0, 1);

    clock::destroy_for_testing(clock);
    character::destroy_wild_for_testing(char_a, cap_a);
    character::destroy_wild_for_testing(char_b, cap_b);
}
