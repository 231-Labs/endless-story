/// Endless Story — Character custody + mint paths.
///
/// **Scope 1 (legacy):** Character + OwnerCap base structure.
/// **Scope 2 (legacy):** ControlCap + lifecycle (issue / revoke / reassign).
/// **Scope 3 (legacy):** SEAL approve (control / owner) + id layout helper.
/// **Phase 1.5a (prior):** Character struct enrichment + three mint paths
///   + validation invariants + death writer + value-type constructors.
///   Voucher-driven mint lives in the sibling `recruit` module.
/// **Phase 1.5b (prior):** ControlCap.saga_id binding + scene movement
///   + wild release + wild walk + ControlCapKey DOF + take/bind helpers.
/// **Phase 1.5c (new):** per-saga skill table (DOF keyed by SagaSkillsKey)
///   + image update (two paths: storyteller-signed and owner-signed) +
///   Display V2 init (Character + OwnerCap visible in wallets) +
///   `find_attribute_value_in` public helper for recruit's requirements
///   check.
///
/// **Cap matrix:**
///   - `OwnerCap`   = root ownership (transferrable; holder = owner)
///   - `ControlCap` = operational delegation (epoch-bound; auto-invalidated
///     by `revoke_all_control` / `reassign_saga`)
///
/// See AGENTS.md → 「鏈上架構」 for module dependency rules.
module endless_story::character;

use std::string::String;
use sui::bcs;
use sui::clock;
use sui::display;
use sui::dynamic_field as df;
use sui::dynamic_object_field as dof;
use sui::event;
use sui::package;

use endless_story::saga::{Self, Saga, StorytellerCap};
use endless_story::world::{Self, AdminCap, Location, World};
use endless_story::scene::{Self, Scene};

// ─── errors ──────────────────────────────────────────────────────────

#[error]
const EWrongCharacter: vector<u8> = b"Cap does not correspond to this Character";

#[error]
const ENoAccess: vector<u8> = b"ControlCap epoch does not match current control_epoch (revoked)";

#[error]
const EInvalidEncryptionId: vector<u8> = b"SEAL id does not target this Character";

#[error]
const EInvalidSpecies: vector<u8> = b"Profile species is not declared in world rules";

#[error]
const EInvalidAttribute: vector<u8> = b"Attribute key/value violates world rules";

#[error]
const EWorldSagaMismatch: vector<u8> = b"Saga does not belong to the given World";

#[error]
const ESceneSagaMismatch: vector<u8> = b"Scene does not belong to the given Saga";

// ─── errors added in 1.5b ────────────────────────────────────────────

#[error]
const ECharacterDead: vector<u8> = b"Character is dead";

#[error]
const ECharacterSagaMismatch: vector<u8> = b"Character does not belong to this Saga";

#[error]
const ECharacterSceneMismatch: vector<u8> = b"Character is not in this Scene";

#[error]
const ESameSourceAndTargetScene: vector<u8> = b"Source and target scene are identical";

#[error]
const EControlCapMismatch: vector<u8> = b"ControlCap is not for this Character";

#[error]
const ECharacterNotWild: vector<u8> = b"Character is not currently wild";

#[error]
const ELocationMismatch: vector<u8> = b"Character is not at the given location";

#[error]
const ENotAdjacent: vector<u8> = b"Target location is not adjacent to current";

#[error]
const ESameLocation: vector<u8> = b"Source and target location are identical";

#[error]
const EAdminWorldMismatch: vector<u8> = b"AdminCap belongs to a different World";

// ─── errors added in 1.5c ────────────────────────────────────────────

#[error]
const ESkillKeyNotInSagaTable: vector<u8> = b"Skill key not declared in saga's attribute_defs";

#[error]
const ESkillValueOutOfRange: vector<u8> = b"Skill value violates saga's attribute_defs range";

#[error]
const EMediaIndexOutOfRange: vector<u8> = b"media_assets index out of range";

// ─── value types ─────────────────────────────────────────────────────

/// On-chain skill / attribute snapshot. `seed` is the deterministic input
/// used by the off-chain generator that produced `value` (kept on chain so
/// indexers / explorers can reconstruct the roll).
public struct AttributeValue has copy, drop, store {
    key: String,
    value: u64,
    seed: vector<u8>,
}

/// Biology snapshot at mint time. `age_years = 0` means unknown. Mutable
/// aging is handled off-chain via world tick math; this field is the
/// "starting age" for storyteller LLM narrative consistency.
public struct PhysicalFacts has copy, drop, store {
    species: String,
    gender: String,
    body: String,
    age_years: u8,
}

public struct CharacterProfile has copy, drop, store {
    name: String,
    description: String,
    physical_facts: PhysicalFacts,
}

/// Off-chain media reference. `kind` codes the asset type (0=portrait,
/// 1=audio, ... — caller convention). `walrus_blob_id` is the optional
/// Walrus blob id; empty vector if asset lives elsewhere.
public struct MediaAsset has copy, drop, store {
    kind: u8,
    uri: String,
    walrus_blob_id: vector<u8>,
    metadata_uri: String,
}

/// Composer-attached tag (e.g. "wounded", "betrayed-by-X"). `source_event_id`
/// is the event that affirmed the tag, if any (None when set by storyteller
/// fiat outside an event). Tags are applied/revoked via package-internal
/// fns called by event.move (1.6).
public struct Tag has copy, drop, store {
    label: String,
    source_event_id: Option<ID>,
    affirmed_at_ms: u64,
}

/// Runtime state — what world / saga / scene the character is currently
/// bound to. `saga_id = None` means wild (between sagas). `current_scene_id`
/// is None for wild characters who roam locations between scenes.
///
/// **Phase 1.5a scope:** struct is fully shaped, but only mint paths
/// populate it. Movement / transfer / wild release land in 1.5b.
public struct CharacterState has copy, drop, store {
    world_id: ID,
    saga_id: Option<ID>,
    current_scene_id: Option<ID>,
    /// Always tracked, even when in a scene (derived from scene's location
    /// at mint/move time). Wild characters have scene = None but location
    /// = Some, since they roam the map between locations.
    current_location_id: Option<ID>,
    birth_ms: u64,
}

/// On-chain death record. Composed by storyteller when resolving an event
/// (with `by_event = Some(event_id)`) or by world daemon on natural
/// forgetting death (`by_event = None`). `attributed_characters` should be
/// real Character IDs that played KILL-intent cards (when event-caused).
/// Empty `attributed` is honest: accident / disaster / no one to blame.
public struct DeathRecord has copy, drop, store {
    victim: ID,
    recorded_at_ms: u64,
    by_event: Option<ID>,
    attributed_characters: vector<ID>,
}

// ─── main resource + caps ────────────────────────────────────────────

/// 角色本體。由 mint_character_internal share 成 shared object。
/// `control_epoch` 是 ControlCap 撤銷的依據；從 1 起跳。
public struct Character has key {
    id: UID,
    control_epoch: u64,
    profile: CharacterProfile,
    attributes: vector<AttributeValue>,
    media_assets: vector<MediaAsset>,
    state: CharacterState,
    tags: vector<Tag>,
    /// User-facing display image URL. Defaults to first media asset's uri
    /// on mint; mutable via `update_character_image` (added in 1.5c).
    image_url: String,
    /// `Some` once the character has died. Set by `mark_dead` (called from
    /// event.move's apply_death in 1.6).
    death: Option<DeathRecord>,
    /// Subscriber counter — incremented by `subscribe::subscribe`,
    /// decremented by `subscribe::unsubscribe`. Used by the runner's
    /// character POV worker as a demand gate (no subscribers = no
    /// chapter generated). See AGENTS → Runner v2.
    subscriber_count: u64,
}

/// 角色根權限。可轉移；持有者即 owner。角色易主 = transfer 這張 cap。
public struct OwnerCap has key, store {
    id: UID,
    character_id: ID,
    world_id: ID,
    minted_at_ms: u64,
    /// Phase 2 IP revenue accumulator. Always 0 in Phase 1; revenue
    /// posting machinery lands post-launch.
    cumulative_revenue: u64,
}

