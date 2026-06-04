/// Saga — a narrative arc anchored on a World, run by a Storyteller.
///
/// A `Saga` carries:
///   - identity (kind / name / description / metadata_uri / operator)
///   - economics (`RevenueConfig` owner/storyteller/treasury bps + `treasury` Balance<CURRENCY>)
///   - coverage (`covered_location_ids` + `anchor_scene_ids`)
///   - LLM hints (`departure_policy` / `nature_prompt` / `rhythm_hints`
///     free-form text — not enforced on-chain)
///   - per-saga DOF tables: card-weight rules (R3.2) and saga skill defs (R3.3)
///
/// **Caps:**
///   - `StorytellerCap` — saga operator; can cover locations, manage weights,
///     define skills, withdraw treasury.
///   - World's `AdminCap` (from world.move) — can mark this saga inactive.
///
/// **Reincarnation kind** — reserved for sagas that mint essence vouchers
/// from dead characters' memories (a different operational model than
/// Standard narrative sagas). Not exercised in Phase 1 but kept in the enum
/// so future deployments don't need a schema migration.
///
/// Phase 1.3 — depends on currency.move (Balance type) + world.move (World/Location/AdminCap).
module endless_story::saga;

use std::string::String;
use sui::balance::{Self, Balance};
use sui::clock;
use sui::coin::{Self, Coin};
use sui::display;
use sui::dynamic_field as df;
use sui::event;
use sui::package;

use endless_story::currency::CURRENCY;
use endless_story::world::{Self, AdminCap, Location, World};

// ─── errors ──────────────────────────────────────────────────────────

const EInvalidRevenueConfig: u64 = 1;
const ECapSagaMismatch: u64 = 2;
const ELocationAlreadyCovered: u64 = 3;
const ELocationWorldMismatch: u64 = 4;
const ECardWeightingNotEnabled: u64 = 5;
const ECardWeightingAlreadyEnabled: u64 = 6;
const ESagaAttributeKeyDuplicate: u64 = 7;
const ESagaAlreadyInactive: u64 = 8;
const EWorldAdminMismatch: u64 = 9;
const EInsufficientTreasury: u64 = 10;
const EInvalidWithdrawAmount: u64 = 11;
const ESagaAttributeRangeInvalid: u64 = 12;

const BPS_DENOMINATOR: u16 = 10_000;

// ─── one-time witness (for Display V2) ───────────────────────────────

/// One-time witness for Display V2 registration (this module).
public struct SAGA has drop {}

// ─── enums + value types ─────────────────────────────────────────────

/// Saga categorisation. `Standard` covers user-operated narrative sagas;
/// `Reincarnation` flags a saga whose storyteller mints essence vouchers
/// from dead characters' memories. Multiple Reincarnation sagas may
/// coexist (the project may operate one; third parties may run their own).
public enum SagaKind has copy, drop, store {
    Standard,
    Reincarnation,
}

/// One rule in a saga's card-draw policy: when a card's `intent` matches,
/// multiply its draw weight by the participating character's
/// `attribute_key` value × `bonus_per_point`. See L1 §5.3 / R3.2.
///
/// Effective per-card weight in `event::deal_participant_hand`:
///   weight = 100 (base)
///         + Σ matching_rule.bonus_per_point × char_attr(rule.attribute_key)
///
/// Default base = 100 means any participant always has a non-zero chance
/// of seeing every card; rules only tilt the distribution. On a 0–100
/// attribute scale, `bonus_per_point = 5` gives up to +500 weight
/// (~6× more likely than baseline).
public struct CardIntentWeight has copy, drop, store {
    intent: u8,
    attribute_key: String,
    bonus_per_point: u16,
}

/// DOF marker for the per-saga card-weight rule list. Absent DOF == card
/// weighting disabled (uniform draw, the R3.1a behavior). Storyteller calls
/// `enable_card_weighting` to attach an empty rule list, then
/// `set_card_weight_rule` to add specific rules.
public struct CardWeightTableKey has copy, drop, store {}

/// DOF marker for the per-saga skill attribute definitions. Absent DOF ==
/// saga has no extra skills beyond world's `attribute_definitions`.
/// Storyteller calls `define_saga_attribute` to start a saga-specific
/// skill table (e.g. a 戲班 may add 唱腔 / 身段 / 容色 on top of the world's
/// will/grace/charm). Card-weight rules can reference either world attrs
/// OR saga skills by key — lookup chain is "world attrs first, then saga
/// skills".
public struct SagaAttributeDefsKey has copy, drop, store {}

/// DOF marker for the per-saga contested-resource registry (drama engine). Absent DOF ==
/// saga has no on-chain resources yet. `resource::instantiate` calls `register_resource`
/// (same pattern as scenes via `add_anchor_scene`), so off-chain services can read the
/// saga's resource set directly from the object instead of replaying ResourceInstantiated
/// events. Append-only; mirrors SagaAttributeDefsKey — no Saga struct migration.
public struct SagaResourcesKey has copy, drop, store {}

