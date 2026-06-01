// Tension is DERIVED, never stored (spec §3 step 3). Computed on read from world state.
//   tension(desire) = weight * (SCALE - satisfaction) / SCALE   ∈ [0, SCALE]
// A heavy, unsatisfied desire is maximally tense; a sated or weightless one is slack.

import { SCALE, mulScale } from "./fixed.ts";
import type { AgentState, Desire, WorldState } from "./types.ts";

/** Tension of a single desire. Bounded [0, SCALE] when weight, satisfaction ∈ [0, SCALE]. */
export function tension(desire: Desire): bigint {
  return mulScale(desire.weight, SCALE - desire.satisfaction);
}

/** The desire an agent is currently most tense about, with its tension value. */
export function maxTension(agent: AgentState): { desire: Desire; value: bigint } | undefined {
  let best: { desire: Desire; value: bigint } | undefined;
  for (const d of agent.desires) {
    const v = tension(d);
    // strict > keeps the FIRST desire on ties → deterministic, order-defined
    if (best === undefined || v > best.value) best = { desire: d, value: v };
  }
  return best;
}

/** A flat snapshot row of one desire's affective state (for traces / assertions). */
export interface TensionPoint {
  tick: bigint;
  agent: string;
  desire: string;
  satisfaction: bigint;
  tension: bigint;
}

export function tensionSnapshot(world: WorldState): TensionPoint[] {
  const out: TensionPoint[] = [];
  for (const agent of world.agents) {
    for (const d of agent.desires) {
      out.push({
        tick: world.tick,
        agent: agent.id,
        desire: d.id,
        satisfaction: d.satisfaction,
        tension: tension(d),
      });
    }
  }
  return out;
}