/// 營運權限。`epoch` 對應簽發當下的 `character.control_epoch`。
/// 當 character.control_epoch 變動後，這張 cap 自動失效：`is_valid` 回 false、
/// SEAL approve 會 abort.
///
/// `saga_id` records which saga the cap is bound to (None when issued
/// against a wild character). Updated by `bind_to_saga` when a wild
/// character is accepted into a saga via JoinIntent.
public struct ControlCap has key, store {
    id: UID,
    character_id: ID,
    epoch: u64,
    saga_id: Option<ID>,
}

/// DOF marker — when a character goes wild, the saga's ControlCap is
/// stored at `dof[character.id, ControlCapKey {}]` so the next saga can
/// extract it via `take_wild_control_cap` (rather than asking the previous
/// storyteller to hand it back manually).
public struct ControlCapKey has copy, drop, store {}

/// DOF marker for per-saga skill values attached to a character (R3.3).
/// Scoped by `saga_id` so a character that's lived in multiple sagas
/// keeps each saga's skill set as a separate dynamic field — if she ever
/// re-joins the same saga, her 唱腔 / 身段 scores come back.
public struct SagaSkillsKey has copy, drop, store { saga_id: ID }

/// One-time witness for Display V2 registration (this module).
public struct CHARACTER has drop {}

// ─── events ──────────────────────────────────────────────────────────

public struct ControlCapIssued has copy, drop {
    character_id: ID,
    cap_id: ID,
    epoch: u64,
}

public struct ControlRevoked has copy, drop {
    character_id: ID,
    revoked_epoch: u64,
}

public struct SagaReassigned has copy, drop {
    character_id: ID,
    new_epoch: u64,
    cap_id: ID,
}

public struct CharacterMinted has copy, drop {
    character_id: ID,
    world_id: ID,
    saga_id: Option<ID>,
    scene_id: Option<ID>,
    owner_cap_id: ID,
    control_cap_id: ID,
    name: String,
    owner: address,
    minted_at_ms: u64,
}

public struct CharacterDied has copy, drop {
    character_id: ID,
    by_event: Option<ID>,
    attributed_count: u64,
    recorded_at_ms: u64,
}

// ─── events added in 1.5b ────────────────────────────────────────────

public struct CharacterMoved has copy, drop {
    character_id: ID,
    from_scene_id: ID,
    to_scene_id: ID,
    moved_at_ms: u64,
}

public struct CharacterWalked has copy, drop {
    character_id: ID,
    from_location_id: ID,
    to_location_id: ID,
    walked_at_ms: u64,
}

public struct CharacterTransferredToWild has copy, drop {
    character_id: ID,
    from_saga_id: ID,
    at_ms: u64,
}

public struct CharacterAcceptedIntoSaga has copy, drop {
    character_id: ID,
    saga_id: ID,
    scene_id: ID,
    accepted_at_ms: u64,
}

// ─── events added in 1.5c ────────────────────────────────────────────

public struct CharacterImageUpdated has copy, drop {
    character_id: ID,
    new_image_url: String,
    updated_by_owner: bool,
    updated_at_ms: u64,
}

/// A variant was appended to the character's gallery (`media_assets`).
/// `index` is its position in the vector. Lets indexers build the 設定集
/// without re-fetching the whole Character object.
public struct MediaAssetAdded has copy, drop {
    character_id: ID,
    kind: u8,
    uri: String,
    index: u64,
    added_by_owner: bool,
    added_at_ms: u64,
}

public struct CharacterProfileDescriptionUpdated has copy, drop {
    character_id: ID,
    saga_id: ID,
    new_description: String,
    updated_at_ms: u64,
}

public struct SkillSet has copy, drop {
    character_id: ID,
    saga_id: ID,
    key: String,
    value: u64,
}

public struct SkillCleared has copy, drop {
    character_id: ID,
    saga_id: ID,
    key: String,
}

// ─── init (Display V2) ───────────────────────────────────────────────

/// Display V2 registration. Runs once at package publish. Registers
/// human-readable display templates for Character (name/description/image)
/// and OwnerCap (so wallets show "Character N's Owner Cap" rather than
/// the raw object struct).
fun init(otw: CHARACTER, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);

    // Character display
    let mut char_display = display::new_with_fields<Character>(
        &publisher,
        vector[
            b"name".to_string(),
            b"description".to_string(),
            b"image_url".to_string(),
        ],
        vector[
            b"{profile.name}".to_string(),
            b"{profile.description}".to_string(),
            b"{image_url}".to_string(),
        ],
        ctx,
    );
    display::update_version(&mut char_display);

    // OwnerCap display
    let mut owner_display = display::new_with_fields<OwnerCap>(
        &publisher,
        vector[b"name".to_string(), b"description".to_string()],
        vector[
            b"Character Owner Cap".to_string(),
            b"Root ownership for character {character_id}".to_string(),
        ],
        ctx,
    );
    display::update_version(&mut owner_display);

    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(char_display, ctx.sender());
    transfer::public_transfer(owner_display, ctx.sender());
}

// ─── mint paths ──────────────────────────────────────────────────────

/// Storyteller mints a canonical character into a specific scene. Used at
/// bootstrap (genesis cast) and for storyteller-fiat additions mid-saga.
/// Increments the saga's character count + adds character to scene state.
public fun mint_genesis_character(
    cap: &StorytellerCap,
    saga: &mut Saga,
    world: &World,
    scene: &mut Scene,
    profile: CharacterProfile,
    media_assets: vector<MediaAsset>,
    attributes: vector<AttributeValue>,
    owner_recipient: address,
    clock: &clock::Clock,
    ctx: &mut TxContext,
): ControlCap {
    saga::assert_cap(cap, saga);
    let saga_id = saga::saga_id(saga);
    assert!(world::world_id(world) == saga::world_id(saga), EWorldSagaMismatch);
    assert!(scene::saga_id(scene) == saga_id, ESceneSagaMismatch);

    let scene_id = scene::scene_id(scene);
    let scene_location_id = scene::location_id(scene);
    // OwnerCap is transferred to `owner_recipient` inside mint_character_internal
    // (the storyteller cannot withhold or redirect it); only the ControlCap
    // is returned for the caller to delegate to the runner.
    let (character_id, control_cap) = mint_character_internal(
        world,
        option::some(saga_id),
        option::some(scene_id),
        option::some(scene_location_id),
        profile,
        media_assets,
        attributes,
        owner_recipient,
        clock::timestamp_ms(clock),
        ctx,
    );

    scene::add_character(scene, character_id);
    saga::increment_character_count(saga);
    control_cap
}

/// Storyteller mints a non-canon (collectible / external) character into a
/// saga without placing in a scene. Used for "guest cameo" mints where the
/// character isn't yet placed on the map.
public fun mint_collectible_character(
    cap: &StorytellerCap,
    saga: &Saga,
    world: &World,
    profile: CharacterProfile,
    media_assets: vector<MediaAsset>,
    attributes: vector<AttributeValue>,
    owner_recipient: address,
    clock: &clock::Clock,
    ctx: &mut TxContext,
): ControlCap {
    saga::assert_cap(cap, saga);
    assert!(world::world_id(world) == saga::world_id(saga), EWorldSagaMismatch);

    // OwnerCap goes to `owner_recipient` inside; only ControlCap is returned.
    let (_character_id, control_cap) = mint_character_internal(
        world,
        option::none<ID>(),
        option::none<ID>(),
        option::none<ID>(),
        profile,
        media_assets,
        attributes,
        owner_recipient,
        clock::timestamp_ms(clock),
        ctx,
    );
    control_cap
}

