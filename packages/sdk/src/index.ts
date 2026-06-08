/**
 * @endless-story/sdk — the **only** on-chain entry point in this repo.
 *
 * web / runner / cli must import from here (or `./client`, `./tx`, `./read`).
 * Never `new SuiClient()` outside this package — see AGENTS.md
 * on-chain-architecture principle 2.
 *
 * Subpath exports:
 *   - `@endless-story/sdk/client` — SuiClient factory (browser-safe)
 *   - `@endless-story/sdk/node`   — loadKeypair / makeSuiContext (Node-only)
 *   - `@endless-story/sdk/tx`     — PTB builders (one per Move module)
 *   - `@endless-story/sdk/read`   — view queries (one per Move module)
 *   - `@endless-story/sdk/generated/*` — codegen output (do not edit)
 *
 * **Browser-safe.** Anything that touches `node:fs` lives behind the
 * `/node` subpath so it stays out of client bundles.
 */

export * from './client';
export * as tx from './tx';
export * as read from './read';

// Re-export the deployment snapshot so consumers can stay on one import.
export {
  ENDLESS_STORY_DEPLOYMENT,
  isDeployed,
  isWorldSeeded,
  type EndlessStoryDeployment,
  type DemoCharacterRef,
  type SuiNetwork,
} from '@endless-story/shared/contract-ids';
