/// Recruitment — voucher-driven character mint.
///
/// Two-step recruitment flow:
///   1. **Mint voucher**: any address pays ENDLESS into a Saga's treasury
///      via `mint_genesis_voucher`. Receives a `GenesisVoucher` object
///      (transferrable, expires after TTL).
///   2. **Redeem voucher**: the voucher holder hands it to the saga's
///      storyteller, who co-signs `redeem_voucher_to_character`. The
///      Character + OwnerCap + ControlCap are minted; voucher is consumed.
///      Owner_recipient is fixed to `voucher.payer` — storyteller cannot
///      redirect ownership.
///
/// **Design rationale**: separating the payment step from the mint step
/// lets the off-chain generator preview character stats from
/// `attribute_seed` before the storyteller commits. If the preview is
/// rejected, the voucher can be left to expire (refund mechanic — Phase 2;
/// for now, ENDLESS sits in the saga treasury as the cost of preview).
///
/// **Phase 1.5a (prior)** shipped voucher half. **Phase 1.5b (now)** adds
/// the wild→saga `JoinIntent` flow: owner of a wild character mints a
/// shared `JoinIntent` pointing at a target saga; storyteller of that
/// saga consumes it via `accept_character_into_saga`.
///
/// See AGENTS.md → 「鏈上架構」.
module endless_story::recruit;

use std::string::String;
use sui::clock;
use sui::coin::Coin;
use sui::display;
use sui::event;
use sui::package;

use endless_story::character::{Self, AttributeValue, Character, CharacterProfile, ControlCap, MediaAsset, OwnerCap};
use endless_story::currency::CURRENCY;
use endless_story::saga::{Self, Saga, StorytellerCap};
use endless_story::scene::{Self, Scene};
use endless_story::world::{Self, World};

// ─── errors ──────────────────────────────────────────────────────────

#[error]
const EVoucherSagaMismatch: vector<u8> = b"Voucher was issued for a different Saga";

#[error]
const EVoucherExpired: vector<u8> = b"Voucher TTL has elapsed";

#[error]
const EWorldSagaMismatch: vector<u8> = b"Saga does not belong to the given World";

#[error]
const ESceneSagaMismatch: vector<u8> = b"Scene does not belong to the given Saga";

#[error]
const EInvalidTtl: vector<u8> = b"TTL must be > 0";

// ─── errors added in 1.5b (JoinIntent) ───────────────────────────────

#[error]
const EIntentSagaMismatch: vector<u8> = b"JoinIntent target_saga does not match this saga";

#[error]
const EIntentCharacterMismatch: vector<u8> = b"JoinIntent character_id does not match the given Character";

#[error]
const EIntentExpired: vector<u8> = b"JoinIntent TTL has elapsed";

#[error]
const EWrongOwnerCap: vector<u8> = b"OwnerCap does not own this Character";

// ─── errors added in 1.5c ────────────────────────────────────────────

#[error]
const EReqsNotMet: vector<u8> = b"Proposed profile/attributes do not satisfy voucher requirements";

#[error]
const EReqsKeysMismatch: vector<u8> = b"required_attribute_keys and required_attribute_mins must have equal length";

// ─── one-time witness (Display V2) ───────────────────────────────────

public struct RECRUIT has drop {}

// ─── voucher requirements (1.5c — Q1 hybrid) ─────────────────────────

/// Structured requirements that the storyteller's proposed character must
/// satisfy at `redeem_voucher_to_character` time. Enforced on-chain.
///
/// **What's structured (enforced here):**
///   - allowed genders / species (empty = any)
///   - min/max age (0 = no check)
///   - per-attribute minimum values
///
/// **What's NOT structured (stays in `intent_hint`):**
///   - qualitative descriptors like "氣質清冷", "適合演武小生" — these
///     remain natural language for the storyteller LLM + payer to negotiate
///     off-chain. The on-chain hint is just text the storyteller sees.
///
/// `required_attribute_keys` and `required_attribute_mins` are parallel
/// vectors (keys[i] must be >= mins[i]). Use `new_voucher_requirements`
/// constructor to enforce length parity at compile-callsite.
public struct VoucherRequirements has copy, drop, store {
    allowed_genders: vector<String>,
    allowed_species: vector<String>,
    min_age: u8,
    max_age: u8,
    required_attribute_keys: vector<String>,
    required_attribute_mins: vector<u64>,
}

