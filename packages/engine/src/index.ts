/**
 * @endless-story/engine — a standalone, local-first narrative engine.
 *
 * Runs the verified want-engine loop (RUNNER_V2) with NO chain, NO Walrus/Seal,
 * NO Next.js. Infra is behind pluggable ports (src/ports.ts); the M0 default
 * backend is local (fake agent / JSON recall / markdown archive). See README.md.
 *
 * This barrel is node-clean: it never eagerly imports `@endless-story/runner`
 * (whose `.js` specifiers only resolve under tsx / a bundler), so it loads under
 * `node --test`. The real-LLM RunnerSceneAgent lives at
 * `@endless-story/engine/adapters/runner` and is loaded only by the CLI.
 */

// Pure narrative core (relocated from web/lib/chain).
export * from './core/want-core.ts';
export * from './core/bond-graph.ts';
export * from './core/want-rewrite.ts';
export * from './core/box-office.ts';
export * from './core/scene-routing.ts';
export * from './core/scene-loop.ts';
export * from './core/skills.ts';
export * from './core/actor-fatigue.ts';
export * from './core/spatial-routing.ts';
export * from './core/production.ts';
export * from './core/acquaintance.ts';
export * from './core/temple-prayer.ts';
export * from './core/incense.ts';

// Ports + world + pipeline + preset.
export * from './ports.ts';
export * from './world-state.ts';
export * from './tick.ts';
export * from './preset.ts';
export * from './session/character-session.ts';
export * from './season-opening.ts';
export * from './tick-transaction.ts';

// Local-first adapters (node-clean).
export { FakeSceneAgent, LocalRecall, FileArchive, LocalClock, LocalEconomy, makeClock } from './adapters/local/index.ts';
