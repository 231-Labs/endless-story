/**
 * Subscribe view queries — Subscription objects + event log scans.
 */
import * as gen from '../generated/endless_story/subscribe.js';
import type { SuiClientTypes } from '@mysten/sui/client';
import type { SuiClient } from '../client.js';

export { gen as raw };

export const getSubscription = (client: SuiClient, subscriptionId: string) =>
    gen.Subscription.get({ client, objectId: subscriptionId });

/**
 * List `Subscription` objects owned by `address`. Use this to power
 * "my subscriptions" UI.
 */
export async function listSubscriptionsForAddress(
    client: SuiClient,
    owner: string,
    packageId: string,
): Promise<{
    subscriptionId: string;
    characterId: string;
    subscriber: string;
    subscribedAtMs: string;
}[]> {
    const structType = `${packageId}::subscribe::Subscription`;
    const out: {
        subscriptionId: string;
        characterId: string;
        subscriber: string;
        subscribedAtMs: string;
    }[] = [];
    let cursor: string | null = null;
    for (;;) {
        const page: SuiClientTypes.ListOwnedObjectsResponse<{ json: true }> = await client.core.listOwnedObjects({
            owner,
            cursor,
            limit: 50,
            type: structType,
            include: { json: true },
        });
        for (const obj of page.objects) {
            const fields = obj.json as Record<string, unknown> | null;
            if (!fields || !obj.objectId) continue;
            out.push({
                subscriptionId: obj.objectId,
                characterId: typeof fields.character_id === 'string' ? fields.character_id : '',
                subscriber: typeof fields.subscriber === 'string' ? fields.subscriber : '',
                subscribedAtMs: String(fields.subscribed_at_ms ?? '0'),
            });
        }
        if (!page.hasNextPage || !page.cursor) break;
        cursor = page.cursor;
    }
    return out;
}