// ─── voucher resource ────────────────────────────────────────────────

/// Tradable preview ticket: payer pays ENDLESS to a saga treasury and
/// receives this object. The off-chain attribute generator (seeded by
/// `attribute_seed`) shows them a preview character; if they accept, they
/// hand the voucher to the saga storyteller who calls
/// `redeem_voucher_to_character` to mint the real Character.
///
/// `payer` is fixed at mint time — even if the voucher is transferred to
/// someone else, redemption mints the character's OwnerCap to the original
/// payer's address. This prevents storyteller front-running.
///
/// `requirements` is checked on `redeem_voucher_to_character`. Use
/// `no_requirements()` for unrestricted vouchers.
/// `intent_hint` is natural-language guidance for storyteller LLM
/// (role intent like "武小生" / "清貧書生"), not enforced on chain.
public struct GenesisVoucher has key, store {
    id: UID,
    saga_id: ID,
    payer: address,
    paid_amount: u64,
    attribute_seed: vector<u8>,
    hint: Option<String>,
    requirements: VoucherRequirements,
    intent_hint: Option<String>,
    minted_at_ms: u64,
    expires_at_ms: u64,
}

// ─── events ──────────────────────────────────────────────────────────

public struct GenesisVoucherMinted has copy, drop {
    voucher_id: ID,
    saga_id: ID,
    payer: address,
    paid_amount: u64,
    expires_at_ms: u64,
    /// Caller-supplied tag (e.g. off-chain recruitment id) so indexers
    /// can group vouchers by their originating campaign without reading
    /// the voucher object.
    hint: Option<String>,
    /// Natural-language role intent. Echoed in event for the same
    /// indexing convenience.
    intent_hint: Option<String>,
}

public struct GenesisVoucherRedeemed has copy, drop {
    voucher_id: ID,
    saga_id: ID,
    character_id: ID,
    redeemed_at_ms: u64,
    /// Carried over from the consumed voucher so capacity-tracking
    /// can be done by joining MintedEvent ∩ RedeemedEvent on
    /// `voucher_id`, then aggregating by `hint`. Without this, the
    /// voucher object is destroyed before redeem-time readers can see
    /// the hint.
    hint: Option<String>,
    intent_hint: Option<String>,
}

// ─── init (Display V2) ───────────────────────────────────────────────

fun init(otw: RECRUIT, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);

    let mut voucher_display = display::new_with_fields<GenesisVoucher>(
        &publisher,
        vector[b"name".to_string(), b"description".to_string()],
        vector[
            b"Genesis Voucher".to_string(),
            b"Recruitment voucher for saga {saga_id}, paid {paid_amount}".to_string(),
        ],
        ctx,
    );
    display::update_version(&mut voucher_display);

    let mut intent_display = display::new_with_fields<JoinIntent>(
        &publisher,
        vector[b"name".to_string(), b"description".to_string()],
        vector[
            b"Join Intent".to_string(),
            b"Character {character_id} offered to saga {target_saga_id}".to_string(),
        ],
        ctx,
    );
    display::update_version(&mut intent_display);

    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(voucher_display, ctx.sender());
    transfer::public_transfer(intent_display, ctx.sender());
}

// ─── requirements constructors + check ───────────────────────────────

/// "No restrictions" — typical for permissionless recruit vouchers.
public fun no_requirements(): VoucherRequirements {
    VoucherRequirements {
        allowed_genders: vector[],
        allowed_species: vector[],
        min_age: 0,
        max_age: 0,
        required_attribute_keys: vector[],
        required_attribute_mins: vector[],
    }
}

/// Construct a VoucherRequirements value. Asserts parallel-vector length
/// parity so the caller can't accidentally feed mismatched (keys, mins).
public fun new_voucher_requirements(
    allowed_genders: vector<String>,
    allowed_species: vector<String>,
    min_age: u8,
    max_age: u8,
    required_attribute_keys: vector<String>,
    required_attribute_mins: vector<u64>,
): VoucherRequirements {
    assert!(
        vector::length(&required_attribute_keys) == vector::length(&required_attribute_mins),
        EReqsKeysMismatch,
    );
    VoucherRequirements {
        allowed_genders,
        allowed_species,
        min_age,
        max_age,
        required_attribute_keys,
        required_attribute_mins,
    }
}

