// The offline tick driver: plan → applyTick → record, for `horizon` ticks. Pure (no I/O).
// This is the fast loop the brief is built around: thousands of ticks in milliseconds, so
// calibration and failure-mode search are tractable (vs ~200s/tick in the product loop).

import { applyTickVerbose, tension, type Resource, type WorldState } from "../src/index.ts";
import { plan, type FocusState } from "./planner.ts";
import type { RunResult, Scenario, TickRecord } from "./types.ts";

const ZERO = 0n;
const held = (r: Resource, agent: string): bigint => r.allocations[agent] ?? ZERO;

/** Agent holding the most units of a resource (sorted id breaks ties); null if unheld. */
function topHolder(r: Resource): string | null {
  let best: { agent: string; amount: bigint } | null = null;
  for (const agent of Object.keys(r.allocations).sort()) {
    const amount = r.allocations[agent];
    if (amount <= ZERO) continue;
    if (!best || amount > best.amount) best = { agent, amount };
  }
  return best ? best.agent : null;
}

function record(
  world: WorldState,
  focus: FocusState,
  acceptedBy: Record<string, number>,
  wanting: Record<string, number>,
  funded: Record<string, number>,
): TickRecord {
  const satisfaction: Record<string, Record<string, bigint>> = {};
  const tens: Record<string, Record<string, bigint>> = {};
  for (const agent of world.agents) {
    satisfaction[agent.id] = {};
    tens[agent.id] = {};
    for (const d of agent.desires) {
      satisfaction[agent.id][d.id] = d.satisfaction;
      tens[agent.id][d.id] = tension(d);
    }
  }
  const topHolders: Record<string, string | null> = {};
  const schedule: Record<string, bigint> = {};
  for (const rid of Object.keys(world.resources)) {
    topHolders[rid] = topHolder(world.resources[rid]);
  }
  for (const agent of world.agents) {
    // schedule resource id follows the same convention; recorded for budget curves
    const sid = `schedule:${agent.id}`;
    const r = world.resources[sid];
    if (r) schedule[agent.id] = held(r, agent.id);
  }
  return { tick: world.tick, satisfaction, tension: tens, topHolder: topHolders, schedule, focus, acceptedBy, wanting, funded };
}

/** Count each agent's desires whose tension ≥ actThreshold (they "want" attention). */
function countWanting(world: WorldState, actThreshold: bigint): Record<string, number> {
  const out: Record<string, number> = {};
  for (const agent of world.agents) {
    let n = 0;
    for (const d of agent.desires) if (tension(d) >= actThreshold) n++;
    out[agent.id] = n;
  }
  return out;
}

/** Run a scenario to completion and return the full trace. Deterministic. */
export function runScenario(scenario: Scenario): RunResult {
  let world = scenario.makeWorld();
  let focus: FocusState = {};
  const trace: TickRecord[] = [];

  // record the initial state (tick 0) before any action
  trace.push(record(world, focus, {}, {}, {}));

  for (let t = 0; t < scenario.horizon; t++) {
    // `wanting` is measured on the PRE-tick world the planner actually saw.
    const wanting = countWanting(world, scenario.planner.actThreshold);
    const planned = plan(world, scenario.planner, focus);
    const funded: Record<string, number> = {};
    for (const a of planned.actions) funded[a.actor] = (funded[a.actor] ?? 0) + 1;
    const { world: next, results } = applyTickVerbose(world, planned.actions, scenario.tuning);
    const acceptedBy: Record<string, number> = {};
    for (const r of results) {
      if (r.accepted) acceptedBy[r.actor] = (acceptedBy[r.actor] ?? 0) + 1;
    }
    world = next;
    focus = planned.focus;
    trace.push(record(world, focus, acceptedBy, wanting, funded));
  }

  return { scenario, trace, finalWorld: world };
}
