/**
 * Storyteller chapter — the MATERIAL layer (pure, self-contained).
 *
 * The old cut compiler wove ONE event's POVs the moment it resolved. Two
 * problems that surfaced on the live saga (see the storyteller-chapter design):
 *   1. it could only write when an event RESOLVED → a wedged/never-resolving
 *      event meant the chapter stream went silent;
 *   2. material was just "this tick's POVs" → chapters re-narrated the same
 *      standoff day after day.
 *
 * This layer reframes "material" to **everything that happened that the cast
 * knows** — POVs, daily observations, the inner line behind a card play, an
 * event opening or resolving, a recalled memory — and groups it into a *story
 * arc* (a dramatic axis that may span many events and days). The gate
 * (`gate.ts`) then decides, from the arc's accumulated material, whether there
 * is enough NEW progress to be worth a chapter — never waiting on a resolve.
 *
 * Pure + self-contained (only `import type`), so it runs under node --test
 * native strip-types and is identical in production and in the harness.
 */

/** What kind of thing a piece of material is. */
export type MaterialKind =
    /** A character's first-person chapter of an event (anchored es:prov). */
    | 'pov'
    /** A daily situational observation: who was present, the stakes, last tick's news. */
    | 'observation'
    /** The reason / inner line a character gave when playing a card (action.intent). */
    | 'card_intent'
    /** An event/contention opened — a fresh incident on the axis. */
    | 'event_open'
    /** An event resolved. An OPTIONAL progress signal — its ABSENCE never blocks a chapter. */
    | 'event_resolve'
    /** A recalled past memory (injected by the compose layer via MemWal). */
    | 'memory';

/** One atom of story material. Everything the storyteller can draw on. */
export interface MaterialItem {
    /**
     * Stable de-dup id. For anchored material use the commitmentId; otherwise
     * a deterministic `${eventId}:${characterId}:${kind}:${day}`. The watermark
     * keys off this so the same atom is never consumed into two chapters.
     */
    id: string;
    kind: MaterialKind;
    /** 1-indexed narrative day this material is from. */
    day: number;
    sceneId: string;
    sceneName?: string;
    /** Who the material is from / about (POV author, card player, observer). */
    characterId?: string;
    characterName?: string;
    /** The on-chain event this belongs to, when any (the `eventTx`). */
    eventId?: string;
    /** Dramatic axis, e.g. 'spotlight' from `contention:spotlight`. Groups the arc. */
    contentionKind?: string;
    /** Human-readable incident framing, for context lines. */
    label?: string;
    /** The raw material text — prose, observation, or intent line. */
    text: string;
}

/**
 * The thread a chapter is about. Default = the dramatic axis, so repeated
 * material on the same axis (e.g. every "誰壓軸" beat across many events and
 * days) is ONE arc and a new chapter only fires when that axis actually moves.
 * Falls back to the scene when an atom carries no axis.
 */
export function arcKeyOf(item: MaterialItem): string {
    return item.contentionKind ? `axis:${item.contentionKind}` : `scene:${item.sceneId}`;
}

/** Group a flat material list into arcs (stable insertion order preserved). */
export function groupIntoArcs(
    items: ReadonlyArray<MaterialItem>,
    keyOf: (i: MaterialItem) => string = arcKeyOf,
): Map<string, MaterialItem[]> {
    const arcs = new Map<string, MaterialItem[]>();
    for (const item of items) {
        const key = keyOf(item);
        const arr = arcs.get(key);
        if (arr) arr.push(item);
        else arcs.set(key, [item]);
    }
    return arcs;
}

/**
 * Per-arc memory of what's already been told. The ONLY state the gate needs;
 * everything else is derived from the (chain-recoverable) material list, so a
 * process restart can't lose accumulation — it just re-derives.
 */
export interface ArcWatermark {
    /** Material ids already woven into a prior chapter — never counted as "new". */
    toldIds: string[];
    /** Day the arc last produced a chapter. Undefined = never told. */
    lastToldDay?: number;
    /** The last chapter's summary — fed to compose as the "已說過，勿重述" guard. */
    lastSummary?: string;
}

/** An empty watermark for an arc that has never produced a chapter. */
export function emptyWatermark(): ArcWatermark {
    return { toldIds: [] };
}

/** The material atoms that actually carry voice (POV / observation / intent). */
const SUBSTANTIVE: ReadonlySet<MaterialKind> = new Set<MaterialKind>([
    'pov',
    'observation',
    'card_intent',
]);

export function isSubstantive(item: MaterialItem): boolean {
    return SUBSTANTIVE.has(item.kind) && item.text.trim().length > 0;
}

/** Distinct character voices among a set of atoms (ids with substantive text). */
export function distinctVoices(items: ReadonlyArray<MaterialItem>): number {
    const ids = new Set<string>();
    for (const i of items) if (isSubstantive(i) && i.characterId) ids.add(i.characterId);
    return ids.size;
}

/**
 * Roll the watermark forward after a chapter is written from `slice`. Pure —
 * returns a fresh watermark; the caller persists it (chain or store).
 */
export function advanceWatermark(
    prev: ArcWatermark,
    slice: ReadonlyArray<MaterialItem>,
    day: number,
    summary: string,
): ArcWatermark {
    const toldIds = [...prev.toldIds];
    const seen = new Set(toldIds);
    for (const s of slice) if (!seen.has(s.id)) toldIds.push(s.id);
    return { toldIds, lastToldDay: day, lastSummary: summary.trim() || prev.lastSummary };
}