public struct RevenueConfig has copy, drop, store {
    owner_bps: u16,
    storyteller_bps: u16,
    treasury_bps: u16,
}

// ─── caps + main resource ────────────────────────────────────────────

public struct StorytellerCap has key, store {
    id: UID,
    saga_id: ID,
}

public struct Saga has key {
    id: UID,
    world_id: ID,
    kind: SagaKind,
    is_active: bool,
    name: String,
    description: String,
    metadata_uri: String,
    operator: address,
    revenue_config: RevenueConfig,
    treasury: Balance<CURRENCY>,
    covered_location_ids: vector<ID>,
    anchor_scene_ids: vector<ID>,
    character_count: u64,
    /// Free-form natural language departure policy (L1 §4.3). The
    /// storyteller LLM reads this to decide how to dramatize a
    /// character's leave intent. Move does NOT enforce it on
    /// `transfer_character_control`; enforcement is social/reputation.
    departure_policy: String,
    /// Per-saga narrative DNA (F — saga soul). Free-form text the
    /// character/storyteller LLM layers on top of the genre baseline so
    /// different sagas read in distinct voices. Not enforced on-chain.
    /// `nature_prompt` = 事件氣質 (conflict type / narrative rhythm);
    /// `rhythm_hints` = 自然節律 (dawn warm-up / dusk curtain cues);
    /// `portrait_tone` = 畫風 (per-saga portrait art direction, used at
    /// recruitment so characters are rendered in this troupe's visual key).
    nature_prompt: String,
    rhythm_hints: String,
    portrait_tone: String,
    created_at_ms: u64,
}

// ─── events ──────────────────────────────────────────────────────────

public struct SagaCreated has copy, drop {
    saga_id: ID,
    world_id: ID,
    storyteller_cap_id: ID,
    kind: SagaKind,
    name: String,
    operator: address,
    created_at_ms: u64,
}

/// Admin flipped saga off. Characters are **not** auto-released here —
/// follow with `transfer_character_control` batch or `force_release_character`.
public struct SagaMarkedInactive has copy, drop {
    saga_id: ID,
    world_id: ID,
}

public struct AnchorSceneAdded has copy, drop {
    saga_id: ID,
    scene_id: ID,
}

public struct LocationCovered has copy, drop {
    saga_id: ID,
    location_id: ID,
}

public struct DeparturePolicyUpdated has copy, drop {
    saga_id: ID,
}

public struct SagaSoulUpdated has copy, drop {
    saga_id: ID,
}

public struct CardWeightingEnabled has copy, drop {
    saga_id: ID,
}

public struct CardWeightingDisabled has copy, drop {
    saga_id: ID,
}

public struct CardWeightRuleSet has copy, drop {
    saga_id: ID,
    intent: u8,
    attribute_key: String,
    bonus_per_point: u16,
}

public struct CardWeightRuleCleared has copy, drop {
    saga_id: ID,
    intent: u8,
    attribute_key: String,
}

public struct SagaAttributeDefined has copy, drop {
    saga_id: ID,
    key: String,
}

public struct SagaAttributeCleared has copy, drop {
    saga_id: ID,
    key: String,
}

public struct TreasuryDeposited has copy, drop {
    saga_id: ID,
    amount: u64,
    new_balance: u64,
}

public struct TreasuryWithdrawn has copy, drop {
    saga_id: ID,
    amount: u64,
    recipient: address,
    new_balance: u64,
    withdrawn_at_ms: u64,
}

// ─── init (Display V2) ───────────────────────────────────────────────

/// Display V2 registration. Runs once at package publish so Saga objects
/// surface a `name` / `description` / `image_url` in wallets and explorers.
fun init(otw: SAGA, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    let keys = vector[
        b"name".to_string(),
        b"description".to_string(),
        b"image_url".to_string(),
    ];
    let values = vector[
        b"{name}".to_string(),
        b"{description}".to_string(),
        b"{metadata_uri}".to_string(),
    ];
    let mut saga_display = display::new_with_fields<Saga>(&publisher, keys, values, ctx);
    display::update_version(&mut saga_display);
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(saga_display, ctx.sender());
}

// ─── saga lifecycle ──────────────────────────────────────────────────

