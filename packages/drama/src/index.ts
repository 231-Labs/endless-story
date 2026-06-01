// @endless-story/drama — the pure, zero-dependency Desire/Resource Drama Engine.
//
// Imports NOTHING outside this package (no web/runner/sdk/llm/memwal/shared). Port-back to
// the main repo = copy this directory. The simulator and (later) the product import THIS
// module; the transition is never reimplemented.

export { SCALE, ZERO, mulScale, mulDiv, bmin, bmax, isScaled } from "./fixed.ts";
export type {
  Desire,
  ResourceClaim,
  Resource,
  ResourceRefill,
  Transfer,
  Cost,
  Action,
  ActionResult,
  AgentState,
  WorldState,
  TuningConfig,
} from "./types.ts";
export { applyTick, applyTickVerbose } from "./applyTick.ts";
export type { TickOutcome } from "./applyTick.ts";
export { tension, maxTension, tensionSnapshot } from "./tension.ts";
export type { TensionPoint } from "./tension.ts";
