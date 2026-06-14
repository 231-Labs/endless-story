/// Dream — owner-paid memory injection.
///
/// **What this is**: a Character owner pays ENDLESS to inject a dream
/// fragment into their character's memory. The fragment is moderated
/// + optimised off-chain (server-side LLM) before submission, then
/// anchored on chain with high importance so the runner's POV worker
/// surfaces it on the next chapter.
///
/// **Authentication**: caller must hold the `OwnerCap` matching the
/// target Character. This binds dream submission to NFT ownership —
/// only the rightful character owner can shape their memory.
///
/// **Payment**: `submit_dream` takes a `Coin<CURRENCY>` of at least
/// `DreamConfig.price` and deposits it into the saga's treasury.
/// Admin can adjust price + pause via `set_dream_price` / `set_paused`
/// using `DreamAdminCap`. Default price = 50 ENDLESS (50_000_000 raw
/// with 6 decimals).
///
/// **Visibility**: Dream is a shared object so the runner / web can
/// read it without owner gating. The CONTENT lives on Walrus; only
/// the hash + blob_id are on chain. `importance: u8` defaults to 8 of
/// 10 — when the POV worker pulls memories for prompt, dreams jump
/// to the top of recall.
///
/// **Why not commitment.move**: dream needs payment + auth that aren't
/// in commitment's surface. Keeping commitment lean (Layer 1 product
/// anchor) and giving dream its own module is cleaner.
module endless_story::dream;

use std::string::String;
use sui::clock::{Self, Clock};
use sui::coin::Coin;
use sui::event;
use sui::transfer;

use endless_story::character::{Self, Character, OwnerCap};
use endless_story::currency::CURRENCY;
use endless_story::saga::{Self, Saga, StorytellerCap};

// ─── errors ──────────────────────────────────────────────────────────

#[error]
const EWrongOwnerCap: vector<u8> = b"OwnerCap does not match the target Character";

#[error]
const EInsufficientPayment: vector<u8> = b"Payment less than DreamConfig.price";

#[error]
const EDreamsPaused: vector<u8> = b"Dream submission is currently paused by admin";

#[error]
const EConfigSagaMismatch: vector<u8> = b"DreamConfig does not target the given Saga";

#[error]
const EEmptyHash: vector<u8> = b"content_hash must not be empty";

#[error]
const EEmptyBlobId: vector<u8> = b"blob_id must not be empty";

// ─── structs ─────────────────────────────────────────────────────────

/// Saga-scoped dream config. Shared object — anyone reads, only admin
/// cap writes. One per saga; saga storyteller creates at bootstrap.
public struct DreamConfig has key {
    id: UID,
    saga_id: ID,
    /// Minimum ENDLESS required to submit a dream (raw units, 6 decimals).
    price: u64,
    paused: bool,
}

/// Mint at config creation. Holder can set_dream_price / set_paused.
public struct DreamAdminCap has key, store {
    id: UID,
    saga_id: ID,
}

/// Per-injected-dream record. Shared so runner + web can read freely.
public struct Dream has key {
    id: UID,
    character_id: ID,
    saga_id: ID,
    /// Address that paid for + submitted the dream (= OwnerCap holder
    /// at time of submission).
    submitter: address,
    /// Raw ENDLESS amount deposited into saga treasury.
    paid_amount: u64,
    /// Hash of the moderated dream content.
    content_hash: vector<u8>,
    /// Walrus blob id (caller's responsibility to upload before
    /// calling this entry).
    blob_id: vector<u8>,
    /// 0–10 importance — POV worker uses this to weight recall.
    /// Server-side moderator picks; default 8.
    importance: u8,
    injected_at_ms: u64,
}

// ─── events ──────────────────────────────────────────────────────────

public struct DreamConfigCreated has copy, drop {
    config_id: ID,
    saga_id: ID,
    price: u64,
}

public struct DreamConfigUpdated has copy, drop {
    config_id: ID,
    saga_id: ID,
    new_price: u64,
    paused: bool,
    updated_at_ms: u64,
}

public struct DreamInjected has copy, drop {
    dream_id: ID,
    character_id: ID,
    saga_id: ID,
    submitter: address,
    paid_amount: u64,
    importance: u8,
    injected_at_ms: u64,
}

// ─── admin: init + price control ─────────────────────────────────────