public fun create_saga(
    world: &mut World,
    kind: SagaKind,
    name: String,
    description: String,
    metadata_uri: String,
    owner_bps: u16,
    storyteller_bps: u16,
    treasury_bps: u16,
    covered_location_ids: vector<ID>,
    departure_policy: String,
    nature_prompt: String,
    rhythm_hints: String,
    portrait_tone: String,
    clock: &clock::Clock,
    ctx: &mut TxContext,
): StorytellerCap {
    let config = new_revenue_config(owner_bps, storyteller_bps, treasury_bps);
    let created_at_ms = clock::timestamp_ms(clock);
    let world_id = world::world_id(world);
    // Validate caller-supplied coverage to the same standard `cover_location`
    // enforces (audit): every id must be a Location registered under THIS
    // world (kills foreign-world / non-existent ids), and no duplicates.
    let mut ci = 0;
    let cn = vector::length(&covered_location_ids);
    while (ci < cn) {
        let loc_id = *vector::borrow(&covered_location_ids, ci);
        assert!(world::is_location_registered(world, loc_id), ELocationWorldMismatch);
        let mut cj = ci + 1;
        while (cj < cn) {
            assert!(*vector::borrow(&covered_location_ids, cj) != loc_id, ELocationAlreadyCovered);
            cj = cj + 1;
        };
        ci = ci + 1;
    };
    let saga = Saga {
        id: object::new(ctx),
        world_id,
        kind,
        is_active: true,
        name,
        description,
        metadata_uri,
        operator: ctx.sender(),
        revenue_config: config,
        treasury: balance::zero<CURRENCY>(),
        covered_location_ids,
        anchor_scene_ids: vector[],
        character_count: 0,
        departure_policy,
        nature_prompt,
        rhythm_hints,
        portrait_tone,
        created_at_ms,
    };
    let saga_id = object::id(&saga);
    let cap = StorytellerCap { id: object::new(ctx), saga_id };
    let cap_id = object::id(&cap);

    world::register_saga(world, saga_id, clock);
    event::emit(SagaCreated {
        saga_id,
        world_id,
        storyteller_cap_id: cap_id,
        kind: saga.kind,
        name: saga.name,
        operator: ctx.sender(),
        created_at_ms,
    });

    transfer::share_object(saga);
    cap
}

/// Flip `Saga.is_active` to false when the world admin retires a saga shell.
/// Caller must still release characters separately (see SagaMarkedInactive
/// doc comment). is_active is a marker only — character/event entry paths
/// do NOT enforce it; enforcement is at the social / runner layer.
public fun mark_saga_inactive(admin_cap: &AdminCap, saga: &mut Saga) {
    assert!(world::admin_world_id(admin_cap) == saga.world_id, EWorldAdminMismatch);
    assert!(saga.is_active, ESagaAlreadyInactive);
    saga.is_active = false;
    event::emit(SagaMarkedInactive {
        saga_id: object::id(saga),
        world_id: saga.world_id,
    });
}

// ─── package-internal hooks ──────────────────────────────────────────

public(package) fun add_anchor_scene(saga: &mut Saga, scene_id: ID) {
    if (!saga.anchor_scene_ids.contains(&scene_id)) {
        vector::push_back(&mut saga.anchor_scene_ids, scene_id);
        event::emit(AnchorSceneAdded { saga_id: object::id(saga), scene_id });
    };
}

public(package) fun increment_character_count(saga: &mut Saga) {
    saga.character_count = saga.character_count + 1;
}

/// Drain a Coin<CURRENCY> payment into this saga's treasury. Returns the
/// amount deposited (callers may want it for events / analytics).
/// Package-only so unrelated modules can't quietly siphon balance.
public(package) fun deposit_to_treasury(saga: &mut Saga, payment: Coin<CURRENCY>): u64 {
    let amount = coin::value(&payment);
    balance::join(&mut saga.treasury, coin::into_balance(payment));
    event::emit(TreasuryDeposited {
        saga_id: object::id(saga),
        amount,
        new_balance: balance::value(&saga.treasury),
    });
    amount
}

// ─── treasury withdraw (Phase 1.3 addition) ──────────────────────────

/// Storyteller-controlled withdraw from `saga.treasury`. Pulls `amount`
/// base units of ENDLESS, wraps as a Coin, transfers to `recipient`.
///
/// New in Phase 1.3 (old repo's saga.move had `deposit_to_treasury` with
/// no symmetric withdraw — funds were one-way). Storyteller can now pay
/// out revenue splits / refund subscribers / fund event rewards.
public fun withdraw_from_treasury(
    cap: &StorytellerCap,
    saga: &mut Saga,
    amount: u64,
    recipient: address,
    clock: &clock::Clock,
    ctx: &mut TxContext,
) {
    assert_cap(cap, saga);
    assert!(amount > 0, EInvalidWithdrawAmount);
    assert!(balance::value(&saga.treasury) >= amount, EInsufficientTreasury);

    let withdrawn = balance::split(&mut saga.treasury, amount);
    let coin = coin::from_balance(withdrawn, ctx);
    transfer::public_transfer(coin, recipient);

    event::emit(TreasuryWithdrawn {
        saga_id: object::id(saga),
        amount,
        recipient,
        new_balance: balance::value(&saga.treasury),
        withdrawn_at_ms: clock::timestamp_ms(clock),
    });
}

/// Current treasury balance in ENDLESS base units. View, no cap required.
public fun treasury_balance(saga: &Saga): u64 { balance::value(&saga.treasury) }

// ─── location coverage ──────────────────────────────────────────────

