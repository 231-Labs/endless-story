// Driver public surface (the offline simulator).
export { plan } from "./planner.ts";
export type { FocusState, PlanResult } from "./planner.ts";
export { runScenario } from "./run.ts";
export { analyze, renderTrace, DEFAULT_THRESHOLDS, analyzeTradeoff, DEFAULT_TRADEOFF_THRESHOLDS } from "./metrics.ts";
export type { Analysis, Thresholds, TradeoffAnalysis, TradeoffThresholds } from "./metrics.ts";
export type { PlannerConfig, Scenario, TickRecord, RunResult } from "./types.ts";
