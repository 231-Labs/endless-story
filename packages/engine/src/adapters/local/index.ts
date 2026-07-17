/**
 * Local-first adapters — the M0 default backend: a deterministic fake agent,
 * JSON-file recall, markdown archive, and an in-process clock. All node-clean
 * (no runner `.js` graph), so the barrel that re-exports them stays loadable
 * under `node --test`. RunnerSceneAgent (real LLM) lives one level up because it
 * imports runner eagerly.
 */

export { FakeSceneAgent } from './fake-scene-agent.ts';
export { LocalRecall } from './local-recall.ts';
export { FileArchive } from './file-archive.ts';
export { LocalClock, makeClock } from './clock.ts';
export { LocalEconomy } from './local-economy.ts';
