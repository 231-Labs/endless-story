/**
 * Storyteller chapter — the STORY BIBLE (pure, self-contained).
 *
 * The gate decides WHEN to write and from WHAT material; the bible is what makes
 * each chapter read like the next movement of ONE novel instead of an isolated
 * event recap. It's the storyteller's persistent narrative state:
 *   - a running synopsis ("the story so far"),
 *   - open threads (主/支線) with where each stands,
 *   - each character's current arc,
 *   - the hooks the last chapter left dangling for the next.
 *
 * A chapter is written by READING the relevant slice of the bible (承先 — pick up
 * a hook, callback a detail, advance a thread) and, once written, FOLDING the
 * outcome back in (啟後 — mark the thread advanced/resolved, append the synopsis,
 * leave fresh hooks). That read→write loop is the continuity.
 *
 * Pure (only `import type` across files) so it runs identically under node --test,
 * in the harness, and in production. Persistence (where the bible is stored, and
 * the LLM step that derives the fold) is the I/O layer's job.
 */

export type ThreadStatus = 'open' | 'advanced' | 'resolved';

/** One narrative line the novel is tracking (a contention, a bond, a secret…). */
export interface StoryThread {
    /** Stable slug. Use `threadSlug(title)` when a writer doesn't supply one. */
    id: string;
    title: string;
    status: ThreadStatus;
    /** Narrative day this thread last moved. */
    lastDay: number;
    /** Where the thread stands now — 1–2 sentences, the "承先" the next chapter builds on. */
    state: string;
    /** Characters entangled in it (for relevance ranking against a chapter's cast). */
    castIds: string[];
}

/** Where a character is in their arc right now. */
export interface CharacterArc {
    characterId: string;
    name: string;
    state: string;
    lastDay: number;
}

/** The storyteller's persistent narrative state for one saga. */
export interface StoryBible {
    sagaId: string;
    /** Narrative day the bible has been carried up to. */
    throughDay: number;
    chapterCount: number;
    /** Running "story so far" — bounded; the spine of continuity. */
    synopsis: string;
    threads: StoryThread[];
    arcs: CharacterArc[];
    /** Dangling hooks the last chapter left for the next (啟後). */
    hooks: string[];
    /** The immediately previous chapter's brief. */
    lastChapterSummary?: string;
}

export function emptyBible(sagaId: string): StoryBible {
    return { sagaId, throughDay: 0, chapterCount: 0, synopsis: '', threads: [], arcs: [], hooks: [] };
}

