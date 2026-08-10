/**
 * @endless-story/engine — a standalone, local-first narrative engine.
 *
 * Runs the verified want-engine loop (RUNNER_V2) with NO chain, NO Walrus/Seal,
 * NO Next.js. Infra is behind pluggable ports (src/ports.ts); the M0 default
 * backend is local (fake agent / JSON recall / markdown archive). See README.md.
 *
 * This barrel is node-clean: it never eagerly imports runner's tsx-only graph
 * (whose `.js` specifiers only resolve under tsx / a bundler), so it loads under
 * `node --test`. The real-LLM RunnerSceneAgent lives at
 * `@endless-story/engine/adapters/runner` and is loaded only by the CLI.
 *
 * The one allowed exception is a runner LEAF that imports nothing itself —
 * today `@endless-story/runner/infra/json-loose`, pulled in by
 * core/want-rewrite.ts so the truncated-JSON repair has exactly one
 * implementation instead of a mirror that drifts. That leaf carries a standing
 * no-imports rule in its own header; break it and every test here fails to
 * resolve at once (loudly, which is the point).
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
export * from './core/dream.ts';

// 宏觀節奏 (macro rhythm): the external-push layer, the money loop's inward half,
// the want lifecycle, character artifacts, and the vitals. See README 「宏觀節奏」.
export * from './core/event-deck.ts';
export * from './core/income-events.ts';
export * from './core/patronage.ts';
export * from './core/standing.ts';
export * from './core/secret-ledger.ts';
export * from './core/roster-change.ts';
export * from './core/want-lifecycle.ts';
export * from './core/artifacts.ts';
export * from './core/vitals.ts';
export * from './core/background-needs.ts';

// Ports + world + pipeline + preset.
export * from './ports.ts';
export * from './world-state.ts';
export * from './tick.ts';
// 折子（喚醒層 P1）：拍與拍之間的有界演繹。零鏈、now 由呼叫端傳入。
export * from './interlude.ts';
export * from './preset.ts';
export * from './session/character-session.ts';
export * from './season-opening.ts';
export * from './tick-transaction.ts';

// Local-first adapters (node-clean).
export { FakeSceneAgent, LocalRecall, FileArchive, LocalClock, LocalEconomy, makeClock, MirrorClock, sampleMirrorClock } from './adapters/local/index.ts';
