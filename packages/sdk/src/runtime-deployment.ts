/**
 * Runtime deployment override — lets a running process adopt a fresh on-chain
 * deployment (after a remote package upgrade OR a re-bootstrap that mints a new
 * world) WITHOUT a rebuild.
 *
 * `contract-ids.ts` is a build-time constant compiled into the bundle, so
 * rewriting that source file at runtime is invisible to a running `next start`.
 * This module is the seam: server boot reads a manifest JSON from a mounted
 * volume (`DEPLOYMENT_MANIFEST_PATH`) and the client fetches `/api/deployment`,
 * both calling `setRuntimeDeployment`.
 *
 * Strategy: MUTATE the exported `ENDLESS_STORY_DEPLOYMENT` object in place.
 * ~300 call sites read its fields inline (`ENDLESS_STORY_DEPLOYMENT.sagaId`),
 * so mutating the single shared instance makes every one of them see the live
 * ids with no accessor refactor. The object identity is preserved; only its
 * fields change. The compiled values are snapshotted once as the seed so a
 * partial override (or a clear) is always applied relative to a stable base.
 *
 * Module-level captures of the object are safe: the only ones in the tree read
 * `.packageId`, which is the original-package type anchor and never changes
 * across an upgrade or re-bootstrap (only a fresh publish would, and that path
 * is not runtime-overridable).
 */
import {
  ENDLESS_STORY_DEPLOYMENT,
  type EndlessStoryDeployment,
} from '@endless-story/shared/contract-ids';

/** Compiled seed, captured before any override so resets are relative to it. */
const seed: EndlessStoryDeployment = { ...ENDLESS_STORY_DEPLOYMENT };
let applied = false;

/** Apply (or clear with `null`) a runtime override, mutating the shared
 *  deployment object in place. Resets to the seed first so a partial override
 *  clears any field set by a previous override. Idempotent + cheap. */
export function setRuntimeDeployment(d: Partial<EndlessStoryDeployment> | null): void {
  Object.assign(ENDLESS_STORY_DEPLOYMENT, seed, d ?? {});
  applied = !!(d && Object.keys(d).length > 0);
}

/** The live deployment if an override is applied, else null. */
export function getRuntimeDeployment(): EndlessStoryDeployment | null {
  return applied ? ENDLESS_STORY_DEPLOYMENT : null;
}

/** The live deployment (compiled seed, mutated by any applied override). Prefer
 *  this for fresh reads, though direct `ENDLESS_STORY_DEPLOYMENT.x` works too
 *  since it is the same mutated object. */
export function getDeployment(): EndlessStoryDeployment {
  return ENDLESS_STORY_DEPLOYMENT;
}
