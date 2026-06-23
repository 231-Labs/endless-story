/// Chamber — owner-decorated furnishing layer on top of an Endless Story `Scene`.
///
/// Why a separate module:
///   `scene.move` is imported by `character.move`, so `scene` CANNOT import
///   `character` (dependency cycle). This module sits in the same package and
///   imports BOTH, letting us gate decorating by the character's `OwnerCap`
///   without touching the audited scene struct.
///
/// Authority split (the whole point):
///   - SAGA  keeps narrative control  → create_scene / params / character
///     presence stay StorytellerCap- or package-gated in scene.move.
///   - OWNER gets furnishing control only → `decorate` overwrites ONLY the
///     on-chain object layout. It cannot reach params / access / characters.
///
/// Storage split (answers the Walrus lifecycle problem):
///   - The MUTABLE, small part — object list + (x,y,z, yaw) — lives ON-CHAIN
///     in a dynamic field, overwritten in place each decorate. No orphan
///     blobs, no waiting for expiry, no "edit nukes the whole file".
///   - The IMMUTABLE, heavy part — each object's `.glb` — lives in Walrus,
///     stored ONCE (long-lived/permanent) and referenced by blob id. A
///     rearrange never re-uploads an asset.
///   Coordinates are millimetres, offset-encoded (Move has no signed ints):
///     actual_mm = stored - ORIGIN_MM  → range about ±100 m around origin.
module endless_story::chamber;

use std::string::String;
use sui::dynamic_field as df;
use sui::event;
use sui::kiosk::{Self, KioskOwnerCap};

use endless_story::saga::{Self, Saga, StorytellerCap};
use endless_story::scene::{Self, Scene};
use endless_story::character::{Self, OwnerCap};

// ─── errors / constants ──────────────────────────────────────────────

const ESceneSagaMismatch: u64 = 1;
const EChamberNotEnabled: u64 = 2;
const ENotChamberOwner: u64 = 3;
const EChamberAlreadyEnabled: u64 = 4;
const ETooManyObjects: u64 = 5;
const ENotVaultOwner: u64 = 6;

/// Offset so positions can be negative. actual_mm = stored_mm - ORIGIN_MM.
const ORIGIN_MM: u32 = 100_000;
/// Guard rail on layout size to keep decorate gas bounded.
const MAX_OBJECTS: u64 = 256;

// ─── dynamic-field key + values ──────────────────────────────────────

public struct FurnishingKey has copy, drop, store {}

/// One placed object.
///   `kind`          : 0 = glb prop (static kit OR parametric), 1 = 2D 掛軸/
///                     still rendered as a textured quad.
///   `asset_blob_id` : Walrus blob — a `.glb` (kind 0) or an image (kind 1),
///                     uploaded once and reused; only the transform changes.
///   `source_object` : the on-chain NFT this placement depicts, if any (a
///                     parametric prop or a gifted item). `none` for plain
///                     décor. Lets a room reference an ownable / giftable
///                     object without owning the placement itself.
public struct ObjectPlacement has copy, drop, store {
    kind: u8,
    asset_blob_id: vector<u8>,
    source_object: Option<ID>,
    x_mm: u32,                 // offset-encoded; actual = x_mm - ORIGIN_MM
    y_mm: u32,
    z_mm: u32,
    yaw_deg: u16,              // 0..359
    scale_pct: u16,            // 100 = 1.0x
}

/// Held as a dynamic field on the Scene's UID, so the core Scene struct and
/// all its constructors are untouched.
public struct Furnishing has store {
    chamber_owner_character_id: ID,
    objects: vector<ObjectPlacement>,
    layout_version: u64,
}

// ─── events ──────────────────────────────────────────────────────────

public struct ChamberEnabled has copy, drop {
    scene_id: ID,
    owner_character_id: ID,
}

public struct ChamberDecorated has copy, drop {
    scene_id: ID,
    owner_character_id: ID,
    object_count: u64,
    layout_version: u64,
}

// ─── PersonalVault — self-created collector room + Kiosk ─────────────
//
// Any wallet creates one in a single PTB (no StorytellerCap needed).
// Lifecycle:
//   1. User calls `create_personal_vault` → returns (KioskOwnerCap, VaultTicket)
//   2. PTB transfers both to ctx.sender()
//   3. User later calls `save_layout` to anchor the Walrus layout blob on-chain
//   4. Stills placed in the Kiosk are tradeable via standard Sui Kiosk protocol