/// Storyteller adds a Location to this saga's coverage list. Aborts on
/// duplicate (instead of silent no-op): covering twice usually signals
/// composer drift, easier to debug as an abort.
public fun cover_location(cap: &StorytellerCap, saga: &mut Saga, location: &Location) {
    assert_cap(cap, saga);
    assert!(world::location_world_id(location) == saga.world_id, ELocationWorldMismatch);
    let location_id = world::location_id(location);
    assert!(!saga.covered_location_ids.contains(&location_id), ELocationAlreadyCovered);
    vector::push_back(&mut saga.covered_location_ids, location_id);
    event::emit(LocationCovered { saga_id: object::id(saga), location_id });
}

// ─── departure policy (LLM hint) ─────────────────────────────────────

/// Replace this saga's departure policy text. Move does not enforce the
/// policy — it's natural-language guidance for the storyteller LLM.
/// Updating mid-saga is allowed (run different policies in different eras).
public fun set_saga_departure_policy(cap: &StorytellerCap, saga: &mut Saga, new_policy: String) {
    assert_cap(cap, saga);
    saga.departure_policy = new_policy;
    event::emit(DeparturePolicyUpdated { saga_id: object::id(saga) });
}

public fun departure_policy(saga: &Saga): &String { &saga.departure_policy }

// ─── saga soul (LLM hint — F) ────────────────────────────────────────

/// Replace this saga's narrative-DNA hints (F — saga soul). Like
/// `departure_policy`, these are natural-language guidance for the LLM,
/// not enforced by Move. The soul is read as a unit, so both are set
/// together — pass the current value to leave one unchanged. Updating
/// mid-saga is allowed (run different tonal eras).
public fun set_saga_soul(
    cap: &StorytellerCap,
    saga: &mut Saga,
    nature_prompt: String,
    rhythm_hints: String,
    portrait_tone: String,
) {
    assert_cap(cap, saga);
    saga.nature_prompt = nature_prompt;
    saga.rhythm_hints = rhythm_hints;
    saga.portrait_tone = portrait_tone;
    event::emit(SagaSoulUpdated { saga_id: object::id(saga) });
}

public fun nature_prompt(saga: &Saga): &String { &saga.nature_prompt }

public fun rhythm_hints(saga: &Saga): &String { &saga.rhythm_hints }

public fun portrait_tone(saga: &Saga): &String { &saga.portrait_tone }

public fun covered_location_count(saga: &Saga): u64 {
    vector::length(&saga.covered_location_ids)
}

public fun is_location_covered(saga: &Saga, location_id: ID): bool {
    saga.covered_location_ids.contains(&location_id)
}

// ─── card weighting (R3.2) ──────────────────────────────────────────

/// Attach an empty card-weight rule list as a dynamic field on the saga.
/// Required before any `set_card_weight_rule` call. Aborts if already
/// enabled (composer drift signal — easier to debug than silent no-op).
public fun enable_card_weighting(cap: &StorytellerCap, saga: &mut Saga) {
    assert_cap(cap, saga);
    assert!(!df::exists(&saga.id, CardWeightTableKey {}), ECardWeightingAlreadyEnabled);
    df::add<CardWeightTableKey, vector<CardIntentWeight>>(
        &mut saga.id,
        CardWeightTableKey {},
        vector[],
    );
    event::emit(CardWeightingEnabled { saga_id: object::id(saga) });
}

/// Detach the card-weight rule list (back to uniform draw). All rules are
/// discarded; no record kept. Aborts if not currently enabled.
public fun disable_card_weighting(cap: &StorytellerCap, saga: &mut Saga) {
    assert_cap(cap, saga);
    assert!(df::exists(&saga.id, CardWeightTableKey {}), ECardWeightingNotEnabled);
    let _: vector<CardIntentWeight> = df::remove(&mut saga.id, CardWeightTableKey {});
    event::emit(CardWeightingDisabled { saga_id: object::id(saga) });
}

/// Upsert a rule: replaces any existing rule with the same
/// (intent, attribute_key) tuple, otherwise appends. Aborts if weighting
/// is not enabled.
public fun set_card_weight_rule(
    cap: &StorytellerCap,
    saga: &mut Saga,
    intent: u8,
    attribute_key: String,
    bonus_per_point: u16,
) {
    assert_cap(cap, saga);
    assert!(df::exists(&saga.id, CardWeightTableKey {}), ECardWeightingNotEnabled);
    let table: &mut vector<CardIntentWeight> =
        df::borrow_mut(&mut saga.id, CardWeightTableKey {});
    let n = vector::length(table);
    let mut i = 0;
    let mut replaced = false;
    while (i < n) {
        let r = vector::borrow_mut(table, i);
        if (r.intent == intent && r.attribute_key == attribute_key) {
            r.bonus_per_point = bonus_per_point;
            replaced = true;
            break
        };
        i = i + 1;
    };
    if (!replaced) {
        vector::push_back(table, CardIntentWeight { intent, attribute_key, bonus_per_point });
    };
    event::emit(CardWeightRuleSet {
        saga_id: object::id(saga),
        intent,
        attribute_key,
        bonus_per_point,
    });
}