/** Deterministic slug from a thread title (stable id when a writer omits one). */
export function threadSlug(title: string): string {
    const ascii = title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (ascii) return ascii;
    // CJK / non-ascii title → stable hash slug (no Math.random; SSR/test-safe).
    let h = 2166136261;
    for (let i = 0; i < title.length; i += 1) {
        h ^= title.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `t-${(h >>> 0).toString(36)}`;
}

/** The continuity context handed to the compiler for ONE chapter (承先). All
 *  optional so the compiler renders nothing when the bible is empty. */
export interface ContinuityContext {
    /** Story so far. */
    synopsis?: string;
    /** Unresolved threads relevant to this cast, as "title：state" lines. */
    openThreads?: string[];
    /** Hooks the previous chapter left dangling — the next chapter should pay ≥1 off. */
    hooks?: string[];
    /** This cast's current arcs, as { name, state }. */
    castArcs?: Array<{ name: string; state: string }>;
}

export interface SelectOptions {
    maxThreads?: number;
    maxArcs?: number;
    maxHooks?: number;
}

/**
 * Pick the slice of the bible relevant to a chapter's cast — the "承先" the writer
 * builds on. Unresolved threads first (cast-overlap, then recency); the cast's
 * own arcs; the open hooks. Pure.
 */
export function selectContinuityContext(
    bible: StoryBible,
    castIds: ReadonlyArray<string>,
    opts: SelectOptions = {},
): ContinuityContext {
    const cast = new Set(castIds);
    const maxThreads = opts.maxThreads ?? 4;
    const maxArcs = opts.maxArcs ?? 6;
    const maxHooks = opts.maxHooks ?? 3;

    const relevance = (t: StoryThread): number => {
        const overlap = t.castIds.reduce((n, id) => (cast.has(id) ? n + 1 : n), 0);
        return overlap * 1000 + t.lastDay; // cast-overlap dominates, recency breaks ties
    };
    const openThreads = bible.threads
        .filter((t) => t.status !== 'resolved')
        .sort((a, b) => relevance(b) - relevance(a))
        .slice(0, maxThreads)
        .map((t) => `${t.title}：${t.state}`);

    const castArcs = bible.arcs
        .filter((a) => cast.has(a.characterId))
        .sort((a, b) => b.lastDay - a.lastDay)
        .slice(0, maxArcs)
        .map((a) => ({ name: a.name, state: a.state }));

    const hooks = bible.hooks.slice(-maxHooks);

    return {
        synopsis: bible.synopsis.trim() || undefined,
        openThreads: openThreads.length ? openThreads : undefined,
        hooks: hooks.length ? hooks : undefined,
        castArcs: castArcs.length ? castArcs : undefined,
    };
}

/** The fold applied AFTER a chapter is written (啟後). The I/O layer derives this
 *  from the woven prose (an LLM "update the bible" step or structured output);
 *  the pure function just merges it deterministically. */
export interface ChapterContinuityUpdate {
    day: number;
    /** This chapter's brief (becomes lastChapterSummary). */
    summary: string;
    /** A sentence appended to the running synopsis. */
    synopsisAppend?: string;
    /** Threads this chapter moved (upsert by id; marks them 'advanced'). */
    advancedThreads?: Array<{ id?: string; title: string; state: string; castIds?: string[] }>;
    /** Brand-new threads this chapter opened. */
    newThreads?: Array<{ id?: string; title: string; state: string; castIds?: string[] }>;
    /** Thread ids this chapter resolved. */
    resolvedThreadIds?: string[];
    /** Character arc updates (upsert by characterId). */
    arcUpdates?: Array<{ characterId: string; name?: string; state: string }>;
    /** The hooks now dangling for the NEXT chapter (replaces the prior open hooks). */
    hooks?: string[];
}

const SYNOPSIS_MAX = 1200;

/** Fold a written chapter's outcome into the bible → the next chapter's 承先. Pure. */
export function applyChapter(bible: StoryBible, u: ChapterContinuityUpdate): StoryBible {
    const threads = bible.threads.map((t) => ({ ...t, castIds: [...t.castIds] }));
    const byId = new Map(threads.map((t) => [t.id, t] as const));

    const upsert = (
        entry: { id?: string; title: string; state: string; castIds?: string[] },
        status: ThreadStatus,
    ) => {
        const id = entry.id ?? threadSlug(entry.title);
        const existing = byId.get(id);
        if (existing) {
            existing.title = entry.title || existing.title;
            existing.state = entry.state;
            existing.status = status;
            existing.lastDay = u.day;
            if (entry.castIds) existing.castIds = [...new Set([...existing.castIds, ...entry.castIds])];
        } else {
            const t: StoryThread = {
                id,
                title: entry.title,
                state: entry.state,
                status,
                lastDay: u.day,
                castIds: entry.castIds ?? [],
            };
            threads.push(t);
            byId.set(id, t);
        }
    };
    for (const t of u.advancedThreads ?? []) upsert(t, 'advanced');
    for (const t of u.newThreads ?? []) upsert(t, 'open');
    for (const id of u.resolvedThreadIds ?? []) {
        const t = byId.get(id);
        if (t) {
            t.status = 'resolved';
            t.lastDay = u.day;
        }
    }

    const arcs = bible.arcs.map((a) => ({ ...a }));
    const arcById = new Map(arcs.map((a) => [a.characterId, a] as const));
    for (const a of u.arcUpdates ?? []) {
        const existing = arcById.get(a.characterId);
        if (existing) {
            existing.state = a.state;
            existing.lastDay = u.day;
            if (a.name) existing.name = a.name;
        } else {
            const arc: CharacterArc = {
                characterId: a.characterId,
                name: a.name ?? '某人',
                state: a.state,
                lastDay: u.day,
            };
            arcs.push(arc);
            arcById.set(a.characterId, arc);
        }
    }

    const appended = u.synopsisAppend?.trim()
        ? `${bible.synopsis} ${u.synopsisAppend.trim()}`.trim()
        : bible.synopsis;
    const synopsis =
        appended.length > SYNOPSIS_MAX ? `…${appended.slice(appended.length - SYNOPSIS_MAX)}` : appended;

    return {
        sagaId: bible.sagaId,
        throughDay: Math.max(bible.throughDay, u.day),
        chapterCount: bible.chapterCount + 1,
        synopsis,
        threads,
        arcs,
        hooks: u.hooks ?? bible.hooks,
        lastChapterSummary: u.summary.trim() || bible.lastChapterSummary,
    };
}