/// Pure view: does the proposed (profile, attributes) satisfy `voucher.requirements`?
/// Frontends/SDK should call this before signing redeem to avoid wasting gas
/// on assertions. Returns false on any failed check.
public fun check_voucher_requirements(
    voucher: &GenesisVoucher,
    profile: &CharacterProfile,
    attributes: &vector<AttributeValue>,
): bool {
    let reqs = &voucher.requirements;
    let facts = character::physical_facts(profile);

    // Gender (empty allowed_genders = no check)
    if (!vector::is_empty(&reqs.allowed_genders)) {
        if (!reqs.allowed_genders.contains(character::physical_gender(facts))) return false;
    };
    // Species (empty allowed_species = no check; world rules already screened)
    if (!vector::is_empty(&reqs.allowed_species)) {
        if (!reqs.allowed_species.contains(character::physical_species(facts))) return false;
    };

    let age = character::physical_age_years(facts);
    if (reqs.min_age > 0 && age < reqs.min_age) return false;
    if (reqs.max_age > 0 && age > reqs.max_age) return false;

    // Attribute mins
    let n = vector::length(&reqs.required_attribute_keys);
    let mut i = 0;
    while (i < n) {
        let req_key = vector::borrow(&reqs.required_attribute_keys, i);
        let req_min = *vector::borrow(&reqs.required_attribute_mins, i);
        let actual_opt = character::find_attribute_value_in(attributes, req_key);
        if (actual_opt.is_none()) return false;
        if (*actual_opt.borrow() < req_min) return false;
        i = i + 1;
    };

    true
}

// ─── mint voucher ────────────────────────────────────────────────────

/// Pay ENDLESS into the saga treasury; receive a `GenesisVoucher`.
/// Payer = ctx.sender(). Storyteller does NOT need to sign this step —
/// vouchers are permissionlessly mintable as long as you can pay.
///
/// `requirements`: structured constraints enforced on redeem. Pass
/// `no_requirements()` if any character is acceptable.
/// `intent_hint`: optional natural-language role intent ("武小生").
public fun mint_genesis_voucher(
    saga: &mut Saga,
    payment: Coin<CURRENCY>,
    attribute_seed: vector<u8>,
    hint: Option<String>,
    requirements: VoucherRequirements,
    intent_hint: Option<String>,
    ttl_ms: u64,
    clock: &clock::Clock,
    ctx: &mut TxContext,
): GenesisVoucher {
    assert!(ttl_ms > 0, EInvalidTtl);
    let now_ms = clock::timestamp_ms(clock);
    let amount = saga::deposit_to_treasury(saga, payment);

    let voucher = GenesisVoucher {
        id: object::new(ctx),
        saga_id: saga::saga_id(saga),
        payer: ctx.sender(),
        paid_amount: amount,
        attribute_seed,
        hint,
        requirements,
        intent_hint,
        minted_at_ms: now_ms,
        expires_at_ms: now_ms + ttl_ms,
    };
    event::emit(GenesisVoucherMinted {
        voucher_id: object::id(&voucher),
        saga_id: voucher.saga_id,
        payer: voucher.payer,
        paid_amount: amount,
        expires_at_ms: voucher.expires_at_ms,
        hint: voucher.hint,
        intent_hint: voucher.intent_hint,
    });
    voucher
}

// ─── redeem voucher → character ──────────────────────────────────────