/// Remove the (intent, attribute_key) rule if present. No-op (no abort)
/// if the rule wasn't there — safe to call defensively.
public fun clear_card_weight_rule(
    cap: &StorytellerCap,
    saga: &mut Saga,
    intent: u8,
    attribute_key: String,
) {
    assert_cap(cap, saga);
    assert!(df::exists(&saga.id, CardWeightTableKey {}), ECardWeightingNotEnabled);
    let table: &mut vector<CardIntentWeight> =
        df::borrow_mut(&mut saga.id, CardWeightTableKey {});
    let n = vector::length(table);
    let mut i = 0;
    while (i < n) {
        let r = vector::borrow(table, i);
        if (r.intent == intent && r.attribute_key == attribute_key) {
            let _ = vector::remove(table, i);
            event::emit(CardWeightRuleCleared {
                saga_id: object::id(saga),
                intent,
                attribute_key,
            });
            return
        };
        i = i + 1;
    }
}

public fun card_weighting_enabled(saga: &Saga): bool {
    df::exists(&saga.id, CardWeightTableKey {})
}

/// Snapshot the saga's current weight rules. Returns empty vector when
/// card weighting is disabled — callers (e.g. `event::deal_*`) can treat
/// empty == uniform without a separate predicate.
public fun card_weight_rules(saga: &Saga): vector<CardIntentWeight> {
    if (df::exists(&saga.id, CardWeightTableKey {})) {
        *df::borrow<CardWeightTableKey, vector<CardIntentWeight>>(
            &saga.id,
            CardWeightTableKey {},
        )
    } else {
        vector[]
    }
}

public fun card_weight_intent(rule: &CardIntentWeight): u8 { rule.intent }

public fun card_weight_attribute_key(rule: &CardIntentWeight): &String { &rule.attribute_key }

public fun card_weight_bonus_per_point(rule: &CardIntentWeight): u16 { rule.bonus_per_point }

// ─── saga skill / attribute table (R3.3) ─────────────────────────────

/// Append a new saga-specific attribute definition. The table is
/// auto-attached on first call. Aborts if `key` is already defined (for
/// the same saga) so storytellers can't accidentally redefine what a skill
/// range means mid-game.
public fun define_saga_attribute(
    cap: &StorytellerCap,
    saga: &mut Saga,
    key: String,
    label: String,
    min_value: u64,
    max_value: u64,
) {
    assert_cap(cap, saga);
    // A skill range must be well-formed; an inverted range (min > max) makes
    // every value both fail-low and fail-high downstream (audit).
    assert!(min_value <= max_value, ESagaAttributeRangeInvalid);
    if (!df::exists(&saga.id, SagaAttributeDefsKey {})) {
        df::add<SagaAttributeDefsKey, vector<world::AttributeDefinition>>(
            &mut saga.id,
            SagaAttributeDefsKey {},
            vector[],
        );
    };
    let defs: &mut vector<world::AttributeDefinition> =
        df::borrow_mut(&mut saga.id, SagaAttributeDefsKey {});
    assert!(!world::is_key_defined(defs, &key), ESagaAttributeKeyDuplicate);
    let def = world::new_attribute_definition(key, label, min_value, max_value);
    let key_copy = *world::attribute_definition_key(&def);
    vector::push_back(defs, def);
    event::emit(SagaAttributeDefined { saga_id: object::id(saga), key: key_copy });
}

/// Remove a saga-specific attribute definition by key. No-op if missing.
/// Note: this does NOT clear existing character skills keyed under the
/// removed name — those become stale data on chain (still readable, just
/// no longer enforced or weighted).
public fun clear_saga_attribute(cap: &StorytellerCap, saga: &mut Saga, key: String) {
    assert_cap(cap, saga);
    if (!df::exists(&saga.id, SagaAttributeDefsKey {})) return;
    let defs: &mut vector<world::AttributeDefinition> =
        df::borrow_mut(&mut saga.id, SagaAttributeDefsKey {});
    let n = vector::length(defs);
    let mut i = 0;
    while (i < n) {
        if (world::attribute_definition_key(vector::borrow(defs, i)) == &key) {
            let _ = vector::remove(defs, i);
            event::emit(SagaAttributeCleared { saga_id: object::id(saga), key });
            return
        };
        i = i + 1;
    }
}

/// Snapshot of saga's own attribute definitions (empty if none).
/// `event::compute_card_weights` and `character::set_character_skill` both
/// look here when validating / resolving an attribute key.
public fun saga_attribute_defs(saga: &Saga): vector<world::AttributeDefinition> {
    if (df::exists(&saga.id, SagaAttributeDefsKey {})) {
        *df::borrow<SagaAttributeDefsKey, vector<world::AttributeDefinition>>(
            &saga.id,
            SagaAttributeDefsKey {},
        )
    } else {
        vector[]
    }
}

