/**
 * Still Compiler — renders verifiable event 劇照 (see docs/CONTENT_PIPELINE.md §5).
 * Sibling of the §11 Image Compiler; a stateless service, not an autonomous agent.
 *
 * **Trigger**: event resolution (judge auto-close). Captures EVERY beat whose
 *   `SceneHeatProfile.cinnabar` crosses `tensionThreshold`, capped by
 *   `maxPerEvent`; `alwaysClimax` guarantees at least the resolution beat.
 *
 * **Consistency rule (no face swap)** — composited img2img, never from scratch:
 *     Still = f( scene anchor (SceneGallery.anchor),
 *                [ each involved character's anchor portrait (chain image_url)
 *                  + physical_facts ],
 *                beat text (tick intent / scene-lines),
 *                heatProfile (cinnabar/jade/mute → palette · intensity) )
 *
 * **Output per still**: full-res (gated) + low-res/watermarked teaser (public,
 *   gazette headline + social). Stored in SceneGallery.moments as a BlobRef
 *   (kind='event_moment'); anchored via commitment::commit(subject=eventId,
 *   hint="still:beat<i>"). Becomes the keyframe for image-to-video (§4).
 *
 * R0: type-shell only (lands per CONTENT_PIPELINE §9).
 */

import type { EventStill, SceneHeatProfile } from '@endless-story/shared';

export interface CaptureStillsInput {
    sagaId: string;
    /** Resolved event to capture stills for. */
    eventId: string;
    /** tx digest of the on-chain event — stamped into each still's provenance. */
    eventTx?: string;
    sceneId?: string;
    /** Per-beat heat, ordered by beat index — drives the capture gate. */
    beatHeat?: SceneHeatProfile[];
    /** cinnabar threshold a beat must cross to be captured. */
    tensionThreshold?: number;
    /** Hard cap on stills per event (cost ceiling). */
    maxPerEvent?: number;
    /** Always capture the resolution beat even if no beat crosses threshold. */
    alwaysClimax?: boolean;
    /** Override image model. */
    model?: string;
    /** Dry-run: pick beats + build prompts but don't generate/anchor. */
    dryRun?: boolean;
}

export interface CaptureStillsResult {
    /** Stills produced (full + teaser blobs, provenance-stamped). */
    stills: EventStill[];
    /** Beat indices selected for capture. */
    capturedBeats: number[];
    anchored: boolean;
    skipReason?: 'no_event' | 'no_qualifying_beats';
    errors?: string[];
}

export async function runOnce(_input: CaptureStillsInput): Promise<CaptureStillsResult> {
    throw new Error('still-compiler.runOnce: not yet implemented (see CONTENT_PIPELINE §9)');
}
