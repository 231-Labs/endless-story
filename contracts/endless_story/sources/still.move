/// 劇照 Still — a collectible moment from the living narrative.
///
/// The narrative engine already paints event-moment images (角色 gallery 的
/// event_moment, stored on Walrus). This module mints such a moment as an
/// ownable, Kiosk-tradeable NFT — the demand side of the character economy:
/// a fan buys the 劇照 of a scene they love; the proceeds can flow back to the
/// saga treasury / the character (royalty wiring is a follow-up — see
/// docs/CHARACTER_ECONOMY.md).
///
/// Authority: minting is StorytellerCap-gated (the troupe issues its own
/// 戲單/劇照), mirroring scene/event creation. Trading is plain Kiosk —
/// `Still` has `key + store`, no transfer policy gymnastics in v1.
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
use endless_story::saga::{Self, Saga, StorytellerCap};

// ─── one-time witness + Display ──────────────────────────────────────

public struct STILL has drop {}

fun init(otw: STILL, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    let mut d = display::new<Still>(&publisher, ctx);
    d.add(b"name".to_string(), b"{title}".to_string());
    d.add(b"image_url".to_string(), b"{image_url}".to_string());
    d.add(b"description".to_string(), b"無盡敘界・劇照 — a moment from the living narrative".to_string());
    d.update_version();
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(d, ctx.sender());
}

// ─── the collectible ─────────────────────────────────────────────────

/// One minted 劇照. `edition` is the 1-based numbering when the same moment
/// is issued more than once (戲單編號).
public struct Still has key, store {
    id: UID,
    saga_id: ID,
    /// the character whose moment this is (royalty target, follow-up)
    character_id: ID,
    /// Walrus blob id of the image (canonical reference)
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
    edition: u64,
}

// ─── mint (saga-gated) ───────────────────────────────────────────────

/// Mint a 劇照 from an event moment. Returns the Still so the PTB can
/// transfer it to a recipient or place it straight into a Kiosk.
public fun mint_still(
    cap: &StorytellerCap,
    saga: &Saga,
    character_id: ID,
    walrus_blob_id: String,
    image_url: String,
    title: String,
    edition: u64,
    ctx: &mut TxContext,
): Still {
    saga::assert_cap(cap, saga);
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

// ─── test support ────────────────────────────────────────────────────

#[test_only]
public fun destroy_still_for_testing(s: Still) {
    let Still { id, .. } = s;
    object::delete(id);
}