/// Package-internal canonical mint. Validates invariants (species,
/// attribute ranges) inside — callers cannot bypass. Shares Character as
/// a shared object.
///
/// **Ownership guarantee (enforced on-chain, not by the PTB):** the
/// `OwnerCap` is transferred to `owner_recipient` here — a storyteller /
/// admin building the redeem PTB cannot keep or redirect it. Only the
/// `ControlCap` (runner delegation) is returned, alongside the new
/// character's `ID` so the caller can do scene / saga bookkeeping.
///
/// Visibility: `public(package)` so sibling modules (recruit, future
/// admin paths) can call without re-exposing through entries.
public(package) fun mint_character_internal(
    world: &World,
    saga_id: Option<ID>,
    current_scene_id: Option<ID>,
    current_location_id: Option<ID>,
    profile: CharacterProfile,
    media_assets: vector<MediaAsset>,
    attributes: vector<AttributeValue>,
    owner_recipient: address,
    minted_at_ms: u64,
    ctx: &mut TxContext,
): (ID, ControlCap) {
    validate_profile(world, &profile);
    validate_attributes(world, &attributes);

    let world_id = world::world_id(world);
    let initial_image_url = if (vector::is_empty(&media_assets)) {
        b"".to_string()
    } else {
        vector::borrow(&media_assets, 0).uri
    };
    let character = Character {
        id: object::new(ctx),
        control_epoch: 1,
        profile,
        attributes,
        media_assets,
        state: CharacterState {
            world_id,
            saga_id,
            current_scene_id,
            current_location_id,
            birth_ms: minted_at_ms,
        },
        tags: vector[],
        image_url: initial_image_url,
        death: option::none<DeathRecord>(),
        subscriber_count: 0,
    };
    let character_id = object::id(&character);

    let owner_cap = OwnerCap {
        id: object::new(ctx),
        character_id,
        world_id,
        minted_at_ms,
        cumulative_revenue: 0,
    };
    let owner_cap_id = object::id(&owner_cap);

    let control_cap = ControlCap {
        id: object::new(ctx),
        character_id,
        epoch: character.control_epoch,
        saga_id,
    };
    let control_cap_id = object::id(&control_cap);

    event::emit(CharacterMinted {
        character_id,
        world_id,
        saga_id,
        scene_id: current_scene_id,
        owner_cap_id,
        control_cap_id,
        name: character.profile.name,
        owner: owner_recipient,
        minted_at_ms,
    });

    transfer::share_object(character);
    // OwnerCap → the rightful owner (voucher payer / chosen recipient). Done
    // on-chain so no PTB can withhold it. ControlCap returned to the caller.
    transfer::public_transfer(owner_cap, owner_recipient);
    (character_id, control_cap)
}

// ─── validation (private invariants enforced by mint_character_internal) ──

fun validate_profile(world: &World, profile: &CharacterProfile) {
    assert!(
        world::is_valid_species(world, &profile.physical_facts.species),
        EInvalidSpecies,
    );
}

fun validate_attributes(world: &World, attributes: &vector<AttributeValue>) {
    assert!(
        attributes.all!(|attr| world::is_valid_attribute_value(world, &attr.key, attr.value)),
        EInvalidAttribute,
    );
}

// ─── cap lifecycle ───────────────────────────────────────────────────

/// Owner 簽發一張 ControlCap，綁定當前 `control_epoch`。
/// 回傳 cap 由呼叫端決定 transfer 對象（PTB 組合性）。
public fun issue_control_cap(
    character: &Character,
    owner_cap: &OwnerCap,
    ctx: &mut TxContext,
): ControlCap {
    assert!(owner_cap.character_id == object::id(character), EWrongCharacter);

    let cap = ControlCap {
        id: object::new(ctx),
        character_id: owner_cap.character_id,
        epoch: character.control_epoch,
        saga_id: character.state.saga_id,
    };

    event::emit(ControlCapIssued {
        character_id: owner_cap.character_id,
        cap_id: object::id(&cap),
        epoch: cap.epoch,
    });

    cap
}

/// Owner 撤銷當前所有 ControlCap (epoch +1)。舊 cap 物件仍在持有者手上，
/// 但 `is_valid` / SEAL approve 都會拒。
public fun revoke_all_control(character: &mut Character, owner_cap: &OwnerCap) {
    assert!(owner_cap.character_id == object::id(character), EWrongCharacter);

    let revoked = character.control_epoch;
    character.control_epoch = character.control_epoch + 1;

    event::emit(ControlRevoked {
        character_id: object::id(character),
        revoked_epoch: revoked,
    });
}

/// Owner 把角色託管轉給新 Saga：一筆 tx 完成「撤銷舊 + 簽發新」。
/// emit `SagaReassigned`（而非 `ControlRevoked` + `ControlCapIssued`）讓
/// indexer 能區分「主動撤銷」與「換託管」兩種意圖。
public fun reassign_saga(
    character: &mut Character,
    owner_cap: &OwnerCap,
    ctx: &mut TxContext,
): ControlCap {
    assert!(owner_cap.character_id == object::id(character), EWrongCharacter);

    character.control_epoch = character.control_epoch + 1;

    let cap = ControlCap {
        id: object::new(ctx),
        character_id: owner_cap.character_id,
        epoch: character.control_epoch,
        saga_id: character.state.saga_id,
    };

    event::emit(SagaReassigned {
        character_id: object::id(character),
        new_epoch: character.control_epoch,
        cap_id: object::id(&cap),
    });

    cap
}

// ─── scene movement (storyteller-signed, in-saga) ────────────────────

