/**
 * Director (director.move) — saga-level capability emitters.
 *
 * Thin wrappers around `generated/endless_story/director.ts`. Each
 * exported function corresponds to one capability the saga director
 * LLM can pick from (see `@endless-story/runner/types` for the JSON
 * schema fed to the LLM).
 */
import * as gen from '../generated/endless_story/director.js';
import { pkg } from './_package.js';

export { gen as raw };

export const openStorylet = (args: gen.OpenStoryletArguments) =>
    gen.openStorylet({ package: pkg(), arguments: args });

export const attributePressure = (args: gen.AttributePressureArguments) =>
    gen.attributePressure({ package: pkg(), arguments: args });

export const characterCall = (args: gen.CharacterCallArguments) =>
    gen.characterCall({ package: pkg(), arguments: args });

export const relationshipSeed = (args: gen.RelationshipSeedArguments) =>
    gen.relationshipSeed({ package: pkg(), arguments: args });

export const advancePhase = (args: gen.AdvancePhaseArguments) =>
    gen.advancePhase({ package: pkg(), arguments: args });