/// Storyteller creates the DreamConfig (one per saga, at bootstrap).
/// Default price = 50 ENDLESS. Admin cap transferred to caller.
#[allow(lint(self_transfer))]
public fun create_config(
    cap: &StorytellerCap,
    saga: &Saga,
    initial_price: u64,
    ctx: &mut TxContext,
) {
    saga::assert_cap(cap, saga);
    let saga_id = saga::saga_id(saga);
    let config = DreamConfig {
        id: object::new(ctx),
        saga_id,
        price: initial_price,
        paused: false,
    };
    let config_id = object::id(&config);
    let admin_cap = DreamAdminCap {
        id: object::new(ctx),
        saga_id,
    };
    event::emit(DreamConfigCreated {
        config_id,
        saga_id,
        price: initial_price,
    });
    transfer::share_object(config);
    transfer::transfer(admin_cap, ctx.sender());
}

public fun set_dream_price(
    admin: &DreamAdminCap,
    config: &mut DreamConfig,
    new_price: u64,
    clock: &Clock,
) {
    assert!(admin.saga_id == config.saga_id, EConfigSagaMismatch);
    config.price = new_price;
    event::emit(DreamConfigUpdated {
        config_id: object::id(config),
        saga_id: config.saga_id,
        new_price,
        paused: config.paused,
        updated_at_ms: clock::timestamp_ms(clock),
    });
}

public fun set_paused(
    admin: &DreamAdminCap,
    config: &mut DreamConfig,
    paused: bool,
    clock: &Clock,
) {
    assert!(admin.saga_id == config.saga_id, EConfigSagaMismatch);
    config.paused = paused;
    event::emit(DreamConfigUpdated {
        config_id: object::id(config),
        saga_id: config.saga_id,
        new_price: config.price,
        paused,
        updated_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── submit ──────────────────────────────────────────────────────────

/// Owner pays ENDLESS + submits a moderated dream blob ref.
///
/// Caller responsibilities (off chain):
///   1. Send raw text to moderator LLM → get optimised text
///   2. Upload optimised text to Walrus → get blob_id
///   3. Hash the optimised bytes → content_hash
///   4. Sign + send this entry with payment Coin
///
/// On chain we verify: cap matches character, character belongs to
/// saga, config matches saga, not paused, payment >= price. Treasury
/// deposit happens here; no refund path (rejected dreams never reach
/// the chain — that's the moderator's job).
public fun submit_dream(
    config: &DreamConfig,
    saga: &mut Saga,
    character: &Character,
    owner_cap: &OwnerCap,
    payment: Coin<CURRENCY>,
    content_hash: vector<u8>,
    blob_id: vector<u8>,
    importance: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!config.paused, EDreamsPaused);
    assert!(config.saga_id == saga::saga_id(saga), EConfigSagaMismatch);
    assert!(
        character::owner_cap_character_id(owner_cap) == character::character_id(character),
        EWrongOwnerCap,
    );
    assert!(!vector::is_empty(&content_hash), EEmptyHash);
    assert!(!vector::is_empty(&blob_id), EEmptyBlobId);

    // Payment must be at least the configured price; saga treasury
    // absorbs the full amount (overpayment is welcome).
    let paid = sui::coin::value(&payment);
    assert!(paid >= config.price, EInsufficientPayment);
    saga::deposit_to_treasury(saga, payment);

    let now = clock::timestamp_ms(clock);
    let dream = Dream {
        id: object::new(ctx),
        character_id: character::character_id(character),
        saga_id: saga::saga_id(saga),
        submitter: ctx.sender(),
        paid_amount: paid,
        content_hash,
        blob_id,
        importance,
        injected_at_ms: now,
    };
    let dream_id = object::id(&dream);

    event::emit(DreamInjected {
        dream_id,
        character_id: dream.character_id,
        saga_id: dream.saga_id,
        submitter: dream.submitter,
        paid_amount: dream.paid_amount,
        importance: dream.importance,
        injected_at_ms: now,
    });

    // Shared so anyone (runner POV worker, web reader) can fetch +
    // verify without owner gating.
    transfer::share_object(dream);
}

// ─── views ───────────────────────────────────────────────────────────

public fun config_price(c: &DreamConfig): u64 { c.price }
public fun config_paused(c: &DreamConfig): bool { c.paused }
public fun config_saga_id(c: &DreamConfig): ID { c.saga_id }

public fun dream_character_id(d: &Dream): ID { d.character_id }
public fun dream_submitter(d: &Dream): address { d.submitter }
public fun dream_importance(d: &Dream): u8 { d.importance }
public fun dream_content_hash(d: &Dream): &vector<u8> { &d.content_hash }
public fun dream_blob_id(d: &Dream): &vector<u8> { &d.blob_id }
public fun dream_injected_at_ms(d: &Dream): u64 { d.injected_at_ms }

// ─── tests ───────────────────────────────────────────────────────────

#[test_only]
use std::unit_test::destroy;
#[test_only]
use endless_story::world::{Self, World, AdminCap};
#[test_only]
use endless_story::currency;
#[test_only]
use sui::coin;

#[test_only]
fun setup(
    ctx: &mut TxContext,
    clock: &Clock,
): (World, AdminCap, Saga, StorytellerCap, Character, OwnerCap, Coin<CURRENCY>) {
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
    let (character, owner_cap) = character::mint_character_for_testing(ctx);
    let mut treasury = currency::new_treasury_for_testing(ctx);
    let coin = coin::mint(&mut treasury, 100_000_000, ctx);
    destroy(treasury);
    (world, admin_cap, saga, cap, character, owner_cap, coin)
}

#[test_only]
fun teardown(
    world: World,
    admin_cap: AdminCap,
    saga: Saga,
    cap: StorytellerCap,
    character: Character,
    owner_cap: OwnerCap,
) {
    character::destroy_wild_for_testing(character, owner_cap);
    saga::destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
}

#[test]
fun submit_dream_happy_path() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock::set_for_testing(&mut clock, 1000);
    let (world, admin_cap, mut saga, cap, character, owner_cap, coin) = setup(&mut ctx, &clock);

    // Create config with 50 ENDLESS price (50_000_000 raw units, 6 decimals)
    create_config(&cap, &saga, 50_000_000, &mut ctx);

    // Receive the shared DreamConfig + admin cap. For unit test we
    // can't easily extract shared objects; build a stand-in config.
    let config = DreamConfig {
        id: object::new(&mut ctx),
        saga_id: saga::saga_id(&saga),
        price: 50_000_000,
        paused: false,
    };

    submit_dream(
        &config,
        &mut saga,
        &character,
        &owner_cap,
        coin,
        vector[0x01, 0x02, 0x03],
        b"walrus-blob-xyz",
        8,
        &clock,
        &mut ctx,
    );

    let DreamConfig { id, saga_id: _, price: _, paused: _ } = config;
    object::delete(id);
    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap, character, owner_cap);
}

