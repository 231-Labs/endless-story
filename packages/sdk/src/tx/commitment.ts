/**
 * Commitment (commitment.move) — Layer 1 memory provenance anchor.
 *
 * Thin wrappers around `generated/endless_story/commitment.ts`. Only one
 * entry function (`commit`); kept as its own file so future additions
 * (research Layer 2 in a separate package) don't bleed into the saga
 * surface.
 */
import * as gen from '../generated/endless_story/commitment.js';
import { pkg } from './_package.js';

export { gen as raw };

/**
 * Publish a Walrus-backed commitment for `subjectId`. Storyteller-only
 * (auth via `cap` against `saga`). The clock arg is wired up by the
 * generated layer — callers only need to supply the business args.
 */
export const commit = (args: gen.CommitArguments) =>
    gen.commit({ package: pkg(), arguments: args });
