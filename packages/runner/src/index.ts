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
 * See AGENTS.md → "Runner v2 design".
 */

export * as director from './services/saga-director/index.js';
export * as characterWorker from './services/character-worker/index.js';
export * as gazette from './services/gazette-compiler/index.js';
export * as eventChapter from './services/event-chapter-compiler/index.js';
export * as reflection from './services/reflection-trigger/index.js';
export * as genesisMemory from './services/genesis-memory/index.js';
export * as relationshipAssess from './services/relationship-assess/index.js';
export * as induction from './services/induction/index.js';
export * as characterAgent from './services/character-agent/index.js';
export * as dream from './services/dream-pipeline/index.js';
export { moderateDream } from './services/dream-pipeline/moderator.js';
export * as video from './services/video-compiler/index.js';
export * as stillCompiler from './services/still-compiler/index.js';

// Shared content recipe (condition on character anchors → one image), reusable
// by the still-compiler now and the curio generator later.
export {
    renderAnchoredImage,
    type RenderAnchoredImageInput,
    type RenderAnchoredImageResult,
} from './services/content/render-anchored-image.js';

export * from './types/index.js';

export { fetchEventsSince } from './infra/event-bus.js';
export { signAndAnchor, signAndAnchorBatch } from './infra/sign-and-anchor.js';
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
