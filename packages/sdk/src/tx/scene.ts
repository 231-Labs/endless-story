/**
 * Scene (scene.move) — create scene + value constructors.
 *
 * Thin wrappers around `generated/endless_story/scene.ts`.
 */
import * as gen from '../generated/endless_story/scene.js';
import { pkg } from './_package.js';

export { gen as raw };

export const createScene = (args: gen.CreateSceneArguments) =>
  gen.createScene({ package: pkg(), arguments: args });

// ── Value constructors (used inline within PTBs) ─────────────────────────
export const newSceneInfo = (args: gen.NewSceneInfoArguments) =>
  gen.newSceneInfo({ package: pkg(), arguments: args });

export const newSceneAccess = (args: gen.NewSceneAccessArguments) =>
  gen.newSceneAccess({ package: pkg(), arguments: args });

export const newSceneParams = (args: gen.NewSceneParamsArguments) =>
  gen.newSceneParams({ package: pkg(), arguments: args });