/// Storyteller co-signs to mint the actual Character, consuming the
/// voucher. `owner_recipient` is **fixed** to `voucher.payer` — the person
/// who paid is the only legitimate owner of the resulting Character.
/// Storyteller cannot redirect ownership.
///
/// Aborts if voucher's saga != target saga, or if voucher expired, or if
/// world/scene don't match the saga (sanity), or if profile/attributes
/// fail `character::mint_character_internal`'s validation.
public fun redeem_voucher_to_character(
    cap: &StorytellerCap,
    saga: &mut Saga,
    world: &World,
    scene: &mut Scene,
    voucher: GenesisVoucher,
    profile: CharacterProfile,
    media_assets: vector<MediaAsset>,
    attributes: vector<AttributeValue>,
    clock: &clock::Clock,
    ctx: &mut TxContext,
): ControlCap {
    saga::assert_cap(cap, saga);
    let saga_id = saga::saga_id(saga);
    assert!(voucher.saga_id == saga_id, EVoucherSagaMismatch);

    let now_ms = clock::timestamp_ms(clock);
    assert!(now_ms <= voucher.expires_at_ms, EVoucherExpired);
    assert!(world::world_id(world) == saga::world_id(saga), EWorldSagaMismatch);
    assert!(scene::saga_id(scene) == saga_id, ESceneSagaMismatch);
    assert!(
        check_voucher_requirements(&voucher, &profile, &attributes),
        EReqsNotMet,
    );

    let owner_recipient = voucher.payer;
    let scene_id = scene::scene_id(scene);
    let scene_location_id = scene::location_id(scene);

    // mint_character_internal transfers the OwnerCap straight to
    // `owner_recipient` (= voucher.payer) on-chain, so the co-signing
    // storyteller can never keep or redirect the buyer's ownership. We get
    // back only the character id (for bookkeeping) + the ControlCap.
    let (character_id, control_cap) = character::mint_character_internal(
        world,
        option::some(saga_id),
        option::some(scene_id),
        option::some(scene_location_id),
        profile,
        media_assets,
        attributes,
        owner_recipient,
        now_ms,
        ctx,
    );

    scene::add_character(scene, character_id);
    saga::increment_character_count(saga);

    let voucher_id = object::id(&voucher);
    let GenesisVoucher {
        id,
        saga_id: _,
        payer: _,
        paid_amount: _,
        attribute_seed: _,
        hint,
        requirements: _,
        intent_hint,
        minted_at_ms: _,
        expires_at_ms: _,
    } = voucher;
    id.delete();

    event::emit(GenesisVoucherRedeemed {
        voucher_id,
        saga_id,
        character_id,
        redeemed_at_ms: now_ms,
        hint,
        intent_hint,
    });

    control_cap
}

// ─── views ───────────────────────────────────────────────────────────

public fun voucher_saga_id(voucher: &GenesisVoucher): ID { voucher.saga_id }

public fun voucher_payer(voucher: &GenesisVoucher): address { voucher.payer }

public fun voucher_paid_amount(voucher: &GenesisVoucher): u64 { voucher.paid_amount }

public fun voucher_attribute_seed(voucher: &GenesisVoucher): &vector<u8> {
    &voucher.attribute_seed
}

public fun voucher_hint(voucher: &GenesisVoucher): &Option<String> { &voucher.hint }

public fun voucher_minted_at_ms(voucher: &GenesisVoucher): u64 { voucher.minted_at_ms }

public fun voucher_expires_at_ms(voucher: &GenesisVoucher): u64 { voucher.expires_at_ms }

public fun voucher_requirements(voucher: &GenesisVoucher): &VoucherRequirements {
    &voucher.requirements
}

public fun voucher_intent_hint(voucher: &GenesisVoucher): &Option<String> {
    &voucher.intent_hint
}

// VoucherRequirements field accessors (for SDK reads).
public fun reqs_allowed_genders(reqs: &VoucherRequirements): &vector<String> {
    &reqs.allowed_genders
}

public fun reqs_allowed_species(reqs: &VoucherRequirements): &vector<String> {
    &reqs.allowed_species
}

public fun reqs_min_age(reqs: &VoucherRequirements): u8 { reqs.min_age }

public fun reqs_max_age(reqs: &VoucherRequirements): u8 { reqs.max_age }

public fun reqs_required_attribute_keys(reqs: &VoucherRequirements): &vector<String> {
    &reqs.required_attribute_keys
}

public fun reqs_required_attribute_mins(reqs: &VoucherRequirements): &vector<u64> {
    &reqs.required_attribute_mins
}

// ─── JoinIntent (1.5b) ───────────────────────────────────────────────

/// Owner-signed offer for a saga to take custody of a wild character.
/// Shared on creation so any storyteller of `target_saga_id` can claim it.
///
/// **Multiple JoinIntents may exist** for the same character pointing at
/// different sagas (shop around). First storyteller to consume wins;
/// later attempts find the character no longer wild and abort. Owner can
/// revoke an unused intent via `revoke_join_intent`.
public struct JoinIntent has key {
    id: UID,
    character_id: ID,
    target_saga_id: ID,
    expires_at_ms: u64,
    minted_at_ms: u64,
}

