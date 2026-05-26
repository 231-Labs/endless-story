/**
 * Subscribe view queries — Subscription objects + event log scans.
 */
import * as gen from '../generated/endless_story/subscribe.js';
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
    let cursor: string | null | undefined = null;
    for (;;) {
        const page = await client.getOwnedObjects({
            owner,
            cursor,
            limit: 50,
            filter: { StructType: structType },
            options: { showType: true, showContent: true },
        });
        for (const obj of page.data) {
            const data = obj.data;
            const content = data?.content;
            if (!content || content.dataType !== 'moveObject') continue;
            const fields = content.fields as Record<string, unknown>;
            if (!data.objectId) continue;
            out.push({
                subscriptionId: data.objectId,
                characterId: typeof fields.character_id === 'string' ? fields.character_id : '',
                subscriber: typeof fields.subscriber === 'string' ? fields.subscriber : '',
                subscribedAtMs: String(fields.subscribed_at_ms ?? '0'),
            });
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}
