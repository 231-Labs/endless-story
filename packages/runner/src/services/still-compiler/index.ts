/**
 * Still Compiler — renders verifiable event 劇照 (see docs/CONTENT_PIPELINE.md §5).
 * Sibling of the §11 Image Compiler; a stateless service, not an autonomous agent.
 *
 * **Trigger**: event resolution (judge auto-close). Captures EVERY beat whose
 *   `SceneHeatProfile.cinnabar` crosses `tensionThreshold`, capped by
 *   `maxPerEvent`; `alwaysClimax` guarantees at least the resolution beat.
 *
 * **Consistency rule (no face swap)** — composited img2img, never from scratch:
 *   each still conditions on EVERY involved character's clean anchor portrait
 *   (via `renderAnchoredImage`, the recipe shared with event-moment / curio),
 *   so faces/builds don't drift. Heat tints palette + mood.
 *
 * **Output per still**: full-res blob, anchored on the content road
 *   (`commitment::commit` subject=eventId, one PTB for the whole batch via
 *   `signAndAnchorBatch`). Stored as an `EventStill` (→ SceneGallery.moments).
 *   Teaser/watermark is a follow-up (teaserBlobId optional). Becomes the
 *   keyframe for image-to-video (§4).
 *
 * This file is the I/O wiring only: it provides the real OpenAI render + on-chain
 * anchor defaults and delegates to the PURE `compileStills` in ./select.ts
 * (where all the logic lives + is unit-tested).
 */

import type { Keypair } from '@mysten/sui/cryptography';
import { signAndAnchorBatch } from '../../infra/sign-and-anchor.js';
import { renderAnchoredImage } from '../content/render-anchored-image.js';
import {
    compileStills,
    type CaptureStillsInput,
    type CaptureStillsResult,
    type StillRenderFn,
    type StillAnchorFn,
} from './select.js';

export {
    selectStillBeats,
    buildStillPrompt,
    heatPaletteHint,
    compileStills,
} from './select.js';
export type {
    CaptureStillsInput,
    CaptureStillsResult,
    StillRenderResult,
    StillRenderFn,
    StillAnchorFn,
    CompileStillsDeps,
} from './select.js';

export interface RunOnceDeps {
    /** Override the render step (default = chain anchors + OpenAI edit). */
    render?: StillRenderFn;
    /** Override the upload+anchor step (default = signAndAnchorBatch). */
    anchor?: StillAnchorFn;
    /** Signer for the default anchor (holds StorytellerCap). Required unless
     *  `anchor` is provided or `dryRun` is set. */
    signer?: Keypair;
    now?: () => string;
}

/** I/O entry: wire the real render + anchor, then run the pure compiler. */
export async function runOnce(
    input: CaptureStillsInput,
    deps: RunOnceDeps = {},
): Promise<CaptureStillsResult> {
    const render: StillRenderFn =
        deps.render ??
        ((args) =>
            renderAnchoredImage({
                characterIds: args.characterIds,
                prompt: args.prompt,
                model: input.model,
            }));

    const signer = deps.signer;
    const anchor: StillAnchorFn | null =
        deps.anchor ??
        (signer
            ? (items) =>
                  signAndAnchorBatch(items, { signer }).then((rs) =>
                      rs.map((r) => ({ blobId: r.blobId, commitmentId: r.commitmentId })),
                  )
            : null);

    return compileStills(input, { render, anchor, now: deps.now });
}
