/**
 * Sui Kiosk read helpers — list the Stills currently listed for sale in a
 * kiosk, with prices. No `@mysten/kiosk` dependency: we walk the kiosk's
 * dynamic fields directly.
 *
 * A listed item has a `0x2::kiosk::Listing { id, is_exclusive }` dynamic field
 * whose VALUE is the price (u64 MIST). The item itself (a Still) is held as a
 * `0x2::kiosk::Item` dynamic OBJECT field and is readable by its object id.
 */
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

type DynamicFieldName = { type: string; value: unknown };

const LISTING_TYPE = '0x2::kiosk::Listing';

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

    // 1) collect (itemId, listing-name) pairs from the Listing dynamic fields
    const listings: { itemId: string; name: DynamicFieldName }[] = [];
    let cursor: string | null | undefined = null;
    for (;;) {
        const page = await client.getDynamicFields({ parentId: kioskId, cursor });
        for (const f of page.data) {
            if (f.name?.type !== LISTING_TYPE) continue;
            const itemId = (f.name.value as { id?: string } | undefined)?.id;
            if (itemId) listings.push({ itemId, name: f.name });
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    if (listings.length === 0) return [];

    // 2) per listing, in parallel: read its price (Field<Listing,u64>.value) +
    //    the Still content. Unreadable / non-Still entries drop to null.
    const results = await Promise.all(
        listings.map(async ({ itemId, name }): Promise<KioskStillListing | null> => {
            try {
                const [priceField, itemObj] = await Promise.all([
                    client.getDynamicFieldObject({ parentId: kioskId, name }),
                    client.getObject({ id: itemId, options: { showContent: true, showType: true } }),
                ]);
                if (itemObj.data?.type !== stillType) return null;
                const ic = itemObj.data?.content;
                if (ic?.dataType !== 'moveObject') return null;
                const pf = priceField.data?.content;
                const priceMist =
                    pf?.dataType === 'moveObject'
                        ? String((pf as { fields: Record<string, unknown> }).fields.value ?? '0')
                        : '0';
                const f = (ic as { fields: Record<string, unknown> }).fields;
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