/// Move a character between two scenes inside the same saga.
/// Storyteller-signed. Aborts if either scene is in a different saga,
/// the character isn't in this saga, isn't actually in `from_scene`,
/// the two scenes are identical, or the character is dead.
public fun move_character(
    cap: &StorytellerCap,
    saga: &Saga,
    from_scene: &mut Scene,
    to_scene: &mut Scene,
    character: &mut Character,
    clock: &clock::Clock,
) {
    saga::assert_cap(cap, saga);
    let saga_id = saga::saga_id(saga);
    assert!(scene::saga_id(from_scene) == saga_id, ESceneSagaMismatch);
    assert!(scene::saga_id(to_scene) == saga_id, ESceneSagaMismatch);
    assert!(character.state.saga_id.contains(&saga_id), ECharacterSagaMismatch);

    let from_id = scene::scene_id(from_scene);
    let to_id = scene::scene_id(to_scene);
    assert!(from_id != to_id, ESameSourceAndTargetScene);
    assert!(character.state.current_scene_id.contains(&from_id), ECharacterSceneMismatch);
    assert!(character.death.is_none(), ECharacterDead);

    let character_id = object::id(character);
    let _ = scene::remove_character(from_scene, character_id);
    scene::add_character(to_scene, character_id);
    character.state.current_scene_id = option::some(to_id);
    character.state.current_location_id = option::some(scene::location_id(to_scene));

    event::emit(CharacterMoved {
        character_id,
        from_scene_id: from_id,
        to_scene_id: to_id,
        moved_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── wild release (storyteller / admin) ──────────────────────────────

/// Saga storyteller releases a character to wild status. CONSUMES the
/// ControlCap and stores it on the character via DOF (extracted later by
/// `recruit::accept_character_into_saga` when a new saga takes custody).
/// `saga_id` and `current_scene_id` flip to None; `current_location_id`
/// is preserved (wild characters keep walking from where they left).
public fun release_character_to_wild(
    cap: &StorytellerCap,
    saga: &Saga,
    control_cap: ControlCap,
    current_scene: &mut Scene,
    character: &mut Character,
    clock: &clock::Clock,
) {
    saga::assert_cap(cap, saga);
    let saga_id = saga::saga_id(saga);
    release_character_to_wild_shared(saga_id, character, current_scene, control_cap, clock);
}

/// World-admin emergency release. Same end state as
/// `release_character_to_wild` but bypasses storyteller signature.
public fun force_release_character(
    admin_cap: &AdminCap,
    saga: &Saga,
    control_cap: ControlCap,
    current_scene: &mut Scene,
    character: &mut Character,
    clock: &clock::Clock,
) {
    assert!(world::admin_world_id(admin_cap) == character.state.world_id, EAdminWorldMismatch);
    assert!(world::admin_world_id(admin_cap) == saga::world_id(saga), EAdminWorldMismatch);
    let saga_id = saga::saga_id(saga);
    release_character_to_wild_shared(saga_id, character, current_scene, control_cap, clock);
}

/// Shared release path. Consumes the control_cap into a DOF on the
/// character. Asserts the cap matches, the character is in this saga +
/// scene, and the character isn't dead.
fun release_character_to_wild_shared(
    saga_id: ID,
    character: &mut Character,
    current_scene: &mut Scene,
    control_cap: ControlCap,
    clock: &clock::Clock,
) {
    assert!(character.state.saga_id.contains(&saga_id), ECharacterSagaMismatch);
    assert!(scene::saga_id(current_scene) == saga_id, ESceneSagaMismatch);
    let scene_id = scene::scene_id(current_scene);
    assert!(character.state.current_scene_id.contains(&scene_id), ECharacterSceneMismatch);
    assert!(control_cap.character_id == object::id(character), EControlCapMismatch);
    assert!(character.death.is_none(), ECharacterDead);

    let character_id = object::id(character);
    let _ = scene::remove_character(current_scene, character_id);
    character.state.saga_id = option::none<ID>();
    character.state.current_scene_id = option::none<ID>();

    dof::add(&mut character.id, ControlCapKey {}, control_cap);

    event::emit(CharacterTransferredToWild {
        character_id,
        from_saga_id: saga_id,
        at_ms: clock::timestamp_ms(clock),
    });
}

// ─── wild walk (owner-signed) ────────────────────────────────────────

/// Wild character walks one step on the location graph. Owner-signed via
/// OwnerCap (auto-driver / sovereign skill both work — rule is "caller
/// holds OwnerCap", not "caller is a specific service"). Aborts if the
/// character is in any saga, dead, not actually at `current_location`,
/// or if `new_location` isn't adjacent.
public fun walk_in_world(
    owner_cap: &OwnerCap,
    character: &mut Character,
    current_location: &Location,
    new_location: &Location,
    clock: &clock::Clock,
) {
    assert!(owner_cap.character_id == object::id(character), EWrongCharacter);
    assert!(character.state.saga_id.is_none(), ECharacterNotWild);
    assert!(character.death.is_none(), ECharacterDead);
    let from_id = world::location_id(current_location);
    let to_id = world::location_id(new_location);
    assert!(from_id != to_id, ESameLocation);
    assert!(character.state.current_location_id.contains(&from_id), ELocationMismatch);
    assert!(world::is_adjacent(current_location, new_location), ENotAdjacent);

    character.state.current_location_id = option::some(to_id);

    event::emit(CharacterWalked {
        character_id: object::id(character),
        from_location_id: from_id,
        to_location_id: to_id,
        walked_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── package-internal: wild ↔ saga transitions (used by recruit) ─────

/// Take a wild character's self-held ControlCap out of DOF. Asserts the
/// character is currently wild (saga_id == None) and not dead. recruit
/// calls this from `accept_character_into_saga` after validating intent.
public(package) fun take_wild_control_cap(character: &mut Character): ControlCap {
    assert!(character.state.saga_id.is_none(), ECharacterNotWild);
    assert!(character.death.is_none(), ECharacterDead);
    dof::remove(&mut character.id, ControlCapKey {})
}

/// Bind a wild character into a new saga + scene. Updates Character state
/// (saga_id / scene_id / location_id) and the ControlCap's saga_id
/// in-place. Emits `CharacterAcceptedIntoSaga`. recruit composes this
/// with `take_wild_control_cap`.
///
/// Note: does NOT add character to scene.current_character_ids — caller
/// (recruit) does that, because the caller also needs to increment the
/// saga's character_count (single transaction-level decision).
public(package) fun bind_to_saga(
    character: &mut Character,
    saga_id: ID,
    scene_id: ID,
    location_id: ID,
    control_cap: &mut ControlCap,
    clock: &clock::Clock,
) {
    character.state.saga_id = option::some(saga_id);
    character.state.current_scene_id = option::some(scene_id);
    character.state.current_location_id = option::some(location_id);
    control_cap.saga_id = option::some(saga_id);

    event::emit(CharacterAcceptedIntoSaga {
        character_id: object::id(character),
        saga_id,
        scene_id,
        accepted_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── per-saga skills (R3.3 — 1.5c) ──────────────────────────────────

/// Set or update a single skill value on a character for a specific saga.
/// Storyteller of `saga` signs. Validates:
///   1. cap matches saga
///   2. character is currently in this saga
///   3. skill `key` is declared in `saga::saga_attribute_defs`
///   4. `value` is within the def's [min, max] range
///   5. character is not dead
///
/// Stored as a DOF on the character keyed by `SagaSkillsKey { saga_id }`,
/// so per-saga skill sets are preserved across saga transitions.
public fun set_character_skill(
    cap: &StorytellerCap,
    saga: &Saga,
    character: &mut Character,
    key: String,
    value: u64,
    seed: vector<u8>,
) {
    saga::assert_cap(cap, saga);
    let saga_id = saga::saga_id(saga);
    assert!(character.state.saga_id.contains(&saga_id), ECharacterSagaMismatch);
    assert!(character.death.is_none(), ECharacterDead);

    let defs = saga::saga_attribute_defs(saga);
    assert!(world::is_key_defined(&defs, &key), ESkillKeyNotInSagaTable);
    assert!(world::is_value_in_definitions(&defs, &key, value), ESkillValueOutOfRange);

    let dof_key = SagaSkillsKey { saga_id };
    ensure_skills_field(&mut character.id, dof_key);
    let skills: &mut vector<AttributeValue> = df::borrow_mut(&mut character.id, dof_key);

    let key_copy = key;
    let idx_opt = skills.find_index!(|attr| attr.key == key_copy);
    if (idx_opt.is_some()) {
        let entry = vector::borrow_mut(skills, *idx_opt.borrow());
        entry.value = value;
        entry.seed = seed;
    } else {
        vector::push_back(
            skills,
            AttributeValue { key: key_copy, value, seed },
        );
    };

    event::emit(SkillSet {
        character_id: object::id(character),
        saga_id,
        key: key_copy,
        value,
    });
}

/// Remove a per-saga skill entry by key. Storyteller-signed. No-op if
/// missing (defensive). Note: clearing only removes from this saga's
/// DOF — other sagas' skill tables on the same character are untouched.
public fun clear_character_skill(
    cap: &StorytellerCap,
    saga: &Saga,
    character: &mut Character,
    key: String,
) {
    saga::assert_cap(cap, saga);
    let saga_id = saga::saga_id(saga);
    assert!(character.state.saga_id.contains(&saga_id), ECharacterSagaMismatch);

    let dof_key = SagaSkillsKey { saga_id };
    if (!df::exists(&character.id, dof_key)) return;

    let skills: &mut vector<AttributeValue> = df::borrow_mut(&mut character.id, dof_key);
    let key_copy = key;
    let idx_opt = skills.find_index!(|attr| attr.key == key_copy);
    if (idx_opt.is_some()) {
        let _ = vector::remove(skills, *idx_opt.borrow());
        event::emit(SkillCleared {
            character_id: object::id(character),
            saga_id,
            key: key_copy,
        });
    }
}

/// Snapshot a character's per-saga skill table. Returns empty if no skills
/// have been set for this saga.
public fun character_skills_for_saga(character: &Character, saga_id: ID): vector<AttributeValue> {
    let dof_key = SagaSkillsKey { saga_id };
    if (df::exists(&character.id, dof_key)) {
        *df::borrow<SagaSkillsKey, vector<AttributeValue>>(&character.id, dof_key)
    } else {
        vector[]
    }
}

fun ensure_skills_field(uid: &mut UID, dof_key: SagaSkillsKey) {
    if (!df::exists(uid, dof_key)) {
        df::add<SagaSkillsKey, vector<AttributeValue>>(uid, dof_key, vector[]);
    }
}

// ─── profile repair (storyteller-signed) ─────────────────────────────

/// Storyteller-signed profile-description repair. Character must currently
/// belong to `saga` and be alive. There is deliberately no owner-signed
/// variant: public NFT biography is saga-authored canon, not owner-editable
/// free text.
public fun update_profile_description_by_storyteller(
    cap: &StorytellerCap,
    saga: &Saga,
    character: &mut Character,
    new_description: String,
    clock: &clock::Clock,
) {
    saga::assert_cap(cap, saga);
    let saga_id = saga::saga_id(saga);
    assert!(character.state.saga_id.contains(&saga_id), ECharacterSagaMismatch);
    assert!(character.death.is_none(), ECharacterDead);

    character.profile.description = new_description;
    event::emit(CharacterProfileDescriptionUpdated {
        character_id: object::id(character),
        saga_id,
        new_description: character.profile.description,
        updated_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── image update (1.5c) ─────────────────────────────────────────────

/// Storyteller-signed image update. Character must be in this saga, not
/// dead. Used when storyteller's AI portrait generator produces a new
/// image during saga events.
public fun update_image_by_storyteller(
    cap: &StorytellerCap,
    saga: &Saga,
    character: &mut Character,
    new_image_url: String,
    clock: &clock::Clock,
) {
    saga::assert_cap(cap, saga);
    let saga_id = saga::saga_id(saga);
    assert!(character.state.saga_id.contains(&saga_id), ECharacterSagaMismatch);
    assert!(character.death.is_none(), ECharacterDead);

    character.image_url = new_image_url;
    event::emit(CharacterImageUpdated {
        character_id: object::id(character),
        new_image_url: character.image_url,
        updated_by_owner: false,
        updated_at_ms: clock::timestamp_ms(clock),
    });
}

/// Owner-signed image update. Allowed at any time (wild or in-saga, dead
/// or alive — owner's call). Owner may want to refresh their character's
/// public portrait independently of saga storyteller.
public fun update_image_by_owner(
    owner_cap: &OwnerCap,
    character: &mut Character,
    new_image_url: String,
    clock: &clock::Clock,
) {
    assert!(owner_cap.character_id == object::id(character), EWrongCharacter);

    character.image_url = new_image_url;
    event::emit(CharacterImageUpdated {
        character_id: object::id(character),
        new_image_url: character.image_url,
        updated_by_owner: true,
        updated_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── gallery: 設定集 (append variants + owner cover selection) ─────────
//
// `media_assets` was previously write-once (mint only). These let the
// portrait variants (§11) accumulate into the gallery WITHOUT changing the
// live cover, then let the OWNER pick which one is the cover. The cover
// stays `image_url`; the gallery is the full `media_assets` vector.

/// Storyteller appends a variant to the gallery (cover unchanged). Used by
/// the AI portrait pipeline when it produces a new image during the saga.
public fun add_media_asset_by_storyteller(
    cap: &StorytellerCap,
    saga: &Saga,
    character: &mut Character,
    asset: MediaAsset,
    clock: &clock::Clock,
) {
    saga::assert_cap(cap, saga);
    let saga_id = saga::saga_id(saga);
    assert!(character.state.saga_id.contains(&saga_id), ECharacterSagaMismatch);
    add_media_asset_internal(character, asset, false, clock);
}

/// Owner appends a variant to the gallery (cover unchanged). Allowed any
/// time (the owner's character, the owner's call).
public fun add_media_asset_by_owner(
    owner_cap: &OwnerCap,
    character: &mut Character,
    asset: MediaAsset,
    clock: &clock::Clock,
) {
    assert!(owner_cap.character_id == object::id(character), EWrongCharacter);
    add_media_asset_internal(character, asset, true, clock);
}

fun add_media_asset_internal(
    character: &mut Character,
    asset: MediaAsset,
    by_owner: bool,
    clock: &clock::Clock,
) {
    let kind = asset.kind;
    let uri = asset.uri;
    vector::push_back(&mut character.media_assets, asset);
    event::emit(MediaAssetAdded {
        character_id: object::id(character),
        kind,
        uri,
        index: vector::length(&character.media_assets) - 1,
        added_by_owner: by_owner,
        added_at_ms: clock::timestamp_ms(clock),
    });
}

/// Owner sets the cover to the gallery entry at `index`. This is the
/// "browse 設定集 → 選封面" flow: the owner picks one of their accumulated
/// variants as the public portrait. Aborts if the index is out of range.
public fun set_cover_from_media(
    owner_cap: &OwnerCap,
    character: &mut Character,
    index: u64,
    clock: &clock::Clock,
) {
    assert!(owner_cap.character_id == object::id(character), EWrongCharacter);
    assert!(index < vector::length(&character.media_assets), EMediaIndexOutOfRange);

    let uri = vector::borrow(&character.media_assets, index).uri;
    character.image_url = uri;
    event::emit(CharacterImageUpdated {
        character_id: object::id(character),
        new_image_url: character.image_url,
        updated_by_owner: true,
        updated_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── death writer (called by event.move in 1.6) ──────────────────────

/// Mark character dead. Idempotent: re-marking is a no-op (death record
/// cannot change once recorded). Package-visible so only sibling modules
/// (event, future world daemon) call it.
public(package) fun mark_dead(character: &mut Character, record: DeathRecord) {
    if (character.death.is_none()) {
        let by_event = record.by_event;
        let attributed_count = vector::length(&record.attributed_characters);
        let recorded_at_ms = record.recorded_at_ms;
        character.death = option::some(record);
        event::emit(CharacterDied {
            character_id: object::id(character),
            by_event,
            attributed_count,
            recorded_at_ms,
        });
    }
}

// ─── views ───────────────────────────────────────────────────────────

public fun is_valid(cap: &ControlCap, character: &Character): bool {
    cap.character_id == object::id(character) && cap.epoch == character.control_epoch
}

// Cap field accessors — needed by sibling modules (recruit) and SDK reads
// since cross-module direct field access is forbidden.

public fun owner_cap_character_id(cap: &OwnerCap): ID { cap.character_id }

public fun owner_cap_world_id(cap: &OwnerCap): ID { cap.world_id }

public fun owner_cap_minted_at_ms(cap: &OwnerCap): u64 { cap.minted_at_ms }

public fun owner_cap_cumulative_revenue(cap: &OwnerCap): u64 { cap.cumulative_revenue }

public fun control_cap_character_id(cap: &ControlCap): ID { cap.character_id }

public fun control_cap_epoch(cap: &ControlCap): u64 { cap.epoch }

public fun control_cap_saga_id(cap: &ControlCap): Option<ID> { cap.saga_id }

public fun character_id(character: &Character): ID { object::id(character) }

public fun control_epoch(character: &Character): u64 { character.control_epoch }

public fun world_id(character: &Character): ID { character.state.world_id }

public fun saga_id(character: &Character): Option<ID> { character.state.saga_id }

public fun current_scene_id(character: &Character): Option<ID> { character.state.current_scene_id }

public fun current_location_id(character: &Character): Option<ID> {
    character.state.current_location_id
}

public fun birth_ms(character: &Character): u64 { character.state.birth_ms }

public fun subscriber_count(character: &Character): u64 { character.subscriber_count }

/// Package-private — only `subscribe.move` should bump this.
public(package) fun increment_subscriber_count(character: &mut Character) {
    character.subscriber_count = character.subscriber_count + 1;
}

/// Package-private — only `subscribe.move` should decrement this.
/// Saturates at 0 to be defensive against double-unsubscribe bugs.
public(package) fun decrement_subscriber_count(character: &mut Character) {
    if (character.subscriber_count > 0) {
        character.subscriber_count = character.subscriber_count - 1;
    }
}

public fun profile(character: &Character): &CharacterProfile { &character.profile }

public fun physical_facts(profile: &CharacterProfile): &PhysicalFacts { &profile.physical_facts }

public fun profile_name(profile: &CharacterProfile): &String { &profile.name }

public fun profile_description(profile: &CharacterProfile): &String { &profile.description }

public fun physical_species(facts: &PhysicalFacts): &String { &facts.species }

public fun physical_gender(facts: &PhysicalFacts): &String { &facts.gender }

public fun physical_body(facts: &PhysicalFacts): &String { &facts.body }

public fun physical_age_years(facts: &PhysicalFacts): u8 { facts.age_years }

public fun attributes(character: &Character): &vector<AttributeValue> { &character.attributes }

public fun attribute_key(attr: &AttributeValue): &String { &attr.key }

public fun attribute_value(attr: &AttributeValue): u64 { attr.value }

public fun attribute_seed(attr: &AttributeValue): &vector<u8> { &attr.seed }

/// Find the first `AttributeValue` with `key`, or `None`.
public fun find_attribute_value(character: &Character, key: &String): Option<u64> {
    find_attribute_value_in(&character.attributes, key)
}

/// Find an attribute by key in any vector<AttributeValue> — same algorithm
/// as `find_attribute_value` but operates on a raw slice. Used by
/// `recruit::check_voucher_requirements` to validate proposed attributes
/// before mint, without needing a Character struct yet.
public fun find_attribute_value_in(
    attributes: &vector<AttributeValue>,
    key: &String,
): Option<u64> {
    let idx_opt = attributes.find_index!(|attr| attr.key == *key);
    if (idx_opt.is_some()) {
        option::some(vector::borrow(attributes, *idx_opt.borrow()).value)
    } else {
        option::none()
    }
}

public fun media_assets(character: &Character): &vector<MediaAsset> { &character.media_assets }

public fun image_url(character: &Character): &String { &character.image_url }

// ─── tag writers (called by event.move in 1.6) ──────────────────────

/// Add a tag or refresh an existing one. Idempotent on duplicate label
/// (mutates the existing entry's `source_event_id` + `affirmed_at_ms`
/// instead of pushing a new row). Package-private so only sibling
/// modules (event.move primarily) can write tags.
///
/// Per L1 v0.3 §6.6: Move does not enforce semantic uniqueness across
/// tag labels — composers may apply a tag twice with different
/// `source_event_id`s; the latest wins.
public(package) fun apply_tag(
    character: &mut Character,
    label: &String,
    source_event_id: Option<ID>,
    affirmed_at_ms: u64,
) {
    let existing_idx = character.tags.find_index!(|tag| tag.label == *label);
    if (existing_idx.is_some()) {
        let tag = vector::borrow_mut(&mut character.tags, *existing_idx.borrow());
        tag.source_event_id = source_event_id;
        tag.affirmed_at_ms = affirmed_at_ms;
    } else {
        vector::push_back(&mut character.tags, Tag {
            label: *label,
            source_event_id,
            affirmed_at_ms,
        });
    }
}

/// Remove a tag by label. Idempotent: no-op when the label is absent.
public(package) fun revoke_tag(character: &mut Character, label: &String) {
    let idx_opt = character.tags.find_index!(|tag| tag.label == *label);
    if (idx_opt.is_some()) {
        let _removed = vector::remove(&mut character.tags, *idx_opt.borrow());
    }
}

public fun has_tag(character: &Character, label: &String): bool {
    character.tags.any!(|tag| tag.label == *label)
}

public fun tag_count(character: &Character): u64 { vector::length(&character.tags) }

public fun tags(character: &Character): &vector<Tag> { &character.tags }

public fun tag_label(tag: &Tag): &String { &tag.label }

public fun tag_source_event_id(tag: &Tag): Option<ID> { tag.source_event_id }

public fun tag_affirmed_at_ms(tag: &Tag): u64 { tag.affirmed_at_ms }

public fun is_dead(character: &Character): bool { character.death.is_some() }

public fun death_record(character: &Character): &Option<DeathRecord> { &character.death }

public fun death_victim(record: &DeathRecord): ID { record.victim }

public fun death_by_event(record: &DeathRecord): Option<ID> { record.by_event }

public fun death_attributed(record: &DeathRecord): &vector<ID> { &record.attributed_characters }

public fun death_recorded_at_ms(record: &DeathRecord): u64 { record.recorded_at_ms }

// ─── SEAL approve ────────────────────────────────────────────────────
//
// SEAL discovery convention: function name starts with `seal_approve`, first
// param is `id: vector<u8>`. Both fns are side-effect free.

/// Saga 變體：持有當前有效 ControlCap 的人可以解密。
/// 三層檢查：cap 屬此 character / cap epoch 未撤銷 / SEAL id suffix 指向此 character.
entry fun seal_approve_control(id: vector<u8>, character: &Character, cap: &ControlCap) {
    assert!(cap.character_id == object::id(character), EWrongCharacter);
    assert!(cap.epoch == character.control_epoch, ENoAccess);
    assert!(id_belongs_to_character(&id, object::id(character)), EInvalidEncryptionId);
}

/// Owner 變體：持有 OwnerCap 的人可解密（唯讀審計）。
/// owner 的「唯讀」由 app 層保證（owner client 不暴露 remember API）。
entry fun seal_approve_owner(id: vector<u8>, character: &Character, owner_cap: &OwnerCap) {
    assert!(owner_cap.character_id == object::id(character), EWrongCharacter);
    assert!(id_belongs_to_character(&id, object::id(character)), EInvalidEncryptionId);
}

// ─── SEAL id layout helpers ──────────────────────────────────────────
//
// Layout: `<namespace_bytes> || bcs::to_bytes(character_id)`
// SDK constructs the id; Move verifies the suffix.

fun id_belongs_to_character(id: &vector<u8>, character_id: ID): bool {
    let cid_bytes = bcs::to_bytes(&character_id);
    has_suffix(id, &cid_bytes)
}

fun has_suffix(data: &vector<u8>, suffix: &vector<u8>): bool {
    let dlen = data.length();
    let slen = suffix.length();
    if (slen > dlen) return false;
    let offset = dlen - slen;
    let mut i = 0;
    while (i < slen) {
        if (data[offset + i] != suffix[i]) return false;
        i = i + 1;
    };
    true
}

// ─── value-type constructors (used by cli PTB + recruit redeem) ──────

public fun new_attribute_value(key: String, value: u64, seed: vector<u8>): AttributeValue {
    AttributeValue { key, value, seed }
}

public fun new_physical_facts(
    species: String,
    gender: String,
    body: String,
    age_years: u8,
): PhysicalFacts {
    PhysicalFacts { species, gender, body, age_years }
}

public fun new_character_profile(
    name: String,
    description: String,
    physical_facts: PhysicalFacts,
): CharacterProfile {
    CharacterProfile { name, description, physical_facts }
}

public fun new_media_asset(
    kind: u8,
    uri: String,
    walrus_blob_id: vector<u8>,
    metadata_uri: String,
): MediaAsset {
    MediaAsset { kind, uri, walrus_blob_id, metadata_uri }
}

public fun new_tag(
    label: String,
    source_event_id: Option<ID>,
    affirmed_at_ms: u64,
): Tag {
    Tag { label, source_event_id, affirmed_at_ms }
}

/// Construct a DeathRecord. Caller owns the invariants on attribution
/// (validity of `attributed_characters` IDs etc.).
public fun new_death_record(
    victim: ID,
    recorded_at_ms: u64,
    by_event: Option<ID>,
    attributed_characters: vector<ID>,
): DeathRecord {
    DeathRecord { victim, recorded_at_ms, by_event, attributed_characters }
}

// ─── tests ───────────────────────────────────────────────────────────

#[test_only]
use std::unit_test::{assert_eq, destroy};

/// Build a minimal Character + OwnerCap pair without going through
/// mint_character_internal. Used by every cap-lifecycle / SEAL test below
/// (predates the full mint path).
/// Build a Character in wild state (saga_id = None, current_location =
/// some fake id). For testing the wild path (walk / join intent / accept)
/// without going through full mint + release_to_wild ceremony.
#[test_only]
public fun make_wild_for_testing(ctx: &mut TxContext): (Character, OwnerCap) {
    let world_id = fake_id(ctx);
    let location_id = fake_id(ctx);
    let character = Character {
        id: object::new(ctx),
        control_epoch: 1,
        profile: CharacterProfile {
            name: b"Wild".to_string(),
            description: b"".to_string(),
            physical_facts: PhysicalFacts {
                species: b"human".to_string(),
                gender: b"unspecified".to_string(),
                body: b"".to_string(),
                age_years: 0,
            },
        },
        attributes: vector[],
        media_assets: vector[],
        state: CharacterState {
            world_id,
            saga_id: option::none(),
            current_scene_id: option::none(),
            current_location_id: option::some(location_id),
            birth_ms: 0,
        },
        tags: vector[],
        image_url: b"".to_string(),
        death: option::none(),
        subscriber_count: 0,
    };
    let character_id = object::id(&character);
    let owner_cap = OwnerCap {
        id: object::new(ctx),
        character_id,
        world_id,
        minted_at_ms: 0,
        cumulative_revenue: 0,
    };
    (character, owner_cap)
}

#[test_only]
public fun mint_character_for_testing(ctx: &mut TxContext): (Character, OwnerCap) {
    let world_id = fake_id(ctx);
    let character = Character {
        id: object::new(ctx),
        control_epoch: 1,
        profile: CharacterProfile {
            name: b"Test".to_string(),
            description: b"".to_string(),
            physical_facts: PhysicalFacts {
                species: b"human".to_string(),
                gender: b"unspecified".to_string(),
                body: b"".to_string(),
                age_years: 0,
            },
        },
        attributes: vector[],
        media_assets: vector[],
        state: CharacterState {
            world_id,
            saga_id: option::none(),
            current_scene_id: option::none(),
            current_location_id: option::none(),
            birth_ms: 0,
        },
        tags: vector[],
        image_url: b"".to_string(),
        death: option::none(),
        subscriber_count: 0,
    };
    let character_id = object::id(&character);
    let owner_cap = OwnerCap {
        id: object::new(ctx),
        character_id,
        world_id,
        minted_at_ms: 0,
        cumulative_revenue: 0,
    };
    (character, owner_cap)
}

#[test_only]
fun fake_id(ctx: &mut TxContext): ID {
    let uid = object::new(ctx);
    let id = object::uid_to_inner(&uid);
    object::delete(uid);
    id
}

#[test_only]
fun setup_saga_for_profile_test(
    ctx: &mut TxContext,
    clock: &clock::Clock,
): (World, world::AdminCap, Saga, StorytellerCap) {
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
        1001,
        clock,
        ctx,
    );
    (world, admin_cap, saga, cap)
}

#[test_only]
public fun destroy_wild_for_testing(character: Character, owner_cap: OwnerCap) {
    let Character {
        id,
        control_epoch: _,
        profile: _,
        attributes: _,
        media_assets: _,
        state: _,
        tags: _,
        image_url: _,
        death: _,
        subscriber_count: _,
    } = character;
    object::delete(id);
    let OwnerCap { id: owner_id, character_id: _, world_id: _, minted_at_ms: _, cumulative_revenue: _ } = owner_cap;
    object::delete(owner_id);
}

#[test]
fun mint_character_sets_initial_epoch_and_links_owner_cap() {
    let mut ctx = tx_context::dummy();
    let (character, owner_cap) = mint_character_for_testing(&mut ctx);

    assert_eq!(character.control_epoch, 1);
    assert_eq!(owner_cap.character_id, object::id(&character));

    destroy(character);
    destroy(owner_cap);
}

#[test]
fun issue_creates_cap_bound_to_current_epoch() {
    let mut ctx = tx_context::dummy();
    let (character, owner_cap) = mint_character_for_testing(&mut ctx);

    let cap = issue_control_cap(&character, &owner_cap, &mut ctx);

    assert_eq!(cap.epoch, 1);
    assert_eq!(cap.character_id, object::id(&character));
    assert!(cap.is_valid(&character));

    destroy(character);
    destroy(owner_cap);
    destroy(cap);
}

#[test]
fun revoke_invalidates_existing_cap() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);
    let cap = issue_control_cap(&character, &owner_cap, &mut ctx);

    revoke_all_control(&mut character, &owner_cap);

    assert_eq!(character.control_epoch, 2);
    assert!(!cap.is_valid(&character));

    destroy(character);
    destroy(owner_cap);
    destroy(cap);
}

#[test]
fun reassign_invalidates_old_cap_and_issues_fresh_one() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);
    let cap_a = issue_control_cap(&character, &owner_cap, &mut ctx);

    let cap_b = reassign_saga(&mut character, &owner_cap, &mut ctx);

    assert!(!cap_a.is_valid(&character));
    assert!(cap_b.is_valid(&character));
    assert_eq!(cap_b.epoch, 2);
    assert_eq!(character.control_epoch, 2);

    destroy(character);
    destroy(owner_cap);
    destroy(cap_a);
    destroy(cap_b);
}

#[test, expected_failure(abort_code = EWrongCharacter)]
fun issue_with_wrong_owner_cap_aborts() {
    let mut ctx = tx_context::dummy();
    let (char_a, owner_a) = mint_character_for_testing(&mut ctx);
    let (char_b, owner_b) = mint_character_for_testing(&mut ctx);

    // owner_b 簽發 char_a 的 cap → 預期 abort
    let cap = issue_control_cap(&char_a, &owner_b, &mut ctx);

    destroy(char_a);
    destroy(owner_a);
    destroy(char_b);
    destroy(owner_b);
    destroy(cap);
}

// --- SEAL approve tests ---

#[test_only]
fun make_seal_id(namespace: vector<u8>, character: &Character): vector<u8> {
    let mut id = namespace;
    id.append(bcs::to_bytes(&object::id(character)));
    id
}

#[test]
fun seal_approve_control_accepts_valid_cap_and_id() {
    let mut ctx = tx_context::dummy();
    let (character, owner_cap) = mint_character_for_testing(&mut ctx);
    let cap = issue_control_cap(&character, &owner_cap, &mut ctx);
    let id = make_seal_id(b"pub", &character);

    seal_approve_control(id, &character, &cap);

    destroy(character);
    destroy(owner_cap);
    destroy(cap);
}

#[test, expected_failure(abort_code = ENoAccess)]
fun seal_approve_control_rejects_revoked_cap() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);
    let cap = issue_control_cap(&character, &owner_cap, &mut ctx);
    let id = make_seal_id(b"pub", &character);

    revoke_all_control(&mut character, &owner_cap);
    seal_approve_control(id, &character, &cap);

    destroy(character);
    destroy(owner_cap);
    destroy(cap);
}

#[test, expected_failure(abort_code = EInvalidEncryptionId)]
fun seal_approve_control_rejects_id_for_other_character() {
    let mut ctx = tx_context::dummy();
    let (char_a, owner_a) = mint_character_for_testing(&mut ctx);
    let (char_b, owner_b) = mint_character_for_testing(&mut ctx);
    let cap_a = issue_control_cap(&char_a, &owner_a, &mut ctx);

    let id = make_seal_id(b"pub", &char_b);
    seal_approve_control(id, &char_a, &cap_a);

    destroy(char_a);
    destroy(owner_a);
    destroy(char_b);
    destroy(owner_b);
    destroy(cap_a);
}

#[test]
fun seal_approve_owner_accepts_valid_owner_cap_and_id() {
    let mut ctx = tx_context::dummy();
    let (character, owner_cap) = mint_character_for_testing(&mut ctx);
    let id = make_seal_id(b"prv", &character);

    seal_approve_owner(id, &character, &owner_cap);

    destroy(character);
    destroy(owner_cap);
}

#[test, expected_failure(abort_code = EInvalidEncryptionId)]
fun seal_approve_owner_rejects_id_for_other_character() {
    let mut ctx = tx_context::dummy();
    let (char_a, owner_a) = mint_character_for_testing(&mut ctx);
    let (char_b, owner_b) = mint_character_for_testing(&mut ctx);

    let id = make_seal_id(b"prv", &char_b);
    seal_approve_owner(id, &char_a, &owner_a);

    destroy(char_a);
    destroy(owner_a);
    destroy(char_b);
    destroy(owner_b);
}

#[test]
fun id_belongs_to_character_matches_bcs_suffix() {
    let mut ctx = tx_context::dummy();
    let (character, owner_cap) = mint_character_for_testing(&mut ctx);
    let cid = object::id(&character);

    assert!(id_belongs_to_character(&make_seal_id(b"any-namespace", &character), cid));
    assert!(id_belongs_to_character(&make_seal_id(b"", &character), cid));
    assert!(!id_belongs_to_character(&b"clearly-not-the-right-bytes", cid));
    assert!(!id_belongs_to_character(&b"x", cid));

    destroy(character);
    destroy(owner_cap);
}

// --- death writer tests ---

#[test]
fun mark_dead_records_death_and_emits_event() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);
    assert!(!is_dead(&character));

    let record = new_death_record(
        object::id(&character),
        1000,
        option::none(),
        vector[],
    );
    mark_dead(&mut character, record);

    assert!(is_dead(&character));
    assert!(character.death.borrow().recorded_at_ms == 1000);

    destroy(character);
    destroy(owner_cap);
}

#[test]
fun mark_dead_is_idempotent_keeps_first_record() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);

    let record_a = new_death_record(object::id(&character), 1000, option::none(), vector[]);
    let record_b = new_death_record(object::id(&character), 2000, option::none(), vector[]);

    mark_dead(&mut character, record_a);
    mark_dead(&mut character, record_b); // no-op

    // First record's timestamp survives.
    assert_eq!(character.death.borrow().recorded_at_ms, 1000);

    destroy(character);
    destroy(owner_cap);
}

// --- find_attribute_value test ---

#[test]
fun update_image_by_owner_updates_url() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);
    assert!(*image_url(&character) == b"".to_string());

    update_image_by_owner(
        &owner_cap,
        &mut character,
        b"https://walrus.example/portrait1.png".to_string(),
        &clock,
    );
    assert!(*image_url(&character) == b"https://walrus.example/portrait1.png".to_string());

    destroy(character);
    destroy(owner_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = EWrongCharacter)]
fun update_image_by_owner_wrong_owner_aborts() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut char_a, owner_a) = mint_character_for_testing(&mut ctx);
    let (char_b, owner_b) = mint_character_for_testing(&mut ctx);

    // owner_b tries to update char_a's image → abort.
    update_image_by_owner(&owner_b, &mut char_a, b"oops".to_string(), &clock);

    destroy(char_a);
    destroy(owner_a);
    destroy(char_b);
    destroy(owner_b);
    clock.destroy_for_testing();
}

#[test]
fun update_profile_description_by_storyteller_updates_description() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (world, admin_cap, saga, cap) = setup_saga_for_profile_test(&mut ctx, &clock);
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);
    character.state.saga_id = option::some(saga::saga_id(&saga));

    update_profile_description_by_storyteller(
        &cap,
        &saga,
        &mut character,
        b"patched profile".to_string(),
        &clock,
    );

    assert_eq!(
        *profile_description(profile(&character)),
        b"patched profile".to_string(),
    );

    destroy(character);
    destroy(owner_cap);
    saga::destroy_saga_for_testing(saga, cap);
    world::destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = saga::ECapSagaMismatch)]
