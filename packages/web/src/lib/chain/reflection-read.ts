/**
 * Chain-side fetcher for character reflections.
 *
 * Reflections live in their own Move module (not commitment.move), so
 * the event-log scan can filter cleanly without parsing content. Each
 * entry includes the Walrus blob id for direct fetch + a proxy URL
 * for browser-safe rendering.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';

export interface ReflectionEntry {
    reflectionId: string;
    sagaId: string;
    characterId: string;
    mode: 'active' | 'passive';
    /** Owner's question (active mode only; empty for passive). */
    question: string;
    importance: number;
    blobId: string;
    /** Browser-friendly URL (proxy with corrected charset). */
    blobUrl: string;
    committedAtMs: string;
}

export interface FetchReflectionsOptions {
    /** Max entries returned (newest first). Default 10. */
    limit?: number;
    mode?: 'active' | 'passive';
}

export async function fetchReflectionsForCharacter(
    characterId: string,
    opts: FetchReflectionsOptions = {},
): Promise<ReflectionEntry[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const limit = opts.limit ?? 10;
    const client = makeSuiClient({ network: resolveNetwork() });

    let summaries: Awaited<ReturnType<typeof read.reflection.listReflectionEvents>>;
    try {
        summaries = await read.reflection.listReflectionEvents(client, pkg, {
            characterId,
            mode: opts.mode,
            maxEvents: limit,
        });
    } catch (err) {
        console.warn('[reflection-read] listReflectionEvents failed:', err);
        return [];
    }
    if (summaries.length === 0) return [];

    const out: ReflectionEntry[] = [];
    for (const s of summaries) {
        try {
            const res = await read.reflection.getReflection(client, s.reflectionId);
            const json = res.json as unknown as { blob_id?: number[] | string };
            const blobId = decodeByteString(json.blob_id);
            if (!blobId) continue;
            out.push({
                reflectionId: s.reflectionId,
                sagaId: s.sagaId,
                characterId: s.characterId,
                mode: s.mode,
                question: s.question,
                importance: s.importance,
                blobId,
                blobUrl: `/api/blob/${blobId}`,
                committedAtMs: s.committedAtMs,
            });
        } catch {
            // skip
        }
    }
    return out;
}

function decodeByteString(raw: number[] | string | undefined): string {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return new TextDecoder().decode(new Uint8Array(raw));
    return '';
}
