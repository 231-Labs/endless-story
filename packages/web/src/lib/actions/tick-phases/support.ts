// Shared, chain-free helpers for the tick loop (see ../tick-loop.ts).
// Per-tick memory caching + bounded concurrency + roster shaping.
// Plain module (not 'use server').
import type { Character } from '@endless-story/shared';
import {
    recallCurrentPlanText,
    recallForCharacter,
} from '@/lib/chain/memory';
import { fetchRelationshipHints } from '@/lib/chain/relationships';
import { rosterLines, type SagaRosterEntry } from '@/lib/chain/roster';

/**
 * Max characters whose memory-recall work runs at once. Default to 1 for demo:
 * SEAL key servers rate-limit quickly when one tick fans out PLAN/SOCIAL/POV
 * across the cast. Raise MEMWAL_RECALL_CONCURRENCY only after a self-hosted
 * relayer + stable SEAL config are in place.
 */
export const RECALL_CONCURRENCY = Math.max(
    1,
    Number(process.env.MEMWAL_RECALL_CONCURRENCY) || 1,
);

export function normalizeCharacterIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of ids) {
        if (typeof raw !== 'string') continue;
        const id = raw.trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

/** Per-tick recall cache: PLAN / MOVE / SOCIAL / ACT / POV share one recall
 *  per (character, purpose) instead of re-SEAL-decrypting in every phase. */
export class TickMemoryContext {
    private plans = new Map<string, Promise<string | null>>();
    private relationships = new Map<string, Promise<string[]>>();
    private recentMemories = new Map<string, Promise<string[]>>();

    plan(characterId: string): Promise<string | null> {
        let p = this.plans.get(characterId);
        if (!p) {
            p = recallCurrentPlanText(characterId).catch(() => null);
            this.plans.set(characterId, p);
        }
        return p;
    }

    setPlan(characterId: string, text: string | null): void {
        this.plans.set(characterId, Promise.resolve(text));
    }

    relationshipHints(characterId: string, limit = 5): Promise<string[]> {
        const key = `${characterId}:rel:${limit}`;
        let p = this.relationships.get(key);
        if (!p) {
            p = fetchRelationshipHints(characterId, limit).catch(() => [] as string[]);
            this.relationships.set(key, p);
        }
        return p;
    }

    recent(characterId: string, query: string, limit = 4, purpose = 'recent'): Promise<string[]> {
        const key = `${characterId}:${purpose}:${limit}:${query}`;
        let p = this.recentMemories.get(key);
        if (!p) {
            p = recallForCharacter(characterId, query, limit).catch(() => [] as string[]);
            this.recentMemories.set(key, p);
        }
        return p;
    }
}

export function buildRosterContextById(
    slice: Character[],
    roster: SagaRosterEntry[],
): Map<string, string[]> {
    return new Map(
        slice.map((c) => [c.id, rosterLines(roster.filter((r) => r.id !== c.id), 12)]),
    );
}

export function publicTagsWithRole(character: Character, role: string | undefined): string[] {
    const tags = new Set(character.publicTags?.map((t) => t.label).filter(Boolean) ?? []);
    if (role && role !== '—') tags.add(`role:${role}`);
    return [...tags];
}

/* ── concurrency pool ──────────────────────────────────────────────────
 * Run `fn` over `items` with at most `concurrency` in flight, preserving
 * input order. Used to throttle recall-heavy phases (PLAN / POV generate)
 * so the shared SEAL key server + Walrus aggregator don't 429 under an
 * all-at-once burst. `fn` must not throw — wrap per-item work in try/catch
 * (a throw rejects the pool). */
export async function mapPool<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        for (;;) {
            const i = next;
            next += 1;
            if (i >= items.length) return;
            results[i] = await fn(items[i], i);
        }
    };
    const lanes = Array.from({ length: Math.min(Math.max(1, concurrency), items.length || 1) }, () =>
        worker(),
    );
    await Promise.all(lanes);
    return results;
}