fun update_profile_description_by_storyteller_rejects_wrong_cap() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (world_a, admin_a, saga_a, cap_a) = setup_saga_for_profile_test(&mut ctx, &clock);
    let (world_b, admin_b, saga_b, cap_b) = setup_saga_for_profile_test(&mut ctx, &clock);
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);
    character.state.saga_id = option::some(saga::saga_id(&saga_a));

    update_profile_description_by_storyteller(
        &cap_b,
        &saga_a,
        &mut character,
        b"bad patch".to_string(),
        &clock,
    );

    destroy(character);
    destroy(owner_cap);
    saga::destroy_saga_for_testing(saga_a, cap_a);
    saga::destroy_saga_for_testing(saga_b, cap_b);
    world::destroy_world_for_testing(world_a, admin_a);
    world::destroy_world_for_testing(world_b, admin_b);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = ECharacterSagaMismatch)]
fun update_profile_description_by_storyteller_rejects_character_outside_saga() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (world_a, admin_a, saga_a, cap_a) = setup_saga_for_profile_test(&mut ctx, &clock);
    let (world_b, admin_b, saga_b, cap_b) = setup_saga_for_profile_test(&mut ctx, &clock);
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);
    character.state.saga_id = option::some(saga::saga_id(&saga_a));

    update_profile_description_by_storyteller(
        &cap_b,
        &saga_b,
        &mut character,
        b"bad patch".to_string(),
        &clock,
    );

    destroy(character);
    destroy(owner_cap);
    saga::destroy_saga_for_testing(saga_a, cap_a);
    saga::destroy_saga_for_testing(saga_b, cap_b);
    world::destroy_world_for_testing(world_a, admin_a);
    world::destroy_world_for_testing(world_b, admin_b);
    clock.destroy_for_testing();
}

