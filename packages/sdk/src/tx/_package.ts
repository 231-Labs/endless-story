/**
 * Shared helper: resolve the deployed endless_story packageId.
 *
 * The codegen output (`src/generated/endless_story/*.ts`) embeds
 * `@local-pkg/endless-story` as the package alias. At runtime we must
 * replace it with the real `0x…` packageId from the deployment snapshot.
 *
 * All `tx/<module>.ts` wrappers call `pkg()` to inject this override.
 */
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/shared/contract-ids';

export function pkg(override?: string): string {
  const id = override ?? ENDLESS_STORY_DEPLOYMENT.packageId;
  if (!id) {
    throw new Error(
      '@endless-story/sdk: package not deployed — ' +
        'ENDLESS_STORY_DEPLOYMENT.packageId is empty. ' +
        'Run cli deploy first, or pass `package` override explicitly to raw.* binding.',
    );
  }
  return id;
}
