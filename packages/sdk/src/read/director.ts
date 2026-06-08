/**
 * Director event-log view queries.
 *
 * The director's "memory" is the on-chain event log (NARRATIVE_AGENTS.md
 * §5: director memory = objective/omniscient = on-chain event log). These
 * readers scan those soft events so the web + character agents can perceive
 * what the director did.
 */
import type { SuiClient } from '../client.js';

/** One `RelationshipSeeded` event — a director-declared tie between two
 *  characters in a scene. */
export interface RelationshipSummary {
    sagaId: string;
    sceneId: string;
    characterA: string;
    characterB: string;
    /** "romance" | "tension" | "rivalry" | "wary" | "estrangement" | "mentorship" | ... */
    tone: string;
    seededAtMs: string;
}

export interface ListRelationshipsOptions {
    /** Keep only ties touching this character (either side). */
    characterId?: string;
    sagaId?: string;
    maxEvents?: number;
}

/**
 * Scan `RelationshipSeeded` events, newest-first. Filtering by character
 * matches EITHER side (a tie is symmetric for perception). The caller
 * decides which side is "the other".
 */
export async function listRelationshipEvents(
    client: SuiClient,
    packageId: string,
    opts: ListRelationshipsOptions = {},
): Promise<RelationshipSummary[]> {
    const eventType = `${packageId}::director::RelationshipSeeded`;
    const out: RelationshipSummary[] = [];
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
                saga_id: string;
                scene_id: string;
                character_a: string;
                character_b: string;
                tone: string;
                seeded_at_ms: string | number;
            }>;
            if (!parsed.character_a || !parsed.character_b) continue;
            const sagaId = parsed.saga_id ?? '';
            if (opts.sagaId && sagaId !== opts.sagaId) continue;
            if (
                opts.characterId &&
                parsed.character_a !== opts.characterId &&
                parsed.character_b !== opts.characterId
            ) {
                continue;
            }
            out.push({
                sagaId,
                sceneId: parsed.scene_id ?? '',
                characterA: parsed.character_a,
                characterB: parsed.character_b,
                tone: parsed.tone ?? 'neutral',
                seededAtMs: String(parsed.seeded_at_ms ?? '0'),
            });
            if (out.length >= cap) return out;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}
