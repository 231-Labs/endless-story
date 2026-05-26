/**
 * Video Compiler — Seedance 2.0 integration for 30s clips.
 *
 * **Triggers (R6)**:
 *   - `StoryletConcluded` → predicted-trailer mode (montage of beats)
 *   - `SceneEventResolved` with ≥2 POV chapters → multi-POV mode
 *     (per-character vignette stitched into a multi-view piece)
 *   - Admin manual director's cut → cross-storylet edit
 *
 * **Inputs**: storylet metadata, scene refs (Walrus portraits already
 * on chain via Character.image_url), POV chapter prose, scene heat
 * profile (drives colour palette + pacing).
 *
 * **Process**: build shot-list prompt → Seedance 2.0 (treated as the
 * Nth provider under `@endless-story/llm/video`) → video URL →
 * memwal upload → commitment::commit with hint=storylet_id.
 *
 * R0: type-shell only.
 */

export interface CompileVideoInput {
    sagaId: string;
    mode: 'trailer' | 'multi_pov' | 'directors_cut';
    /** Storylet driving the video (trailer + directors_cut) or event
     *  id (multi_pov). */
    sourceId: string;
    /** Override LLM/video model. */
    model?: string;
    dryRun?: boolean;
}

export interface CompileVideoResult {
    /** Walrus blob id for the video. */
    blobId?: string;
    /** Final video URL (Walrus aggregator). */
    videoUrl?: string;
    /** Chain commitment. */
    commitmentId?: string;
    /** Generated shot-list prompt (for debugging / preview). */
    shotListPrompt?: string;
    skipReason?: 'no_source' | 'insufficient_povs' | 'provider_unavailable';
}

export async function runOnce(_input: CompileVideoInput): Promise<CompileVideoResult> {
    throw new Error('video-compiler.runOnce: not yet implemented (lands in R6)');
}