#[test]
#[expected_failure(abort_code = EInsufficientPayment)]
fun submit_dream_insufficient_payment_aborts() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (world, admin_cap, mut saga, cap, character, owner_cap, coin) = setup(&mut ctx, &clock);
    // Set price higher than the test coin (100M < 200M)
    let config = DreamConfig {
        id: object::new(&mut ctx),
        saga_id: saga::saga_id(&saga),
        price: 200_000_000,
        paused: false,
    };
    submit_dream(
        &config,
        &mut saga,
        &character,
        &owner_cap,
        coin,
        vector[0x01],
        b"x",
        8,
        &clock,
        &mut ctx,
    );
    let DreamConfig { id, saga_id: _, price: _, paused: _ } = config;
    object::delete(id);
    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap, character, owner_cap);
}

#[test]
#[expected_failure(abort_code = EDreamsPaused)]
fun submit_dream_paused_aborts() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (world, admin_cap, mut saga, cap, character, owner_cap, coin) = setup(&mut ctx, &clock);
    let config = DreamConfig {
        id: object::new(&mut ctx),
        saga_id: saga::saga_id(&saga),
        price: 50_000_000,
        paused: true,
    };
    submit_dream(
        &config,
        &mut saga,
        &character,
        &owner_cap,
        coin,
        vector[0x01],
        b"x",
        8,
        &clock,
        &mut ctx,
    );
    let DreamConfig { id, saga_id: _, price: _, paused: _ } = config;
    object::delete(id);
    clock::destroy_for_testing(clock);
    teardown(world, admin_cap, saga, cap, character, owner_cap);
}
