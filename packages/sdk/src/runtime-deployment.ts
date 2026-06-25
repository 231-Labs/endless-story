/**
 * Runtime deployment override — lets a running process pick up a fresh on-chain
 * deployment (after a remote package upgrade) WITHOUT a rebuild.
 *
 * `contract-ids.ts` is a build-time constant compiled into the bundle, so
 * rewriting that source file at runtime is invisible to a running `next start`.
 * This module is the seam: server boot reads a manifest JSON from a mounted
 * volume (`DEPLOYMENT_MANIFEST_PATH`) and the client fetches `/api/deployment`,
 * both calling `setRuntimeDeployment` so `getDeployment()` (and `pkg()`) return
 * the live ids. The compiled const stays the seed / fallback.
 *
 * An upgrade only changes `latestPackageId`, which every Move call routes
 * through `pkg()` — so applying the override on both runtimes is enough for
 * txs to target the upgraded package with no rebuild. Object ids (saga,
 * registry, config) survive an upgrade unchanged; a fresh `deploy` that mints
 * new objects still expects a rebuild to reseed the const.
 */
import {
  ENDLESS_STORY_DEPLOYMENT,
  type EndlessStoryDeployment,
} from '@endless-story/shared/contract-ids';

let override: Partial<EndlessStoryDeployment> | null = null;

/** Apply (or clear with `null`) a runtime override. Fields present win over the
 *  compiled const; absent fields fall back to it. Idempotent + cheap. */
export function setRuntimeDeployment(d: Partial<EndlessStoryDeployment> | null): void {
  override = d && Object.keys(d).length > 0 ? d : null;
}

/** The raw override, or null if none applied. */
export function getRuntimeDeployment(): Partial<EndlessStoryDeployment> | null {
  return override;
}

/** The compiled snapshot merged with any runtime override. This is what all
 *  deployment reads should prefer over importing the const directly. */
export function getDeployment(): EndlessStoryDeployment {
  return override ? { ...ENDLESS_STORY_DEPLOYMENT, ...override } : ENDLESS_STORY_DEPLOYMENT;
}