// ─── saga resource registry (drama engine, R-DR) ─────────────────────

/// Register a contested resource under this saga. Package-internal: called by
/// `resource::instantiate` (the same way `add_anchor_scene` is called by `scene::create`).
/// Idempotent on duplicate id. Auto-attaches the DOF on first call; absent DOF == no
/// resources. Append-only — no Saga struct field, no migration.
public(package) fun register_resource(saga: &mut Saga, resource_id: ID) {
    if (!df::exists(&saga.id, SagaResourcesKey {})) {
        df::add<SagaResourcesKey, vector<ID>>(&mut saga.id, SagaResourcesKey {}, vector[]);
    };
    let ids: &mut vector<ID> = df::borrow_mut(&mut saga.id, SagaResourcesKey {});
    if (!ids.contains(&resource_id)) {
        vector::push_back(ids, resource_id);
    };
}

/// Snapshot of the saga's registered resource ids (empty if none). Off-chain reads this to
/// discover the saga's contested resources without replaying ResourceInstantiated events.
public fun saga_resource_ids(saga: &Saga): vector<ID> {
    if (df::exists(&saga.id, SagaResourcesKey {})) {
        *df::borrow<SagaResourcesKey, vector<ID>>(&saga.id, SagaResourcesKey {})
    } else {
        vector[]
    }
}

// ─── cap verification + views ────────────────────────────────────────

public fun verify_cap(cap: &StorytellerCap, saga: &Saga): bool {
    cap.saga_id == object::id(saga)
}

public fun assert_cap(cap: &StorytellerCap, saga: &Saga) {
    assert!(verify_cap(cap, saga), ECapSagaMismatch);
}

public fun saga_id(saga: &Saga): ID { object::id(saga) }

public fun world_id(saga: &Saga): ID { saga.world_id }

public fun character_count(saga: &Saga): u64 { saga.character_count }

public fun saga_kind(saga: &Saga): SagaKind { saga.kind }

public fun is_active(saga: &Saga): bool { saga.is_active }

public fun kind_standard(): SagaKind { SagaKind::Standard }

public fun kind_reincarnation(): SagaKind { SagaKind::Reincarnation }

// ─── constructors ────────────────────────────────────────────────────

public fun new_revenue_config(
    owner_bps: u16,
    storyteller_bps: u16,
    treasury_bps: u16,
): RevenueConfig {
    assert!(
        owner_bps + storyteller_bps + treasury_bps == BPS_DENOMINATOR,
        EInvalidRevenueConfig,
    );
    RevenueConfig { owner_bps, storyteller_bps, treasury_bps }
}

// ─── tests ───────────────────────────────────────────────────────────

#[test_only]
use endless_story::currency;

#[test]
fun test_new_revenue_config() {
    let config = new_revenue_config(4000, 5000, 1000);
    assert!(config.owner_bps == 4000, 10);
    assert!(config.storyteller_bps == 5000, 11);
    assert!(config.treasury_bps == 1000, 12);
}

#[test]
fun test_cover_location_and_set_departure_policy() {
    let mut ctx = sui::tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock.set_for_testing(8000);
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        8000,
        &mut ctx,
    );
    let loc1 = world::new_location_for_testing(
        &admin_cap,
        &mut world,
        world::new_location_info(0, b"L1".to_string(), b"l".to_string(), b"i".to_string()),
        world::new_position(0, 0),
        world::new_location_graph(vector[]),
        8001,
        &mut ctx,
    );
    let loc2 = world::new_location_for_testing(
        &admin_cap,
        &mut world,
        world::new_location_info(1, b"L2".to_string(), b"l".to_string(), b"i".to_string()),
        world::new_position(1, 1),
        world::new_location_graph(vector[]),
        8002,
        &mut ctx,
    );
    let (mut saga, cap) = new_saga_for_testing(
        &mut world,
        kind_standard(),
        b"S".to_string(),
        b"s".to_string(),
        b"s".to_string(),
        4000,
        5000,
        1000,
        vector[world::location_id(&loc1)],
        @0xA,
        8003,
        &clock,
        &mut ctx,
    );

    assert!(covered_location_count(&saga) == 1, 30);
    cover_location(&cap, &mut saga, &loc2);
    assert!(covered_location_count(&saga) == 2, 31);
    assert!(is_location_covered(&saga, world::location_id(&loc2)), 32);

    assert!(*departure_policy(&saga) == b"".to_string(), 33);
    set_saga_departure_policy(&cap, &mut saga, b"Free to leave anytime.".to_string());
    assert!(*departure_policy(&saga) == b"Free to leave anytime.".to_string(), 34);

    destroy_saga_for_testing(saga, cap);
    world::destroy_location_for_testing(loc1);
    world::destroy_location_for_testing(loc2);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test]