/// Proof-of-ownership token in the user's wallet.
/// Lets the client discover (vault_id, kiosk_id) without a shared registry.
public struct VaultTicket has key {
    id: UID,
    vault_id: ID,
    kiosk_id: ID,
}

/// Shared object — on-chain anchor for the vault layout + kiosk reference.
/// Owner-gated writes; publicly readable.
public struct PersonalVault has key {
    id: UID,
    owner: address,
    kiosk_id: ID,
    /// Walrus blob id of the full layout JSON (positions, lights, AI props).
    /// `none` until the first `save_layout` call.
    layout_blob_id: Option<String>,
    layout_version: u64,
}

public struct PersonalVaultCreated has copy, drop {
    vault_id: ID,
    kiosk_id: ID,
    owner: address,
}

/// Any wallet calls this once. Creates a Kiosk + PersonalVault atomically.
/// Returns (KioskOwnerCap, VaultTicket) — caller's PTB must
/// `transferObjects([cap, ticket], ctx.sender())`.
/// Pass `option::some(blob_id)` in `initial_layout_blob_id` to save an
/// initial layout in the same transaction; `option::none()` otherwise.
public fun create_personal_vault(
    initial_layout_blob_id: Option<String>,
    ctx: &mut TxContext,
): (KioskOwnerCap, VaultTicket) {
    let (kiosk_obj, kiosk_cap) = kiosk::new(ctx);
    let kiosk_id = object::id(&kiosk_obj);
    transfer::public_share_object(kiosk_obj);

    let layout_version = if (option::is_some(&initial_layout_blob_id)) { 1 } else { 0 };
    let vault = PersonalVault {
        id: object::new(ctx),
        owner: ctx.sender(),
        kiosk_id,
        layout_blob_id: initial_layout_blob_id,
        layout_version,
    };
    let vault_id = object::id(&vault);
    event::emit(PersonalVaultCreated { vault_id, kiosk_id, owner: ctx.sender() });
    transfer::share_object(vault);

    let ticket = VaultTicket { id: object::new(ctx), vault_id, kiosk_id };
    (kiosk_cap, ticket)
}

/// Self-service vault creation as a single wallet call: creates the Kiosk +
/// PersonalVault and routes the KioskOwnerCap + VaultTicket to the caller.
///
/// Prefer this over calling `create_personal_vault` directly from a PTB: that
/// returns the `VaultTicket`, which is `key`-only and therefore cannot be moved
/// by a PTB `TransferObjects` command. Here the defining module transfers it,
/// so a plain wallet transaction works.
#[allow(lint(self_transfer))]
public fun create_vault(
    initial_layout_blob_id: Option<String>,
    ctx: &mut TxContext,
) {
    let (kiosk_cap, ticket) = create_personal_vault(initial_layout_blob_id, ctx);
    transfer::public_transfer(kiosk_cap, ctx.sender());
    transfer::transfer(ticket, ctx.sender());
}

/// Anchor a new Walrus layout blob for the vault.
/// Only the wallet that created the vault (vault.owner) may call this.
public fun save_layout(
    vault: &mut PersonalVault,
    blob_id: String,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == vault.owner, ENotVaultOwner);
    vault.layout_blob_id = option::some(blob_id);
    vault.layout_version = vault.layout_version + 1;
}

// ─── PersonalVault views ─────────────────────────────────────────────

public fun vault_owner(v: &PersonalVault): address { v.owner }
public fun vault_kiosk_id(v: &PersonalVault): ID { v.kiosk_id }
public fun vault_layout_blob_id(v: &PersonalVault): Option<String> { v.layout_blob_id }
public fun vault_layout_version(v: &PersonalVault): u64 { v.layout_version }

// ─── VaultTicket views ───────────────────────────────────────────────

public fun ticket_vault_id(t: &VaultTicket): ID { t.vault_id }
public fun ticket_kiosk_id(t: &VaultTicket): ID { t.kiosk_id }

// ─── constructor for PTB / frontend ──────────────────────────────────

public fun new_placement(
    kind: u8,
    asset_blob_id: vector<u8>,
    source_object: Option<ID>,
    x_mm: u32,
    y_mm: u32,
    z_mm: u32,
    yaw_deg: u16,
    scale_pct: u16,
): ObjectPlacement {
    ObjectPlacement { kind, asset_blob_id, source_object, x_mm, y_mm, z_mm, yaw_deg, scale_pct }
}

