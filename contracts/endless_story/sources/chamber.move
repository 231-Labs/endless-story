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

use sui::dynamic_field as df;
use sui::event;

use endless_story::saga::{Self, Saga, StorytellerCap};
use endless_story::scene::{Self, Scene};
use endless_story::character::{Self, OwnerCap};

// ─── errors / constants ──────────────────────────────────────────────

const ESceneSagaMismatch: u64 = 1;
const EChamberNotEnabled: u64 = 2;
const ENotChamberOwner: u64 = 3;
const EChamberAlreadyEnabled: u64 = 4;
const ETooManyObjects: u64 = 5;

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