// --- gallery (設定集) tests ---

#[test]
fun add_media_asset_appends_without_changing_cover() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);
    // mint_character_for_testing mints with empty media_assets + empty cover.
    assert!(vector::length(media_assets(&character)) == 0);

    add_media_asset_by_owner(
        &owner_cap,
        &mut character,
        new_media_asset(0, b"https://walrus.example/stage.png".to_string(), vector[], b"".to_string()),
        &clock,
    );
    // Gallery grew; cover (image_url) is untouched.
    assert!(vector::length(media_assets(&character)) == 1);
    assert!(*image_url(&character) == b"".to_string());

    destroy(character);
    destroy(owner_cap);
    clock.destroy_for_testing();
}

#[test]
fun set_cover_from_media_picks_gallery_entry() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);

    add_media_asset_by_owner(
        &owner_cap, &mut character,
        new_media_asset(0, b"a.png".to_string(), vector[], b"".to_string()), &clock,
    );
    add_media_asset_by_owner(
        &owner_cap, &mut character,
        new_media_asset(0, b"b.png".to_string(), vector[], b"".to_string()), &clock,
    );

    // Owner picks gallery[1] as the cover.
    set_cover_from_media(&owner_cap, &mut character, 1, &clock);
    assert!(*image_url(&character) == b"b.png".to_string());

    destroy(character);
    destroy(owner_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = EMediaIndexOutOfRange)]