fun test_set_saga_soul() {
    let mut ctx = sui::tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock.set_for_testing(8700);
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        8700,
        &mut ctx,
    );
    let (mut saga, cap) = new_saga_for_testing(
        &mut world,
        kind_standard(),
        b"S".to_string(),
        b"s".to_string(),
        b"s".to_string(),
        4000,
        5000,
        1000,
        vector[],
        @0xA,
        8701,
        &clock,
        &mut ctx,
    );

    assert!(*nature_prompt(&saga) == b"".to_string(), 60);
    assert!(*rhythm_hints(&saga) == b"".to_string(), 61);
    assert!(*portrait_tone(&saga) == b"".to_string(), 62);
    set_saga_soul(
        &cap,
        &mut saga,
        b"intrigue, knives in the dark".to_string(),
        b"dawn warm-ups, dusk curtain".to_string(),
        b"ink-wash, cinnabar accents".to_string(),
    );
    assert!(*nature_prompt(&saga) == b"intrigue, knives in the dark".to_string(), 63);
    assert!(*rhythm_hints(&saga) == b"dawn warm-ups, dusk curtain".to_string(), 64);
    assert!(*portrait_tone(&saga) == b"ink-wash, cinnabar accents".to_string(), 65);

    destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = ESagaAttributeRangeInvalid)]
fun test_define_saga_attribute_rejects_inverted_range() {
    let mut ctx = sui::tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock.set_for_testing(8650);
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        8650,
        &mut ctx,
    );
    let (mut saga, cap) = new_saga_for_testing(
        &mut world,
        kind_standard(),
        b"S".to_string(),
        b"s".to_string(),
        b"s".to_string(),
        4000,
        5000,
        1000,
        vector[],
        @0xA,
        8651,
        &clock,
        &mut ctx,
    );
    // min (100) > max (0) → ESagaAttributeRangeInvalid
    define_saga_attribute(&cap, &mut saga, b"唱腔".to_string(), b"唱".to_string(), 100, 0);
    destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = ELocationAlreadyCovered)]
fun test_cover_location_rejects_duplicate() {
    let mut ctx = sui::tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock.set_for_testing(8500);
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        8500,
        &mut ctx,
    );
    let loc = world::new_location_for_testing(
        &admin_cap,
        &mut world,
        world::new_location_info(0, b"L".to_string(), b"l".to_string(), b"i".to_string()),
        world::new_position(0, 0),
        world::new_location_graph(vector[]),
        8501,
        &mut ctx,
    );
    let (mut saga, cap) = new_saga_for_testing(
        &mut world,
        kind_standard(),
        b"S".to_string(),
        b"s".to_string(),
        b"s".to_string(),
        4000,
        5000,
        1000,
        vector[world::location_id(&loc)],
        @0xA,
        8502,
        &clock,
        &mut ctx,
    );
    cover_location(&cap, &mut saga, &loc); // ← duplicate, aborts

    destroy_saga_for_testing(saga, cap);
    world::destroy_location_for_testing(loc);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test]
fun test_mark_saga_inactive_admin() {
    let mut ctx = sui::tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        9000,
        &mut ctx,
    );
    let (mut saga, cap) = new_saga_for_testing(
        &mut world,
        kind_standard(),
        b"S".to_string(),
        b"s".to_string(),
        b"u".to_string(),
        4000,
        5000,
        1000,
        vector[],
        @0xA,
        9001,
        &clock,
        &mut ctx,
    );
    assert!(is_active(&saga), 1);
    mark_saga_inactive(&admin_cap, &mut saga);
    assert!(!is_active(&saga), 2);
    destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test]
fun test_card_weighting_lifecycle() {
    let mut ctx = sui::tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock.set_for_testing(8800);
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        8800,
        &mut ctx,
    );
    let (mut saga, cap) = new_saga_for_testing(
        &mut world,
        kind_standard(),
        b"S".to_string(),
        b"s".to_string(),
        b"s".to_string(),
        4000,
        5000,
        1000,
        vector[],
        @0xA,
        8801,
        &clock,
        &mut ctx,
    );

    assert!(!card_weighting_enabled(&saga), 40);
    assert!(vector::length(&card_weight_rules(&saga)) == 0, 41);

    enable_card_weighting(&cap, &mut saga);
    assert!(card_weighting_enabled(&saga), 42);
    set_card_weight_rule(&cap, &mut saga, 1u8, b"will".to_string(), 5);
    set_card_weight_rule(&cap, &mut saga, 4u8, b"grace".to_string(), 3);
    assert!(vector::length(&card_weight_rules(&saga)) == 2, 43);

    // Upsert: same (intent, key) replaces, doesn't append.
    set_card_weight_rule(&cap, &mut saga, 1u8, b"will".to_string(), 8);
    let rules = card_weight_rules(&saga);
    assert!(vector::length(&rules) == 2, 44);
    let r0 = vector::borrow(&rules, 0);
    assert!(card_weight_bonus_per_point(r0) == 8, 45);

    clear_card_weight_rule(&cap, &mut saga, 1u8, b"will".to_string());
    assert!(vector::length(&card_weight_rules(&saga)) == 1, 46);
    clear_card_weight_rule(&cap, &mut saga, 99u8, b"missing".to_string()); // no-op

    disable_card_weighting(&cap, &mut saga);
    assert!(!card_weighting_enabled(&saga), 47);
    assert!(vector::length(&card_weight_rules(&saga)) == 0, 48);

    destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = ECardWeightingNotEnabled)]
