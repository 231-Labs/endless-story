/**
 * Storyteller chapter — slice → compiler payload (pure mapping).
 *
 * The gate (`gate.ts`) decides WHEN and hands a chronological `slice` of
 * material. This maps that heterogeneous slice onto the event-chapter-compiler's
 * input — POVs stay POVs, observations / card intents / memories become
 * enrichment, the arc's most recent scene anchors the cut, and the mode picks
 * the voice floor (an 'overview' weaves from a single POV + context).
 *
 * Pure (only `import type`); the I/O — calling the compiler, MemWal recall,
 * anchoring — stays in the web tick path / the harness, which both feed the
 * SAME payload into the SAME compiler, so the tested flow is the shipped flow.
 */

import type { MaterialItem, ArcWatermark } from './material.ts';
import type { ChapterMode, ReadinessDecision } from './gate.ts';
import type { ContinuityContext } from './story-bible.ts';

/** The subset of the compiler input this layer fills. Spread into the existing
 *  `CompileEventChapterInput` (runner) / `compileEventChapterAction` (web). */
export interface ChapterCompilerPayload {
    sceneId: string;
    sceneName?: string;
    eventTx?: string;
    eventLabel?: string;
    day?: number;
    /** Never 'wait' — a wait decision yields no payload. */
    mode: Exclude<ChapterMode, 'wait'>;
    /** Voice floor: 'overview' allows a single anchored POV (anti-stuck). */
    minVoices: number;
    povs: Array<{ characterId: string; characterName: string; role?: string; body: string }>;
    observations: string[];
    intents: Array<{ name: string; line: string }>;
    recalled: Array<{ name: string; text: string }>;
    prevChapterSummary?: string;
    /** Story-bible continuity (承先啟後), selected for this chapter's cast. */
    continuity?: ContinuityContext;
}

/** Pick the atom that should anchor the cut: latest substantive, else latest. */
function anchorAtom(slice: ReadonlyArray<MaterialItem>): MaterialItem | undefined {
    if (slice.length === 0) return undefined;
    const byDayDesc = [...slice].sort((a, b) => b.day - a.day);
    return byDayDesc.find((a) => a.kind === 'pov') ?? byDayDesc[0];
}

/**
 * Map a gate decision (+ the arc's watermark, for the prev-summary guard) onto a
 * compiler payload. Returns null when the decision is 'wait' or carries nothing
 * anchorable — the caller writes no chapter (and the stream simply waits).
 */
export function toChapterCompilerPayload(
    decision: ReadinessDecision,
    watermark: ArcWatermark,
    meta: { recalled?: Array<{ name: string; text: string }>; continuity?: ContinuityContext } = {},
): ChapterCompilerPayload | null {
    if (decision.mode === 'wait') return null;
    const anchor = anchorAtom(decision.slice);
    if (!anchor) return null;

    const povs = decision.slice
        .filter((m) => m.kind === 'pov' && m.text.trim())
        .map((m) => ({
            characterId: m.characterId ?? '',
            characterName: m.characterName ?? '某人',
            role: undefined as string | undefined,
            body: m.text.trim(),
        }));

    const observations = decision.slice
        .filter((m) => m.kind === 'observation' && m.text.trim())
        .map((m) => (m.characterName ? `${m.characterName}：${m.text.trim()}` : m.text.trim()));

    const intents = decision.slice
        .filter((m) => m.kind === 'card_intent' && m.text.trim())
        .map((m) => ({ name: m.characterName ?? '某人', line: m.text.trim() }));

    return {
        sceneId: anchor.sceneId,
        sceneName: anchor.sceneName,
        eventTx: anchor.eventId,
        eventLabel: anchor.label,
        day: anchor.day,
        mode: decision.mode === 'overview' ? 'overview' : 'progressed',
        minVoices: decision.mode === 'overview' ? 1 : 2,
        povs,
        observations,
        intents,
        recalled: meta.recalled ?? [],
        prevChapterSummary: watermark.lastSummary,
        continuity: meta.continuity,
    };
}

/**
 * A compact summary of a freshly woven chapter, for the next round's watermark
 * (the "已說過，勿重述" guard). Strips a leading markdown heading, then keeps the
 * first paragraph up to `max` chars. Pure.
 */
export function briefSummary(chapter: string, max = 200): string {
    const noHeading = chapter.replace(/^#{1,6}\s.*$/m, '').trim();
    const firstPara = noHeading.split(/\n{2,}/)[0]?.trim() ?? '';
    const flat = firstPara.replace(/\s+/g, '');
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