fun set_cover_from_media_out_of_range_aborts() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);

    // Empty gallery → index 0 is out of range.
    set_cover_from_media(&owner_cap, &mut character, 0, &clock);

    destroy(character);
    destroy(owner_cap);
    clock.destroy_for_testing();
}

#[test, expected_failure(abort_code = EWrongCharacter)]
fun add_media_asset_wrong_owner_aborts() {
    let mut ctx = tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut char_a, owner_a) = mint_character_for_testing(&mut ctx);
    let (char_b, owner_b) = mint_character_for_testing(&mut ctx);

    add_media_asset_by_owner(
        &owner_b, &mut char_a,
        new_media_asset(0, b"oops.png".to_string(), vector[], b"".to_string()), &clock,
    );

    destroy(char_a);
    destroy(owner_a);
    destroy(char_b);
    destroy(owner_b);
    clock.destroy_for_testing();
}

#[test]
fun find_attribute_value_in_finds_in_raw_vector() {
    let attrs = vector[
        new_attribute_value(b"will".to_string(), 80, vector[]),
        new_attribute_value(b"grace".to_string(), 60, vector[]),
    ];

    let v = find_attribute_value_in(&attrs, &b"will".to_string());
    assert!(v.is_some());
    assert_eq!(*v.borrow(), 80);

    let missing = find_attribute_value_in(&attrs, &b"unknown".to_string());
    assert!(missing.is_none());
}

