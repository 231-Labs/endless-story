import type { Config } from '@mysten/codegen';

/**
 * sui-ts-codegen generates TypeScript bindings for the endless_story
 * Move package. Output lives in `src/generated/` — **never edit by hand**.
 *
 * Run: `pnpm --filter @endless-story/sdk codegen`
 *
 * Bindings re-link to the deployed packageId at runtime via
 * `@endless-story/shared/contract-ids` → ENDLESS_STORY_DEPLOYMENT.packageId.
 */
const config: Config = {
  output: './src/generated',
  prune: true,
  generateSummaries: true,
  packages: [
    {
      package: '@local-pkg/endless-story',
      path: '../../contracts/endless_story',
    },
  ],
};

export default config;
