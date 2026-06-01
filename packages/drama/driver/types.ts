// Driver-side types. The driver is the OFFLINE script that advances the world: it runs a
// Planner each tick to turn world state into proposed Actions, applies the pure transition,
// and records a trace. NONE of this is the pure core — in particular goal-persistence
// hysteresis lives HERE (locked decision #2: "放在 Planner、不進純 transition").

import type { Action, TuningConfig, WorldState } from "../src/index.ts";

/**
 * Knobs for the reactive planner. Separate from TuningConfig (which governs the pure
 * satisfaction dynamics) — these govern *behaviour* (who acts, when, at what cost).
 */
export interface PlannerConfig {
  /**
   * A challenger may SEIZE a contested resource only if its focus-desire tension exceeds
   * the incumbent holder's competing tension by this margin. The cross-agent hysteresis
   * that (together with budget cost) bounds slot ping-pong.
   */
  seizeMargin: bigint;
  /**
   * An agent switches its FOCUS desire (intra-agent, Step 2) only if a challenger desire's
   * tension exceeds the currently-committed desire's by this margin. Anti-thrash (§6).
   */
  focusMargin: bigint;
  /** schedule units a grab/seize/acquire action costs the actor. */
  actionCost: bigint;
  /**
   * An agent bothers to act on its focus desire only if that desire's tension is at least
   * this high. Below it, the agent is "content enough" to do nothing → prevents busywork
   * and lets a scenario settle.
   */
  actThreshold: bigint;
  /** convention: the per-agent schedule (action budget) resource id for an agent. */
  scheduleResourceId: (agentId: string) => string;
}

/** Per-tick record for trace/metrics. Holders snapshot the contested resources. */
export interface TickRecord {
  tick: bigint;
  /** satisfaction[agentId][desireId] */
  satisfaction: Record<string, Record<string, bigint>>;
  /** tension[agentId][desireId] */
  tension: Record<string, Record<string, bigint>>;
  /** for each resource: the agent holding the most units (or null if unheld). */
  topHolder: Record<string, string | null>;
  /** schedule[agentId] = current action budget. */
  schedule: Record<string, bigint>;
  /** which desire each agent was focused on this tick (planner state). */
  focus: Record<string, string>;
  /** actions accepted this tick, by actor. */
  acceptedBy: Record<string, number>;
  /** # of an agent's desires that WANTED action (tension ≥ actThreshold) at plan time. */
  wanting: Record<string, number>;
  /** # of actions the planner actually funded for the agent (≤ wanting iff budget-limited). */
  funded: Record<string, number>;
}

export interface Scenario {
  id: string;
  description: string;
  /** fresh world each run (builders must not share mutable state). */
  makeWorld: () => WorldState;
  tuning: TuningConfig;
  planner: PlannerConfig;
  horizon: number;
  /** resources whose contention drives the drama (for metrics focus). */
  contestedResources: string[];
}

export interface RunResult {
  scenario: Scenario;
  trace: TickRecord[];
  finalWorld: WorldState;
}

export type { Action, TuningConfig, WorldState };
