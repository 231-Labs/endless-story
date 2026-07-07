/**
 * Shared helper: resolve the deployed endless_story packageId.
 *
 * The codegen output (`src/generated/endless_story/*.ts`) embeds
 * `@local-pkg/endless-story` as the package alias. At runtime we must
 * replace it with the real `0x…` packageId from the deployment snapshot.
 * After Sui package upgrades, Move calls must target `latestPackageId` while
 * struct type filters stay anchored to the original `packageId`.
 *
 * All `tx/<module>.ts` wrappers call `pkg()` to inject this override.
 */
import { getDeployment } from '../runtime-deployment.js';

export function pkg(override?: string): string {
  const d = getDeployment();
  const id = override ?? d.latestPackageId ?? d.packageId;
  if (!id) {
    throw new Error(
      '@endless-story/sdk: package not deployed — ' +
        'ENDLESS_STORY_DEPLOYMENT.latestPackageId/packageId is empty. ' +
        'Run cli deploy first, or pass `package` override explicitly to raw.* binding.',
    );
  }
  return id;
}
