/**
 * Still-compiler pure core — beat selection (the heat gate) + prompt building +
 * the `compileStills` orchestration.
 *
 * No I/O, no chain, no image model: render + anchor are passed in as functions,
 * so this whole module is self-contained (only `import type`) and fully
 * unit-testable under `node --test` (which can't resolve runtime `.js`→`.ts`).
 * The I/O wiring (real OpenAI render + on-chain anchor) lives in ./index.ts.
 */

import type { EventStill, SceneHeatProfile } from '@endless-story/shared';

export interface SelectBeatsOptions {
    /** cinnabar a beat must reach to qualify. Default 0 (every beat qualifies). */
    tensionThreshold?: number;
    /** Hard cap on stills per event (cost ceiling). Default 3. */
    maxPerEvent?: number;
    /** Always capture the resolution (last) beat, even if below threshold. Default true. */
    alwaysClimax?: boolean;
}

/**
 * Pick the beat indices to capture. A beat qualifies when its `cinnabar` (inner
 * conflict / desire) reaches `tensionThreshold`. If `alwaysClimax`, the final
 * beat is guaranteed in. When more beats qualify than `maxPerEvent`, the
 * highest-cinnabar ones win — but the climax beat is pinned so it always
 * survives the cap. Returned indices are chronological (ascending).
 */
export function selectStillBeats(
    beatHeat: readonly SceneHeatProfile[] | undefined,
    opts: SelectBeatsOptions = {},
): number[] {
    const beats = beatHeat ?? [];
    if (beats.length === 0) return [];

    const threshold = opts.tensionThreshold ?? 0;
    const alwaysClimax = opts.alwaysClimax ?? true;
    const climaxIdx = beats.length - 1;

    // A climax-only event still produces 1 still; otherwise honour maxPerEvent.
    const cap = Math.max(opts.maxPerEvent ?? 3, alwaysClimax ? 1 : 0);
    if (cap === 0) return [];

    const selected = new Set<number>();
    beats.forEach((h, i) => {
        if (h.cinnabar >= threshold) selected.add(i);
    });
    if (alwaysClimax) selected.add(climaxIdx);

    if (selected.size <= cap) {
        return [...selected].sort((a, b) => a - b);
    }

    // Over the cap: keep the highest-cinnabar beats, but pin the climax beat
    // (it must survive even if its cinnabar is low).
    const pinned = alwaysClimax ? climaxIdx : -1;
    const ranked = [...selected]
        .filter((i) => i !== pinned)
        .sort((a, b) => beats[b].cinnabar - beats[a].cinnabar || a - b);

    const keep = new Set<number>();
    if (pinned >= 0) keep.add(pinned);
    for (const i of ranked) {
        if (keep.size >= cap) break;
        keep.add(i);
    }
    return [...keep].sort((a, b) => a - b);
}

// ─── prompt ──────────────────────────────────────────────────────────

const TONE =
    '淡彩水墨工筆畫風：淡墨細線勾勒，清透水彩薄塗，設色清淡通透，大面積留白，宣紙暈染質感。';
const NO_TEXT =
    '全圖純畫面，無任何文字、標籤、題字、印章、邊框、數字、字母、浮水印或排版框線。';

/** Heat → a one-clause palette/mood hint, mirroring SceneHeatProfile axes. */
export function heatPaletteHint(heat?: SceneHeatProfile): string {
    if (!heat) return '';
    const { cinnabar, jade, mute } = heat;
    const max = Math.max(cinnabar, jade, mute);
    if (max <= 0) return '';
    if (max === cinnabar) return '此刻張力最盛：硃紅暖調、光影對比強、神情緊繃';
    if (max === jade) return '此刻偏觀察靜默：青碧冷調、視線交錯、神情含蓄';
    return '此刻歸於日常：素淡灰調、舉止鬆弛、氣氛平和';
}

export interface StillPromptInput {
    /** Cast in the frame, "名（行當）、名（行當）". */
    cast: string;
    /** Scene name. */
    sceneName?: string;
    /** This beat's text (tick intent / scene-line). */
    beatText?: string;
    heat?: SceneHeatProfile;
}

/**
 * Build the img2img prompt for one beat's still — scene-framed (a moment of an
 * incident), conditioned on the cast's anchor portraits, tinted by heat. Mirrors
 * web's `eventMomentPrompt` register; the still-compiler can't import that (it's
 * web-side), so the template is colocated here per the prompt-colocation rule.
 */
export function buildStillPrompt(input: StillPromptInput): string {
    const where = input.sceneName ? `${input.sceneName}，` : '';
    const beat = input.beatText?.trim() ? `${input.beatText.trim()}。` : '';
    const palette = heatPaletteHint(input.heat);
    const paletteClause = palette ? `${palette}。` : '';
    return (
        `${TONE}\n一幅多人物場景劇照：${where}${beat}` +
        `畫面同時呈現 ${input.cast}；每個人的五官、髮型、氣質與其對應參考圖保持一致，` +
        `依各自身份與此刻處境安排站位、神態與互動。${paletteClause}構圖完整、自然光。${NO_TEXT}`
    );
}

// ─── compile orchestration (pure; render + anchor injected) ──────────