fun test_set_rule_without_enable_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock.set_for_testing(8900);
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        8900,
        &mut ctx,
    );
    let (mut saga, cap) = new_saga_for_testing(
        &mut world,
        kind_standard(),
        b"S".to_string(),
        b"s".to_string(),
        b"s".to_string(),
        4000,
        5000,
        1000,
        vector[],
        @0xA,
        8901,
        &clock,
        &mut ctx,
    );
    set_card_weight_rule(&cap, &mut saga, 1u8, b"will".to_string(), 5); // ← aborts

    destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test]
fun test_deposit_and_withdraw_treasury() {
    let mut ctx = sui::tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        7000,
        &mut ctx,
    );
    let (mut saga, cap) = new_saga_for_testing(
        &mut world,
        kind_standard(),
        b"S".to_string(),
        b"s".to_string(),
        b"s".to_string(),
        4000,
        5000,
        1000,
        vector[],
        @0xA,
        7001,
        &clock,
        &mut ctx,
    );

    // Deposit 1000 base units via test-only treasury cap path.
    let mut treasury_cap = currency::new_treasury_for_testing(&mut ctx);
    let payment = coin::mint(&mut treasury_cap, 1_000, &mut ctx);
    let deposited = deposit_to_treasury(&mut saga, payment);
    assert!(deposited == 1_000, 50);
    assert!(treasury_balance(&saga) == 1_000, 51);

    // Withdraw 600 to a recipient.
    withdraw_from_treasury(&cap, &mut saga, 600, @0xBEEF, &clock, &mut ctx);
    assert!(treasury_balance(&saga) == 400, 52);

    destroy_saga_for_testing(saga, cap);
    sui::transfer::public_transfer(treasury_cap, @0x0);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = EInsufficientTreasury)]
fun test_withdraw_exceeds_balance_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (mut world, admin_cap) = world::new_world_for_testing(
        world::new_world_info(b"W".to_string(), b"w".to_string()),
        world::new_currency_display(b"E".to_string(), b"E".to_string()),
        world::new_world_rules(vector[b"human".to_string()], vector[]),
        7100,
        &mut ctx,
    );
    let (mut saga, cap) = new_saga_for_testing(
        &mut world,
        kind_standard(),
        b"S".to_string(),
        b"s".to_string(),
        b"s".to_string(),
        4000,
        5000,
        1000,
        vector[],
        @0xA,
        7101,
        &clock,
        &mut ctx,
    );
    // Treasury is empty; withdraw 100 aborts.
    withdraw_from_treasury(&cap, &mut saga, 100, @0xBEEF, &clock, &mut ctx);

    destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test_only]
public fun new_saga_for_testing(
    world: &mut World,
    kind: SagaKind,
    name: String,
    description: String,
    metadata_uri: String,
    owner_bps: u16,
    storyteller_bps: u16,
    treasury_bps: u16,
    covered_location_ids: vector<ID>,
    operator: address,
    created_at_ms: u64,
    clock: &clock::Clock,
    ctx: &mut TxContext,
): (Saga, StorytellerCap) {
    let config = new_revenue_config(owner_bps, storyteller_bps, treasury_bps);
    let saga = Saga {
        id: object::new(ctx),
        world_id: world::world_id(world),
        kind,
        is_active: true,
        name,
        description,
        metadata_uri,
        operator,
        revenue_config: config,
        treasury: balance::zero<CURRENCY>(),
        covered_location_ids,
        anchor_scene_ids: vector[],
        character_count: 0,
        departure_policy: b"".to_string(),
        nature_prompt: b"".to_string(),
        rhythm_hints: b"".to_string(),
        portrait_tone: b"".to_string(),
        created_at_ms,
    };
    let saga_id = object::id(&saga);
    let cap = StorytellerCap { id: object::new(ctx), saga_id };
    world::register_saga(world, saga_id, clock);
    (saga, cap)
}

#[test_only]
public fun destroy_saga_for_testing(saga: Saga, cap: StorytellerCap) {
    let Saga {
        id,
        world_id: _,
        kind: _,
        is_active: _,
        name: _,
        description: _,
        metadata_uri: _,
        operator: _,
        revenue_config: _,
        treasury,
        covered_location_ids: _,
        anchor_scene_ids: _,
        character_count: _,
        departure_policy: _,
        nature_prompt: _,
        rhythm_hints: _,
        portrait_tone: _,
        created_at_ms: _,
    } = saga;
    let _ = balance::destroy_for_testing(treasury);
    id.delete();
    let StorytellerCap { id, saga_id: _ } = cap;
    id.delete();
}