public struct JoinIntentMinted has copy, drop {
    intent_id: ID,
    character_id: ID,
    target_saga_id: ID,
    expires_at_ms: u64,
}

public struct JoinIntentConsumed has copy, drop {
    intent_id: ID,
    character_id: ID,
    target_saga_id: ID,
    consumed_at_ms: u64,
}

public struct JoinIntentRevoked has copy, drop {
    intent_id: ID,
    character_id: ID,
}

/// Owner publishes a shared JoinIntent offering this wild character to a
/// specific saga. Owner-signed; shares the intent object so any
/// storyteller of `target_saga_id` can pick it up.
///
/// Caller responsibility: confirm `character.state.saga_id == None`
/// before calling (the assertion inside enforces this — wild only).
public fun request_join_saga(
    owner_cap: &OwnerCap,
    character: &Character,
    target_saga_id: ID,
    ttl_ms: u64,
    clock: &clock::Clock,
    ctx: &mut TxContext,
) {
    assert!(character::owner_cap_character_id(owner_cap) == character::character_id(character), EWrongOwnerCap);
    assert!(character::saga_id(character).is_none(), EIntentCharacterMismatch);
    assert!(!character::is_dead(character), EIntentCharacterMismatch);
    assert!(ttl_ms > 0, EInvalidTtl);

    let now = clock::timestamp_ms(clock);
    let intent = JoinIntent {
        id: object::new(ctx),
        character_id: character::character_id(character),
        target_saga_id,
        expires_at_ms: now + ttl_ms,
        minted_at_ms: now,
    };
    event::emit(JoinIntentMinted {
        intent_id: object::id(&intent),
        character_id: intent.character_id,
        target_saga_id,
        expires_at_ms: intent.expires_at_ms,
    });
    transfer::share_object(intent);
}

/// Owner takes back an unused JoinIntent. Validates ownership; consumes
/// the intent (key-only shared object burned by-value).
public fun revoke_join_intent(owner_cap: &OwnerCap, intent: JoinIntent) {
    assert!(
        character::owner_cap_character_id(owner_cap) == intent.character_id,
        EIntentCharacterMismatch,
    );
    let intent_id = object::id(&intent);
    let JoinIntent {
        id,
        character_id,
        target_saga_id: _,
        expires_at_ms: _,
        minted_at_ms: _,
    } = intent;
    event::emit(JoinIntentRevoked { intent_id, character_id });
    id.delete();
}

/// Saga storyteller consumes a JoinIntent to take custody of a wild
/// character. Dual-sign: `cap` proves authority over the target saga;
/// `intent` proves owner consent for THIS saga. Pulls the ControlCap out
/// of the character's DOF (set during `release_character_to_wild`),
/// rebinds its `saga_id`, returns the cap to the storyteller. Character
/// placed in `target_scene`.
///
/// Aborts on: intent saga mismatch, intent character mismatch, intent
/// expired, target_scene in different saga, character no longer wild,
/// character dead.
public fun accept_character_into_saga(
    cap: &StorytellerCap,
    saga: &mut Saga,
    target_scene: &mut Scene,
    character: &mut Character,
    intent: JoinIntent,
    clock: &clock::Clock,
): ControlCap {
    saga::assert_cap(cap, saga);
    let saga_id = saga::saga_id(saga);
    let now = clock::timestamp_ms(clock);

    assert!(intent.target_saga_id == saga_id, EIntentSagaMismatch);
    assert!(intent.character_id == character::character_id(character), EIntentCharacterMismatch);
    assert!(now <= intent.expires_at_ms, EIntentExpired);
    assert!(scene::saga_id(target_scene) == saga_id, ESceneSagaMismatch);

    let intent_id = object::id(&intent);
    let JoinIntent {
        id,
        character_id,
        target_saga_id: _,
        expires_at_ms: _,
        minted_at_ms: _,
    } = intent;
    id.delete();

    // Extract the self-held cap (asserts wild + not dead inside).
    let mut control_cap = character::take_wild_control_cap(character);

    // Bind character state + cap.saga_id; emit CharacterAcceptedIntoSaga.
    let scene_id = scene::scene_id(target_scene);
    let scene_location_id = scene::location_id(target_scene);
    character::bind_to_saga(character, saga_id, scene_id, scene_location_id, &mut control_cap, clock);

    // Saga-side bookkeeping.
    scene::add_character(target_scene, character_id);
    saga::increment_character_count(saga);

    event::emit(JoinIntentConsumed {
        intent_id,
        character_id,
        target_saga_id: saga_id,
        consumed_at_ms: now,
    });

    control_cap
}

