/**
 * Storyteller chapter — the READINESS GATE (pure, self-contained).
 *
 * Given an arc's accumulated material + what's already been told, decide whether
 * to write a chapter now, and which atoms to weave. Two guarantees that answer
 * the live-saga failures (the storyteller-chapter design):
 *
 *   • RESOLVE-INDEPENDENT — an `event_resolve` atom is only ONE optional progress
 *     signal; its absence never blocks a chapter. A never-resolving event can't
 *     silence the stream.
 *   • ANTI-STARVATION — once material has piled up (or the arc has been silent
 *     too long), the gate writes an `overview` (綜觀版) from whatever the cast
 *     knows, even with no clean turn. So it NEVER writes nothing forever.
 *
 * Anti-repetition falls out of the same logic: a day that only re-states the
 * same atoms (no new ids, no new voices, no movement) returns `wait`; the
 * previous chapter's summary is handed to compose as the "勿重述" guard.
 *
 * Pure (only `import type`) → identical under node --test, in the harness, and
 * in production.
 */

import type { MaterialItem, ArcWatermark, MaterialKind } from './material.ts';

// Inlined (not imported) so this module cross-references material.ts by TYPE
// only — keeps it self-contained for node --test native strip-types, mirroring
// material.ts's own `isSubstantive`. Keep the two in sync.
const SUBSTANTIVE_KINDS: ReadonlySet<MaterialKind> = new Set<MaterialKind>([
    'pov',
    'observation',
    'card_intent',
]);
function isSubstantive(item: MaterialItem): boolean {
    return SUBSTANTIVE_KINDS.has(item.kind) && item.text.trim().length > 0;
}

export type ChapterMode = 'progressed' | 'overview' | 'wait';

export interface ReadinessThresholds {
    /** Distinct NEW voices required for a 'progressed' chapter. */
    minNewVoices: number;
    /** Distinct progress beats required for a 'progressed' chapter. */
    minProgressBeats: number;
    /**
     * Days of silence after which we write an 'overview' from whatever piled up.
     * The anti-starvation floor: this is what guarantees a stuck / never-resolving
     * event still eventually yields a chapter.
     */
    maxSilentDays: number;
    /** New-material count that forces an 'overview' even before maxSilentDays. */
    overviewMaterialCount: number;
    /** Min voices for an overview (1 = a single-angle recap is allowed when starved). */
    minOverviewVoices: number;
}

export const DEFAULT_THRESHOLDS: ReadinessThresholds = {
    minNewVoices: 2,
    minProgressBeats: 2,
    maxSilentDays: 3,
    overviewMaterialCount: 6,
    minOverviewVoices: 1,
};

export interface ReadinessDecision {
    mode: ChapterMode;
    /** Why — human-readable, surfaced in the tick log. */
    reason: string;
    /** Atoms to weave when mode != 'wait' (chronological). Empty for 'wait'. */
    slice: MaterialItem[];
    /** Diagnostics (also handy for the harness timeline). */
    newVoices: number;
    progressBeats: number;
    silentDays: number;
}

/** Smallest day across a set of atoms (for never-told arcs' silence math). */
function minDay(items: ReadonlyArray<MaterialItem>): number {
    let m = Infinity;
    for (const i of items) if (i.day < m) m = i.day;
    return m === Infinity ? 0 : m;
}

/**
 * Count the ways the arc actually MOVED in its new atoms (vs mere re-narration):
 *   - a character new to the arc (a fresh angle),
 *   - an event that resolved (a contest settled),
 *   - a fresh incident opening on the axis,
 *   - the action moving to a scene the arc hadn't touched.
 * Re-stating the same standoff with the same cast scores 0 → the gate waits.
 */
