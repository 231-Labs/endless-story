/// 劇照 Still — a collectible moment from the living narrative.
///
/// The narrative engine paints event-moment images (stored on Walrus). This
/// module mints such a moment as an ownable, Kiosk-tradeable NFT — the demand
/// side of the character economy: a fan collects the 劇照 of a scene they
/// love; proceeds can flow back to the saga treasury / the character
/// (royalty wiring is a follow-up — see docs/CHARACTER_ECONOMY.md).
///
/// Edition model (戲單/沖印): ONE moment (= one Walrus image) can be collected
/// by MANY fans. The shared `StillRegistry` tracks, per moment key (the blob
/// id), how many editions were minted — editions auto-increment on-chain, so
/// numbering is trustless (no server-side counter to fudge). 名場面 can be
/// capped via `set_edition_limit`; uncapped moments are open editions.
///
/// Authority: minting + curation are StorytellerCap-gated (the troupe issues
/// its own 戲單/劇照), mirroring scene/event creation. Trading is plain Kiosk —
/// `Still` has `key + store`, no transfer-policy gymnastics in v1.
///
/// Display: wallets/explorers render `{title}` + `{image_url}` via the Sui
/// Display object claimed in `init`.
///
/// Chamber tie-in: a chamber placement can reference an owned Still through
/// `chamber::ObjectPlacement.source_object` — "在 A 的廂房看到 B 的劇照" works
/// with zero chamber.move changes.
module endless_story::still;

use std::string::String;
use sui::display;
use sui::event;
use sui::package;
use sui::table::{Self, Table};
use endless_story::saga::{Self, Saga, StorytellerCap};

// ─── errors ──────────────────────────────────────────────────────────

const ERegistrySagaMismatch: u64 = 1;
const EEditionSoldOut: u64 = 2;
const ELimitBelowMinted: u64 = 3;

// ─── one-time witness + Display ──────────────────────────────────────

public struct STILL has drop {}

fun init(otw: STILL, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    let mut d = display::new<Still>(&publisher, ctx);
    d.add(b"name".to_string(), b"{title} · 第{edition}版".to_string());
    d.add(b"image_url".to_string(), b"{image_url}".to_string());
    d.add(b"description".to_string(), b"無盡敘界・劇照 — a moment from the living narrative".to_string());
    d.update_version();
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(d, ctx.sender());
}

// ─── registry (shared, one per saga) ─────────────────────────────────

/// Per-saga edition ledger. Moment key = the image's Walrus blob id —
/// one image is one moment; many fans can each hold an edition of it.
public struct StillRegistry has key {
    id: UID,
    saga_id: ID,
    /// moment key → editions minted so far
    minted: Table<String, u64>,
    /// moment key → max editions (absent = open edition)
    limits: Table<String, u64>,
}

public struct StillRegistryCreated has copy, drop {
    registry_id: ID,
    saga_id: ID,
}

/// Create + share the saga's registry (bootstrap, once per saga).
public fun create_registry(cap: &StorytellerCap, saga: &Saga, ctx: &mut TxContext) {
    saga::assert_cap(cap, saga);
    let registry = StillRegistry {
        id: object::new(ctx),
        saga_id: saga::saga_id(saga),
        minted: table::new(ctx),
        limits: table::new(ctx),
    };
    event::emit(StillRegistryCreated {
        registry_id: object::id(&registry),
        saga_id: saga::saga_id(saga),
    });
    transfer::share_object(registry);
}

/// Curate a 名場面: cap its editions. Must not undercut already-minted count.
public fun set_edition_limit(
    cap: &StorytellerCap,
    saga: &Saga,
    registry: &mut StillRegistry,
    moment_key: String,
    limit: u64,
) {
    saga::assert_cap(cap, saga);
    assert!(registry.saga_id == saga::saga_id(saga), ERegistrySagaMismatch);
    assert!(limit >= minted_count(registry, moment_key), ELimitBelowMinted);
    if (registry.limits.contains(moment_key)) {
        *registry.limits.borrow_mut(moment_key) = limit;
    } else {
        registry.limits.add(moment_key, limit);
    };
}

