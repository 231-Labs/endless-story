/**
 * Sui Kiosk read helpers — list the Stills currently listed for sale in a
 * kiosk, with prices. No `@mysten/kiosk` dependency: we walk the kiosk's
 * dynamic fields directly.
 *
 * A listed item has a `0x2::kiosk::Listing { id, is_exclusive }` dynamic field
 * whose VALUE is the price (u64 MIST). The item itself (a Still) is held as a
 * `0x2::kiosk::Item` dynamic OBJECT field and is readable by its object id.
 */
import { bcs } from '@mysten/sui/bcs';
import type { SuiClientTypes } from '@mysten/sui/client';
import type { SuiClient } from '../client.js';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/shared/contract-ids';

export interface KioskStillListing {
    stillId: string;
    /** listing price in MIST (1 SUI = 1e9 MIST), as a string. */
    priceMist: string;
    title: string;
    imageUrl: string;
    edition: number;
    walrusBlobId: string;
}

const LISTING_TYPE = '0x2::kiosk::Listing';

// Over gRPC, dynamic-field names/values arrive BCS-encoded (not parsed JSON), so
// we decode them explicitly. `Listing { id: ID, is_exclusive: bool }` is the
// dynamic-field name whose value is the u64 price (in MIST).
const ListingName = bcs.struct('Listing', { id: bcs.Address, is_exclusive: bcs.bool() });

/**
 * List Stills currently listed for sale in `kioskId`, with their prices.
 * Skips non-Still items and unreadable listings. Returns [] for an empty or
 * unknown kiosk.
 */
export async function listKioskStillListings(
    client: SuiClient,
    kioskId: string,
): Promise<KioskStillListing[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg || !kioskId) return [];
    const stillType = `${pkg}::still::Still`;

    // 1) collect (itemId, listing-name) pairs from the Listing dynamic fields.
    //    The item id lives in the BCS-encoded Listing name.
    const listings: { itemId: string; name: SuiClientTypes.DynamicFieldName }[] = [];
    let cursor: string | null = null;
    for (;;) {
        const page = await client.core.listDynamicFields({ parentId: kioskId, cursor });
        for (const f of page.dynamicFields) {
            if (f.name.type !== LISTING_TYPE) continue;
            try {
                const { id } = ListingName.parse(f.name.bcs);
                if (id) listings.push({ itemId: id, name: f.name });
            } catch {
                // undecodable name — skip
            }
        }
        if (!page.hasNextPage || !page.cursor) break;
        cursor = page.cursor;
    }
    if (listings.length === 0) return [];

    // 2) per listing, in parallel: read its price (the Listing field's u64 value)
    //    + the Still content. Unreadable / non-Still entries drop to null.
    const results = await Promise.all(
        listings.map(async ({ itemId, name }): Promise<KioskStillListing | null> => {
            try {
                const [priceField, itemObj] = await Promise.all([
                    client.core.getDynamicField({ parentId: kioskId, name }),
                    client.core.getObject({ objectId: itemId, include: { json: true } }),
                ]);
                if (itemObj.object.type !== stillType) return null;
                const f = itemObj.object.json as Record<string, unknown> | null;
                if (!f) return null;
                const priceMist = String(bcs.u64().parse(priceField.dynamicField.value.bcs) ?? '0');
                return {
                    stillId: itemId,
                    priceMist,
                    title: f.title as string,
                    imageUrl: f.image_url as string,
                    edition: Number(f.edition ?? 0),
                    walrusBlobId: f.walrus_blob_id as string,
                };
            } catch {
                return null; // skip unreadable listing
            }
        }),
    );
    return results.filter((x): x is KioskStillListing => x !== null);
}