function countProgressBeats(
    newItems: ReadonlyArray<MaterialItem>,
    toldItems: ReadonlyArray<MaterialItem>,
): number {
    const seenChars = new Set<string>();
    const seenScenes = new Set<string>();
    for (const t of toldItems) {
        if (t.characterId) seenChars.add(t.characterId);
        seenScenes.add(t.sceneId);
    }

    const freshChars = new Set<string>();
    const freshScenes = new Set<string>();
    let resolves = 0;
    let opens = 0;
    for (const n of newItems) {
        if (isSubstantive(n) && n.characterId && !seenChars.has(n.characterId)) {
            freshChars.add(n.characterId);
        }
        if (!seenScenes.has(n.sceneId)) freshScenes.add(n.sceneId);
        if (n.kind === 'event_resolve') resolves += 1;
        if (n.kind === 'event_open') opens += 1;
    }
    return freshChars.size + resolves + (opens > 0 ? 1 : 0) + (freshScenes.size > 0 ? 1 : 0);
}

/**
 * Decide whether `arcItems` (ALL atoms in one arc, told + untold) warrants a
 * chapter now. `currentDay` is the saga day driving the silence floor.
 */
export function decideChapterReadiness(
    arcItems: ReadonlyArray<MaterialItem>,
    watermark: ArcWatermark,
    currentDay: number,
    thresholds: ReadinessThresholds = DEFAULT_THRESHOLDS,
): ReadinessDecision {
    const told = new Set(watermark.toldIds);
    const toldItems = arcItems.filter((i) => told.has(i.id));
    const newItems = arcItems.filter((i) => !told.has(i.id));
    const substantiveNew = newItems.filter(isSubstantive);

    const newVoiceIds = new Set<string>();
    for (const i of substantiveNew) if (i.characterId) newVoiceIds.add(i.characterId);
    const newVoices = newVoiceIds.size;
    const progressBeats = countProgressBeats(newItems, toldItems);

    // Silence is measured from the last chapter, or from when the arc's oldest
    // untold atom appeared (so a brand-new arc that just keeps piling up still
    // trips the floor and gets an overview).
    const silenceBase = watermark.lastToldDay ?? minDay(substantiveNew.length ? substantiveNew : newItems);
    const silentDays = Math.max(0, currentDay - silenceBase);

    // Chronological slice of the new, voiced material to weave.
    const slice = [...substantiveNew].sort((a, b) => a.day - b.day || a.kind.localeCompare(b.kind));

    const diag = { newVoices, progressBeats, silentDays };

    if (newItems.length === 0) {
        return { mode: 'wait', reason: '無新素材', slice: [], ...diag };
    }

    // 0) A settled contest is the payoff — write it as soon as it lands, even on a
    //    thin cast. Resolve PRESENCE is a positive trigger; its ABSENCE (handled
    //    by the starvation rules below) never blocks. That asymmetry is the whole
    //    anti-stuck contract: resolve helps, never gates.
    const hasResolve = newItems.some((i) => i.kind === 'event_resolve');
    if (hasResolve && newVoices >= thresholds.minOverviewVoices) {
        return { mode: 'progressed', reason: `收尾落定（新聲口 ${newVoices}）`, slice, ...diag };
    }

    // 1) Real multi-angle progress → the good case: a proper next chapter.
    if (newVoices >= thresholds.minNewVoices && progressBeats >= thresholds.minProgressBeats) {
        return {
            mode: 'progressed',
            reason: `有進展（新聲口 ${newVoices}、進展拍 ${progressBeats}）`,
            slice,
            ...diag,
        };
    }

    // 2) Anti-starvation by silence → write an overview no matter what (decoupled
    //    from resolve: this is the "never stay silent" guarantee).
    if (silentDays >= thresholds.maxSilentDays && newVoices >= thresholds.minOverviewVoices) {
        return {
            mode: 'overview',
            reason: `沉默 ${silentDays} 日，出綜觀版（不等收尾）`,
            slice,
            ...diag,
        };
    }

    // 3) Anti-starvation by volume → enough piled up to be worth a綜觀版 early.
    if (newItems.length >= thresholds.overviewMaterialCount && newVoices >= 2) {
        return {
            mode: 'overview',
            reason: `素材累積 ${newItems.length} 則，出綜觀版`,
            slice,
            ...diag,
        };
    }

    // 4) Otherwise keep accumulating — and DON'T re-tell the same standoff.
    return {
        mode: 'wait',
        reason: `素材不足或無進展（新聲口 ${newVoices}、進展拍 ${progressBeats}、沉默 ${silentDays} 日）`,
        slice: [],
        ...diag,
    };
}