export interface CaptureStillsInput {
    sagaId: string;
    /** Resolved event to capture stills for (commitment subject_id). */
    eventId: string;
    /** tx digest of the on-chain event — stamped into each still's provenance. */
    eventTx?: string;
    sceneId?: string;
    /** Scene name (for the prompt). */
    sceneName?: string;
    /** Characters in the event — their anchors condition every still. */
    involvedCharacterIds: string[];
    /** Pre-formatted cast label for the prompt, e.g. "某花旦（青衣）、某小生（小生）". */
    cast?: string;
    /** Per-beat text (tick intent / scene-line), indexed by beat. */
    beatTexts?: string[];
    /** Per-beat heat, ordered by beat index — drives the capture gate + palette. */
    beatHeat?: SceneHeatProfile[];
    tensionThreshold?: number;
    maxPerEvent?: number;
    alwaysClimax?: boolean;
    /** Override image model. */
    model?: string;
    /** Dry-run: pick beats + build prompts but don't render/anchor. */
    dryRun?: boolean;
}

export interface CaptureStillsResult {
    /** Stills produced (provenance-stamped). On dryRun `fullBlobId` is ''. */
    stills: EventStill[];
    /** Beat indices selected for capture. */
    capturedBeats: number[];
    /** Built prompts, parallel to capturedBeats. */
    prompts: string[];
    anchored: boolean;
    skipReason?: 'no_event' | 'no_cast' | 'no_qualifying_beats' | 'no_signer' | 'render_failed';
    errors?: string[];
}

/** Render one beat's image bytes from the cast's anchors. */
export interface StillRenderResult {
    ok: boolean;
    bytes?: Uint8Array;
    usedCharacterIds: string[];
    skipped?: string;
    error?: string;
}
export type StillRenderFn = (args: {
    characterIds: string[];
    prompt: string;
    beatIndex: number;
}) => Promise<StillRenderResult>;

/** Upload + anchor a batch of stills (one PTB). Items in input order. */
export type StillAnchorFn = (
    items: Array<{ sagaId: string; subjectId: string; content: Uint8Array; contentType?: string }>,
) => Promise<Array<{ blobId: string; commitmentId?: string }>>;

export interface CompileStillsDeps {
    render: StillRenderFn;
    /** null → cannot persist (returns `no_signer`). */
    anchor: StillAnchorFn | null;
    now?: () => string;
}

/**
 * Orchestrate: select beats → build prompts → render each → batch-anchor →
 * EventStill[]. Pure given its injected `render` / `anchor`.
 */
export async function compileStills(
    input: CaptureStillsInput,
    deps: CompileStillsDeps,
): Promise<CaptureStillsResult> {
    const now = deps.now ?? (() => new Date().toISOString());
    if (!input.eventId) {
        return { stills: [], capturedBeats: [], prompts: [], anchored: false, skipReason: 'no_event' };
    }
    if (input.involvedCharacterIds.length === 0) {
        return { stills: [], capturedBeats: [], prompts: [], anchored: false, skipReason: 'no_cast' };
    }

    const capturedBeats = selectStillBeats(input.beatHeat, {
        tensionThreshold: input.tensionThreshold,
        maxPerEvent: input.maxPerEvent,
        alwaysClimax: input.alwaysClimax,
    });
    if (capturedBeats.length === 0) {
        return { stills: [], capturedBeats: [], prompts: [], anchored: false, skipReason: 'no_qualifying_beats' };
    }

    const cast = input.cast?.trim() || '在場眾人';
    const prompts = capturedBeats.map((i) =>
        buildStillPrompt({
            cast,
            sceneName: input.sceneName,
            beatText: input.beatTexts?.[i],
            heat: input.beatHeat?.[i],
        }),
    );

    if (input.dryRun) {
        const stills = capturedBeats.map<EventStill>((i) => ({
            eventId: input.eventId,
            eventTx: input.eventTx,
            sceneId: input.sceneId,
            beatIndex: i,
            involvedCharacterIds: [...input.involvedCharacterIds],
            fullBlobId: '',
            heat: input.beatHeat?.[i],
            createdAt: now(),
        }));
        return { stills, capturedBeats, prompts, anchored: false };
    }

    const errors: string[] = [];
    const rendered: Array<{ beatIndex: number; bytes: Uint8Array; usedCharacterIds: string[] }> = [];
    for (let k = 0; k < capturedBeats.length; k += 1) {
        const beatIndex = capturedBeats[k];
        const r = await deps.render({ characterIds: input.involvedCharacterIds, prompt: prompts[k], beatIndex });
        if (r.ok && r.bytes) {
            rendered.push({ beatIndex, bytes: r.bytes, usedCharacterIds: r.usedCharacterIds });
        } else {
            errors.push(`beat ${beatIndex}: ${r.skipped ?? r.error ?? 'render_failed'}`);
        }
    }
    if (rendered.length === 0) {
        return { stills: [], capturedBeats, prompts, anchored: false, skipReason: 'render_failed', errors };
    }

    if (!deps.anchor) {
        return { stills: [], capturedBeats, prompts, anchored: false, skipReason: 'no_signer', errors };
    }

    let anchorResults: Array<{ blobId: string; commitmentId?: string }>;
    try {
        anchorResults = await deps.anchor(
            rendered.map((r) => ({
                sagaId: input.sagaId,
                subjectId: input.eventId,
                content: r.bytes,
                contentType: 'image/png',
            })),
        );
    } catch (err) {
        errors.push(`anchor: ${err instanceof Error ? err.message : String(err)}`);
        return { stills: [], capturedBeats, prompts, anchored: false, skipReason: 'render_failed', errors };
    }

    const stills = rendered.map<EventStill>((r, idx) => ({
        eventId: input.eventId,
        eventTx: input.eventTx,
        sceneId: input.sceneId,
        beatIndex: r.beatIndex,
        involvedCharacterIds: r.usedCharacterIds,
        fullBlobId: anchorResults[idx]?.blobId ?? '',
        heat: input.beatHeat?.[r.beatIndex],
        createdAt: now(),
    }));

    return { stills, capturedBeats, prompts, anchored: true, errors: errors.length ? errors : undefined };
}