// ─── JoinIntent views ────────────────────────────────────────────────

public fun intent_character_id(intent: &JoinIntent): ID { intent.character_id }

public fun intent_target_saga_id(intent: &JoinIntent): ID { intent.target_saga_id }

public fun intent_minted_at_ms(intent: &JoinIntent): u64 { intent.minted_at_ms }

public fun intent_expires_at_ms(intent: &JoinIntent): u64 { intent.expires_at_ms }

// ─── tests ───────────────────────────────────────────────────────────

#[test_only]
use endless_story::currency;
#[test_only]
use sui::coin;
#[test_only]
use std::unit_test::{assert_eq, destroy};

#[test_only]
fun setup_world_saga_scene(
    ctx: &mut TxContext,
    clock: &clock::Clock,
): (World, world::AdminCap, Saga, StorytellerCap, Scene) {
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(
            vector[b"human".to_string()],
            vector[world::new_attribute_definition(
                b"will".to_string(),
                b"Will".to_string(),
                0,
                100,
            )],
        ),
        1000,
        ctx,
    );
    let location = world::new_location_for_testing(
        &admin_cap,
        &mut world,
        world::new_location_info(0, b"L".to_string(), b"l".to_string(), b"i".to_string()),
        world::new_position(0, 0),
        world::new_location_graph(vector[]),
        1001,
        ctx,
    );
    let (mut saga, cap) = saga::new_saga_for_testing(
        &mut world,
        saga::kind_standard(),
        b"S".to_string(),
        b"s".to_string(),
        b"u".to_string(),
        4000,
        5000,
        1000,
        vector[world::location_id(&location)],
        @0xA,
        1002,
        clock,
        ctx,
    );
    let scene = scene::new_scene_for_testing(
        &cap,
        &mut saga,
        &location,
        scene::new_scene_info(
            b"Scene".to_string(),
            b"d".to_string(),
            b"m".to_string(),
        ),
        scene::new_scene_access(0),
        100,
        100,
        scene::new_scene_params(500, 300, 200),
        vector[],
        1003,
        ctx,
    );
    world::destroy_location_for_testing(location);
    (world, admin_cap, saga, cap, scene)
}

#[test_only]
fun cleanup_world_saga(
    world: World,
    admin_cap: world::AdminCap,
    saga: Saga,
    storyteller_cap: StorytellerCap,
) {
    saga::destroy_saga_for_testing(saga, storyteller_cap);
    world::destroy_world_for_testing(world, admin_cap);
}

#[test_only]
fun sample_profile(): CharacterProfile {
    character::new_character_profile(
        b"Test Character".to_string(),
        b"".to_string(),
        character::new_physical_facts(
            b"human".to_string(),
            b"unspecified".to_string(),
            b"".to_string(),
            25,
        ),
    )
}

#[test_only]
fun sample_attributes(): vector<AttributeValue> {
    vector[character::new_attribute_value(b"will".to_string(), 80, vector[1, 2, 3])]
}

#[test]
fun mint_voucher_deposits_payment_and_emits() {
    let mut ctx = tx_context::dummy();
    let mut clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, mut saga, storyteller_cap, scene) = setup_world_saga_scene(
        &mut ctx,
        &clock,
    );

    let mut treasury_cap = currency::new_treasury_for_testing(&mut ctx);
    let payment = coin::mint(&mut treasury_cap, 5_000, &mut ctx);

    let voucher = mint_genesis_voucher(
        &mut saga,
        payment,
        vector[42, 43, 44],
        option::none(),
        no_requirements(),
        option::none(),
        60_000, // 60s TTL
        &clock,
        &mut ctx,
    );

    assert_eq!(voucher_paid_amount(&voucher), 5_000);
    assert_eq!(saga::treasury_balance(&saga), 5_000);
    assert!(voucher_expires_at_ms(&voucher) > voucher_minted_at_ms(&voucher));

    destroy(voucher);
    destroy(treasury_cap);
    destroy(scene);
    cleanup_world_saga(world, admin_cap, saga, storyteller_cap);
    clock.destroy_for_testing();
}

