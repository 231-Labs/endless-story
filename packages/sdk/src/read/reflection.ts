/**
 * Reflection view queries — get object + event-log listing.
 */
import * as gen from '../generated/endless_story/reflection.js';
import type { SuiClient } from '../client.js';

export { gen as raw };

export const getReflection = (client: SuiClient, reflectionId: string) =>
    gen.Reflection.get({ client, objectId: reflectionId });

/** One row of the `ReflectionCommitted` event log. */
export interface ReflectionSummary {
    reflectionId: string;
    sagaId: string;
    characterId: string;
    mode: 'active' | 'passive';
    question: string;
    importance: number;
    committedAtMs: string;
}

export interface ListReflectionsOptions {
    characterId?: string;
    sagaId?: string;
    mode?: 'active' | 'passive';
    maxEvents?: number;
}

/**
 * Scan `ReflectionCommitted` events. Returns newest-first. Filter by
 * character + mode is event-side (cheaper than per-object fetch).
 */
export async function listReflectionEvents(
    client: SuiClient,
    packageId: string,
    opts: ListReflectionsOptions = {},
): Promise<ReflectionSummary[]> {
    const eventType = `${packageId}::reflection::ReflectionCommitted`;
    const out: ReflectionSummary[] = [];
    const cap = opts.maxEvents ?? Infinity;
    let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
    for (;;) {
        const page = await client.queryEvents({
            query: { MoveEventType: eventType },
            cursor,
            limit: 50,
            order: 'descending',
        });
        for (const ev of page.data) {
            const parsed = ev.parsedJson as Partial<{
                reflection_id: string;
                saga_id: string;
                character_id: string;
                mode: string;
                question: string;
                importance: number;
                committed_at_ms: string | number;
            }>;
            if (!parsed.reflection_id) continue;
            const charId = parsed.character_id ?? '';
            const sagaId = parsed.saga_id ?? '';
            const mode = (parsed.mode === 'active' || parsed.mode === 'passive')
                ? parsed.mode
                : 'passive';
            if (opts.characterId && charId !== opts.characterId) continue;
            if (opts.sagaId && sagaId !== opts.sagaId) continue;
            if (opts.mode && mode !== opts.mode) continue;
            out.push({
                reflectionId: parsed.reflection_id,
                sagaId,
                characterId: charId,
                mode,
                question: parsed.question ?? '',
                importance: Number(parsed.importance ?? 0),
                committedAtMs: String(parsed.committed_at_ms ?? '0'),
            });
            if (out.length >= cap) return out;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}
