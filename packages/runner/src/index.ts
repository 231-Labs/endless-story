/**
 * @endless-story/runner — narrative generation orchestration.
 *
 * v2 architecture (2026-05-26 redesign):
 *   - Each service is an independent subscribe→reduce→emit unit
 *   - Chain events are the message bus (no in-process shared state)
 *   - All outputs go through sign-and-anchor (Walrus + commitment::commit)
 *   - Services usable as `runOnce(input)` for web admin actions; tail
 *     mode for long-running event subscribers comes later
 *
 * See AGENTS.md → 「Runner v2 設計」.
 */

export * as director from './services/saga-director/index.js';
export * as characterWorker from './services/character-worker/index.js';
export * as gazette from './services/gazette-compiler/index.js';
export * as reflection from './services/reflection-trigger/index.js';
export * as genesisMemory from './services/genesis-memory/index.js';
export * as characterAgent from './services/character-agent/index.js';
export * as dream from './services/dream-pipeline/index.js';
export { moderateDream } from './services/dream-pipeline/moderator.js';
export * as video from './services/video-compiler/index.js';

export * from './types/index.js';

export { fetchEventsSince } from './infra/event-bus.js';
export { signAndAnchor, signAndAnchorBatch, pushCommitCall } from './infra/sign-and-anchor.js';
export type { AnchorItem, BatchAnchorOptions } from './infra/sign-and-anchor.js';
export { resolveNetwork } from './infra/network.js';
export {
    fetchWorldTime,
    deriveDay,
    derivePartOfDay,
    ticksPerDay,
    type WorldTime,
    type PartOfDay,
} from './infra/world-time.js';