#[test]
fun redeem_voucher_mints_character_and_consumes_voucher() {
    let mut ctx = tx_context::dummy();
    let mut clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, mut saga, storyteller_cap, mut scene) = setup_world_saga_scene(
        &mut ctx,
        &clock,
    );

    let mut treasury_cap = currency::new_treasury_for_testing(&mut ctx);
    let payment = coin::mint(&mut treasury_cap, 3_000, &mut ctx);
    let voucher = mint_genesis_voucher(
        &mut saga,
        payment,
        vector[],
        option::none(),
        no_requirements(),
        option::none(),
        60_000,
        &clock,
        &mut ctx,
    );

    let chars_before = saga::character_count(&saga);
    // OwnerCap is now transferred on-chain to voucher.payer; redeem returns
    // only the ControlCap. (The payer-receipt can't be re-fetched here
    // without test_scenario, so we assert on character_count + the cap epoch.)
    let control_cap = redeem_voucher_to_character(
        &storyteller_cap,
        &mut saga,
        &world,
        &mut scene,
        voucher,
        sample_profile(),
        vector[],
        sample_attributes(),
        &clock,
        &mut ctx,
    );

    assert_eq!(saga::character_count(&saga), chars_before + 1);
    assert!(character::control_cap_epoch(&control_cap) == 1);

    destroy(control_cap);
    destroy(treasury_cap);
    destroy(scene);
    cleanup_world_saga(world, admin_cap, saga, storyteller_cap);
    clock.destroy_for_testing();
}

// --- 1.5b lifecycle tests ---
//
// These exercise request/revoke/accept on a wild Character built via the
// `make_wild_for_testing` helper in character.move (lets us bypass the
// full release_to_wild ceremony which needs shared-object scaffolding).

#[test]
fun revoke_join_intent_burns_intent() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);

    let (character, owner_cap) = character::make_wild_for_testing(&mut ctx);

    request_join_saga(
        &owner_cap,
        &character,
        sui::object::id_from_address(@0xFEED), // arbitrary target saga
        60_000,
        &clock,
        &mut ctx,
    );

    // We can't easily take the just-shared intent without test_scenario.
    // So instead, exercise revoke via a directly-constructed intent.
    let intent = JoinIntent {
        id: object::new(&mut ctx),
        character_id: character::character_id(&character),
        target_saga_id: sui::object::id_from_address(@0xFEED),
        expires_at_ms: 999_999,
        minted_at_ms: 0,
    };
    revoke_join_intent(&owner_cap, intent);
    // No assertion needed; if revoke succeeded, the intent was burned.

    destroy(character);
    destroy(owner_cap);
    clock.destroy_for_testing();
}

// --- 1.5c voucher requirements tests ---

#[test_only]
fun strict_requirements_male_will80(): VoucherRequirements {
    new_voucher_requirements(
        vector[b"male".to_string()],       // allowed_genders: only male
        vector[],                            // any species
        18,                                  // min_age 18
        0,                                   // no max age
        vector[b"will".to_string()],       // require "will" attribute
        vector[80],                          // min value 80
    )
}

#[test_only]
fun matching_profile(): CharacterProfile {
    character::new_character_profile(
        b"Match".to_string(),
        b"".to_string(),
        character::new_physical_facts(
            b"human".to_string(),
            b"male".to_string(),
            b"".to_string(),
            25, // satisfies min_age 18
        ),
    )
}

#[test_only]
fun matching_attributes(): vector<AttributeValue> {
    vector[character::new_attribute_value(b"will".to_string(), 90, vector[])]
}

#[test_only]
fun female_profile(): CharacterProfile {
    character::new_character_profile(
        b"Wrong".to_string(),
        b"".to_string(),
        character::new_physical_facts(
            b"human".to_string(),
            b"female".to_string(),
            b"".to_string(),
            25,
        ),
    )
}