#[test]
fun find_attribute_value_returns_value_or_none() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);

    vector::push_back(
        &mut character.attributes,
        new_attribute_value(b"will".to_string(), 80, vector[]),
    );
    vector::push_back(
        &mut character.attributes,
        new_attribute_value(b"grace".to_string(), 60, vector[]),
    );

    let v_will = find_attribute_value(&character, &b"will".to_string());
    assert!(v_will.is_some());
    assert_eq!(*v_will.borrow(), 80);

    let v_missing = find_attribute_value(&character, &b"unknown".to_string());
    assert!(v_missing.is_none());

    destroy(character);
    destroy(owner_cap);
}

// --- apply_tag / revoke_tag tests (1.6 prerequisite) ---

#[test]
fun apply_tag_adds_new_tag_when_label_missing() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);

    assert!(!has_tag(&character, &b"wounded".to_string()));

    apply_tag(&mut character, &b"wounded".to_string(), option::none(), 1_000);

    assert!(has_tag(&character, &b"wounded".to_string()));
    assert_eq!(tag_count(&character), 1);

    destroy(character);
    destroy(owner_cap);
}

#[test]
fun apply_tag_is_idempotent_on_duplicate_label() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);

    apply_tag(&mut character, &b"wounded".to_string(), option::none(), 1_000);
    apply_tag(&mut character, &b"wounded".to_string(), option::none(), 2_000);
    apply_tag(&mut character, &b"wounded".to_string(), option::none(), 3_000);

    assert_eq!(tag_count(&character), 1);
    // Latest write wins on affirmed_at_ms.
    let tag = vector::borrow(&character.tags, 0);
    assert_eq!(tag.affirmed_at_ms, 3_000);

    destroy(character);
    destroy(owner_cap);
}

#[test]
fun revoke_tag_removes_existing_label() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);

    apply_tag(&mut character, &b"wounded".to_string(), option::none(), 1_000);
    apply_tag(&mut character, &b"betrayed".to_string(), option::none(), 1_500);
    assert_eq!(tag_count(&character), 2);

    revoke_tag(&mut character, &b"wounded".to_string());

    assert!(!has_tag(&character, &b"wounded".to_string()));
    assert!(has_tag(&character, &b"betrayed".to_string()));
    assert_eq!(tag_count(&character), 1);

    destroy(character);
    destroy(owner_cap);
}

#[test]
fun revoke_tag_is_idempotent_on_missing_label() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character_for_testing(&mut ctx);

    // No-op on empty tag list.
    revoke_tag(&mut character, &b"never-existed".to_string());
    assert_eq!(tag_count(&character), 0);

    apply_tag(&mut character, &b"wounded".to_string(), option::none(), 1_000);
    revoke_tag(&mut character, &b"never-existed".to_string());
    // The unrelated revoke didn't touch the existing tag.
    assert_eq!(tag_count(&character), 1);
    assert!(has_tag(&character, &b"wounded".to_string()));

    destroy(character);
    destroy(owner_cap);
}