// ─── the collectible ─────────────────────────────────────────────────

/// One minted 劇照 edition. `edition` is 1-based, assigned by the registry.
public struct Still has key, store {
    id: UID,
    saga_id: ID,
    /// the character whose moment this is (royalty target, follow-up)
    character_id: ID,
    /// Walrus blob id of the image (canonical reference + moment key)
    walrus_blob_id: String,
    /// resolved image url (aggregator) — consumed by Display / wallets
    image_url: String,
    /// 題名, e.g. 「水袖那一夜」
    title: String,
    edition: u64,
}

public struct StillMinted has copy, drop {
    still_id: ID,
    saga_id: ID,
    character_id: ID,
    moment_key: String,
    edition: u64,
}

// ─── mint (saga-gated, edition tracked on-chain) ─────────────────────

/// Mint the next edition of a moment. Aborts with `EEditionSoldOut` once a
/// capped moment is fully collected. Returns the Still so the PTB can
/// transfer it to the collector or place it straight into a Kiosk.
public fun mint_still(
    cap: &StorytellerCap,
    saga: &Saga,
    registry: &mut StillRegistry,
    character_id: ID,
    walrus_blob_id: String,
    image_url: String,
    title: String,
    ctx: &mut TxContext,
): Still {
    saga::assert_cap(cap, saga);
    assert!(registry.saga_id == saga::saga_id(saga), ERegistrySagaMismatch);

    let edition = minted_count(registry, walrus_blob_id) + 1;
    if (registry.limits.contains(walrus_blob_id)) {
        assert!(edition <= *registry.limits.borrow(walrus_blob_id), EEditionSoldOut);
    };
    if (registry.minted.contains(walrus_blob_id)) {
        *registry.minted.borrow_mut(walrus_blob_id) = edition;
    } else {
        registry.minted.add(walrus_blob_id, edition);
    };

    let still = Still {
        id: object::new(ctx),
        saga_id: saga::saga_id(saga),
        character_id,
        walrus_blob_id,
        image_url,
        title,
        edition,
    };
    event::emit(StillMinted {
        still_id: object::id(&still),
        saga_id: saga::saga_id(saga),
        character_id,
        moment_key: walrus_blob_id,
        edition,
    });
    still
}

// ─── views ───────────────────────────────────────────────────────────

public fun still_id(s: &Still): ID { object::id(s) }
public fun saga_id(s: &Still): ID { s.saga_id }
public fun character_id(s: &Still): ID { s.character_id }
public fun walrus_blob_id(s: &Still): String { s.walrus_blob_id }
public fun image_url(s: &Still): String { s.image_url }
public fun title(s: &Still): String { s.title }
public fun edition(s: &Still): u64 { s.edition }

/// Editions minted so far for a moment (0 if never minted).
public fun minted_count(registry: &StillRegistry, moment_key: String): u64 {
    if (registry.minted.contains(moment_key)) *registry.minted.borrow(moment_key) else 0
}

/// Edition cap for a moment; `none` = open edition.
public fun edition_limit(registry: &StillRegistry, moment_key: String): Option<u64> {
    if (registry.limits.contains(moment_key)) {
        option::some(*registry.limits.borrow(moment_key))
    } else {
        option::none()
    }
}

public fun registry_saga_id(registry: &StillRegistry): ID { registry.saga_id }

// ─── test support ────────────────────────────────────────────────────

#[test_only]
public fun new_registry_for_testing(saga: &Saga, ctx: &mut TxContext): StillRegistry {
    StillRegistry {
        id: object::new(ctx),
        saga_id: saga::saga_id(saga),
        minted: table::new(ctx),
        limits: table::new(ctx),
    }
}

#[test_only]
public fun destroy_registry_for_testing(r: StillRegistry) {
    let StillRegistry { id, saga_id: _, minted, limits } = r;
    minted.drop();
    limits.drop();
    object::delete(id);
}

#[test_only]
public fun destroy_still_for_testing(s: Still) {
    let Still { id, .. } = s;
    object::delete(id);
}