// ─── saga grants decorate rights (once per scene) ────────────────────

/// Saga turns an existing Scene into a decoratable chamber owned by a
/// character. Saga-gated — the ONLY saga touchpoint; afterwards the owner
/// decorates independently.
public fun enable_chamber(
    cap: &StorytellerCap,
    saga: &Saga,
    scene: &mut Scene,
    owner_character_id: ID,
) {
    saga::assert_cap(cap, saga);
    assert!(scene::saga_id(scene) == saga::saga_id(saga), ESceneSagaMismatch);
    assert!(!df::exists(scene::uid(scene), FurnishingKey {}), EChamberAlreadyEnabled);

    df::add(
        scene::uid_mut(scene),
        FurnishingKey {},
        Furnishing {
            chamber_owner_character_id: owner_character_id,
            objects: vector[],
            layout_version: 0,
        },
    );

    event::emit(ChamberEnabled {
        scene_id: scene::scene_id(scene),
        owner_character_id,
    });
}

// ─── owner decorates (object layout ONLY) ────────────────────────────

/// Character owner re-arranges the room: overwrites ONLY the object layout
/// in place. Cannot touch scene params / access / character presence —
/// those are not reachable from here.
public fun decorate(
    scene: &mut Scene,
    owner_cap: &OwnerCap,
    new_objects: vector<ObjectPlacement>,
) {
    assert!(df::exists(scene::uid(scene), FurnishingKey {}), EChamberNotEnabled);
    assert!(vector::length(&new_objects) <= MAX_OBJECTS, ETooManyObjects);

    // Snapshot the scene id while the immutable borrow is still allowed; the
    // mutable furnishing borrow below would otherwise conflict with reading it.
    let scene_id = scene::scene_id(scene);

    let furnishing: &mut Furnishing =
        df::borrow_mut(scene::uid_mut(scene), FurnishingKey {});

    // Authority = holding the OwnerCap of the chamber's character.
    assert!(
        character::owner_cap_character_id(owner_cap) == furnishing.chamber_owner_character_id,
        ENotChamberOwner,
    );

    furnishing.objects = new_objects; // overwrite in place — old layout dropped, no orphan blob
    furnishing.layout_version = furnishing.layout_version + 1;

    // Copy out the values for the event so the &mut borrow ends before emit.
    let owner_character_id = furnishing.chamber_owner_character_id;
    let object_count = vector::length(&furnishing.objects);
    let layout_version = furnishing.layout_version;

    event::emit(ChamberDecorated {
        scene_id,
        owner_character_id,
        object_count,
        layout_version,
    });
}

// ─── views ───────────────────────────────────────────────────────────

public fun is_chamber(scene: &Scene): bool {
    df::exists(scene::uid(scene), FurnishingKey {})
}

public fun chamber_owner(scene: &Scene): ID {
    let f: &Furnishing = df::borrow(scene::uid(scene), FurnishingKey {});
    f.chamber_owner_character_id
}

public fun layout_version(scene: &Scene): u64 {
    let f: &Furnishing = df::borrow(scene::uid(scene), FurnishingKey {});
    f.layout_version
}

public fun object_count(scene: &Scene): u64 {
    let f: &Furnishing = df::borrow(scene::uid(scene), FurnishingKey {});
    vector::length(&f.objects)
}

public fun objects(scene: &Scene): &vector<ObjectPlacement> {
    let f: &Furnishing = df::borrow(scene::uid(scene), FurnishingKey {});
    &f.objects
}

// ─── ObjectPlacement field views (for SDK read / off-chain decode) ────

public fun placement_kind(p: &ObjectPlacement): u8 { p.kind }
public fun placement_asset_blob_id(p: &ObjectPlacement): vector<u8> { p.asset_blob_id }
public fun placement_source_object(p: &ObjectPlacement): Option<ID> { p.source_object }
public fun placement_x_mm(p: &ObjectPlacement): u32 { p.x_mm }
public fun placement_y_mm(p: &ObjectPlacement): u32 { p.y_mm }
public fun placement_z_mm(p: &ObjectPlacement): u32 { p.z_mm }
public fun placement_yaw_deg(p: &ObjectPlacement): u16 { p.yaw_deg }
public fun placement_scale_pct(p: &ObjectPlacement): u16 { p.scale_pct }

/// Offset used to encode signed millimetre coordinates into u32.
public fun origin_mm(): u32 { ORIGIN_MM }
