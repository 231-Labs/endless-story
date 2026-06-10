/**
 * Memory tag format + three-factor scoring — pure functions, client-safe.
 *
 * Extracted from lib/chain/memory.ts (which is server-only: it imports the
 * admin signer) so the Owner-side browser decrypt path (MemoriesTabClient)
 * can parse and rank decrypted memories without pulling server modules into
 * the client bundle. memory.ts re-imports from here; behavior is unchanged.
 *
 * MemWal stores flat encrypted text; it has no importance/recency/type
 * scoring of its own. We restore the Smallville weighting (proposal §5.2)
 * by tagging each stored memory with a tiny parseable header
 * `[[m|t=<type>|i=<importance>]]` and re-ranking recall results by
 * importance. The tag is STRIPPED before the text reaches a prompt, and
 * surfaced structurally for the dossier MemoriesTab UI.
 */

import type { CharacterMemory, CharacterMemoryKind } from '@endless-story/shared';

export type MemoryKind =
    | 'dream'
    | 'reflection'
    | 'chapter'
    | 'observation'
    | 'relationship'
    | 'genesis'
    | 'plan';

/** Default importance per kind (1-10). Dreams highest (owner paid, must
 *  surface first — §5.2); observations lowest. Plans high (i=8) so the
 *  character's current goal stays near the top of recall (N6). */
export const DEFAULT_IMPORTANCE: Record<MemoryKind, number> = {
    dream: 9,
    relationship: 8,
    plan: 8,
    reflection: 7,
    genesis: 7,
    chapter: 5,
    observation: 4,
};

// Tag carries kind + importance + narrative day `d=` (for recency decay).
// Three-factor recall score = importance × recency(narrative-day) ×
// relevance(semantic distance) — Smallville-style, adapted to MemWal:
// `importance` from our tag, `recency` from the day stamp + decay,
// `relevance` from MemWal's own vector distance. The one thing we can't
// match vs a local store: we only score the semantically-retrieved
// candidate set, not the full memory store (mitigated by over-fetch).
// `a=1` marks a sleep-consolidated reflection: a high-density memory the
// REFLECT/sleep step produced from scattered observations. The next sleep
// must NOT re-compress these (else it eats its own output and the dense
// reflection degrades back into noise) — N2. The flag is optional so all
// pre-N2 memories parse unchanged.
const TAG_RE = /^\[\[m\|t=([a-z]+)\|i=(\d+)(?:\|d=(\d+))?(?:\|a=([01]))?\]\]\s*([\s\S]*)$/;

export interface RecalledMemory {
    text: string;
    kind: MemoryKind | 'unknown';
    importance: number;
    /** Narrative day written (recency); undefined for legacy untagged. */
    day?: number;
    /** Sleep-consolidated (anchor=true) — excluded from re-consolidation. */
    anchored?: boolean;
}

export function tagMemory(
    text: string,
    kind: MemoryKind,
    importance: number,
    day: number,
    anchored = false,
): string {
    const i = Math.max(1, Math.min(10, Math.round(importance)));
    const a = anchored ? '|a=1' : '';
    return `[[m|t=${kind}|i=${i}|d=${Math.max(0, Math.round(day))}${a}]] ${text}`;
}

export function parseMemory(stored: string): RecalledMemory {
    const m = stored.match(TAG_RE);
    if (m) {
        return {
            kind: m[1] as MemoryKind,
            importance: Number(m[2]) || 5,
            day: m[3] != null ? Number(m[3]) : undefined,
            anchored: m[4] === '1',
            text: m[5].trim(),
        };
    }
    // Untagged (legacy / pre-tagging): treat as mid-importance observation.
    return { kind: 'unknown', importance: 5, text: stored.trim() };
}

/** Recency decay by narrative day. Half-life 2 days: 2 days old → 0.5,
 *  4 days → 0.25. A high-importance dream (i=9) thus starts on top but is
 *  overtaken by fresh memories as days pass. Legacy (no day) → neutral 1. */
const RECENCY_HALFLIFE_DAYS = 2;
export function recencyWeight(memDay: number | undefined, today: number): number {
    if (memDay == null) return 1;
    return Math.pow(0.5, Math.max(0, today - memDay) / RECENCY_HALFLIFE_DAYS);
}

/** Relevance from MemWal semantic distance (lower = closer). */
export function relevanceWeight(distance: number): number {
    if (!Number.isFinite(distance)) return 0.5;
    return Math.max(0.05, 1 - Math.min(1, distance));
}

/** Map a MemWal memory kind → the UI CharacterMemory kind. */
const KIND_MAP: Record<string, CharacterMemoryKind> = {
    dream: 'dream',
    reflection: 'reflection',
    chapter: 'event',
    observation: 'observation',
    relationship: 'relationship',
    genesis: 'claimed_backstory',
    unknown: 'observation',
};

/** Shape a recalled MemWal memory into the UI CharacterMemory model. */
export function recalledToCharacterMemory(
    m: RecalledMemory,
    characterId: string,
    i: number,
): CharacterMemory {
    const kind = KIND_MAP[m.kind] ?? 'observation';
    const summary = m.text.length > 42 ? m.text.slice(0, 42) + '…' : m.text;
    const source = m.kind === 'dream' ? 'owner' : 'self';
    return {
        id: `memwal-${characterId.slice(0, 8)}-${i}`,
        characterId,
        kind,
        // MemWal recall carries no per-memory timestamp; approximate as now so
        // the UI renders. A future indexer can attach real occurredAt.
        occurredAt: new Date().toISOString(),
        summary,
        body: m.text,
        importance: m.importance,
        provenance: {
            source,
            claimStatus: m.kind === 'genesis' ? 'canonical' : 'unverified',
        },
    };
}