#[test]
fun check_requirements_passes_when_all_match() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, mut saga, storyteller_cap, scene) = setup_world_saga_scene(
        &mut ctx,
        &clock,
    );
    let mut treasury_cap = currency::new_treasury_for_testing(&mut ctx);
    let payment = coin::mint(&mut treasury_cap, 100, &mut ctx);
    let voucher = mint_genesis_voucher(
        &mut saga,
        payment,
        vector[],
        option::none(),
        strict_requirements_male_will80(),
        option::some(b"武小生".to_string()),
        60_000,
        &clock,
        &mut ctx,
    );

    assert!(check_voucher_requirements(&voucher, &matching_profile(), &matching_attributes()));
    assert!(!check_voucher_requirements(&voucher, &female_profile(), &matching_attributes()));

    destroy(voucher);
    destroy(treasury_cap);
    destroy(scene);
    cleanup_world_saga(world, admin_cap, saga, storyteller_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = EReqsNotMet)]
fun redeem_aborts_when_requirements_unmet() {
    let mut ctx = tx_context::dummy();
    let mut clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, mut saga, storyteller_cap, mut scene) = setup_world_saga_scene(
        &mut ctx,
        &clock,
    );

    let mut treasury_cap = currency::new_treasury_for_testing(&mut ctx);
    let payment = coin::mint(&mut treasury_cap, 100, &mut ctx);
    let voucher = mint_genesis_voucher(
        &mut saga,
        payment,
        vector[],
        option::none(),
        strict_requirements_male_will80(),
        option::none(),
        60_000,
        &clock,
        &mut ctx,
    );

    // Try to redeem with a female profile → aborts EReqsNotMet.
    let control_cap = redeem_voucher_to_character(
        &storyteller_cap,
        &mut saga,
        &world,
        &mut scene,
        voucher,
        female_profile(),
        vector[],
        matching_attributes(),
        &clock,
        &mut ctx,
    );

    destroy(control_cap);
    destroy(treasury_cap);
    destroy(scene);
    cleanup_world_saga(world, admin_cap, saga, storyteller_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = EReqsKeysMismatch)]
fun new_requirements_with_mismatched_parallel_vectors_aborts() {
    let _ = new_voucher_requirements(
        vector[],
        vector[],
        0, 0,
        vector[b"a".to_string(), b"b".to_string()], // 2 keys
        vector[10],                                    // 1 min → mismatch
    );
}

#[test, expected_failure(abort_code = EIntentCharacterMismatch)]
fun revoke_with_wrong_owner_cap_aborts() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);

    let (character_a, owner_a) = character::make_wild_for_testing(&mut ctx);
    let (character_b, owner_b) = character::make_wild_for_testing(&mut ctx);

    // Intent points at character_a but owner_b tries to revoke → aborts.
    let intent = JoinIntent {
        id: object::new(&mut ctx),
        character_id: character::character_id(&character_a),
        target_saga_id: sui::object::id_from_address(@0xFEED),
        expires_at_ms: 999_999,
        minted_at_ms: 0,
    };
    revoke_join_intent(&owner_b, intent);

    destroy(character_a);
    destroy(owner_a);
    destroy(character_b);
    destroy(owner_b);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = EVoucherExpired)]
fun redeem_expired_voucher_aborts() {
    let mut ctx = tx_context::dummy();
    let mut clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, mut saga, storyteller_cap, mut scene) = setup_world_saga_scene(
        &mut ctx,
        &clock,
    );

    let mut treasury_cap = currency::new_treasury_for_testing(&mut ctx);
    let payment = coin::mint(&mut treasury_cap, 1_000, &mut ctx);
    let voucher = mint_genesis_voucher(
        &mut saga,
        payment,
        vector[],
        option::none(),
        no_requirements(),
        option::none(),
        1_000, // 1s TTL
        &clock,
        &mut ctx,
    );

    // Advance time past expiry.
    sui::clock::increment_for_testing(&mut clock, 2_000);

    let control_cap = redeem_voucher_to_character(
        &storyteller_cap,
        &mut saga,
        &world,
        &mut scene,
        voucher,
        sample_profile(),
        vector[],
        sample_attributes(),
        &clock,
        &mut ctx,
    ); // ← aborts EVoucherExpired

    destroy(control_cap);
    destroy(treasury_cap);
    destroy(scene);
    cleanup_world_saga(world, admin_cap, saga, storyteller_cap);
    clock.destroy_for_testing();
}
