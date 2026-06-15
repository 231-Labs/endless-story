/**
 * Dream view queries — config + per-character dream listing.
 */
import * as gen from '../generated/endless_story/dream.js';
import type { SuiClient } from '../client.js';
import { queryEventsWithRetry } from './query-retry.js';

export { gen as raw };

export const getDreamConfig = (client: SuiClient, configId: string) =>
    gen.DreamConfig.get({ client, objectId: configId });

export const getDream = (client: SuiClient, dreamId: string) =>
    gen.Dream.get({ client, objectId: dreamId });

/** One row of the `DreamInjected` event log. */
export interface DreamInjectedSummary {
    dreamId: string;
    characterId: string;
    sagaId: string;
    submitter: string;
    paidAmount: string;
    importance: number;
    injectedAtMs: string;
}

export interface ListDreamsOptions {
    characterId?: string;
    sagaId?: string;
    maxEvents?: number;
}

/**
 * Scan `DreamInjected` events. Used by runner POV worker to pull
 * recent dreams for a character + by web to render the dream history
 * on owner's dossier view.
 */
export async function listDreamInjectedEvents(
    client: SuiClient,
    packageId: string,
    opts: ListDreamsOptions = {},
): Promise<DreamInjectedSummary[]> {
    const eventType = `${packageId}::dream::DreamInjected`;
    const out: DreamInjectedSummary[] = [];
    const cap = opts.maxEvents ?? Infinity;
    let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
    for (;;) {
        const page = await queryEventsWithRetry(client, {
            query: { MoveEventType: eventType },
            cursor,
            limit: 50,
            order: 'descending',
        });
        for (const ev of page.data) {
            const parsed = ev.parsedJson as Partial<{
                dream_id: string;
                character_id: string;
                saga_id: string;
                submitter: string;
                paid_amount: string | number;
                importance: number;
                injected_at_ms: string | number;
            }>;
            if (!parsed.dream_id) continue;
            const charId = parsed.character_id ?? '';
            const sagaId = parsed.saga_id ?? '';
            if (opts.characterId && charId !== opts.characterId) continue;
            if (opts.sagaId && sagaId !== opts.sagaId) continue;
            out.push({
                dreamId: parsed.dream_id,
                characterId: charId,
                sagaId,
                submitter: parsed.submitter ?? '',
                paidAmount: String(parsed.paid_amount ?? '0'),
                importance: Number(parsed.importance ?? 0),
                injectedAtMs: String(parsed.injected_at_ms ?? '0'),
            });
            if (out.length >= cap) return out;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}
