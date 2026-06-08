// Reactive, deterministic Planner. Turns world state into proposed Actions each tick.
//
// Policy (per agent, in canonical agent order):
//   1. Pick a FOCUS desire = highest-tension desire, with margin hysteresis so the agent
//      stays committed unless a rival desire clearly overtakes it (anti-thrash, spec §6).
//   2. For that focus desire, find the most under-supplied resource claim and try to close
//      the gap — acquire from the free pool if any capacity is free, else SEIZE from the
//      current top holder, but only if focus tension beats the incumbent by seizeMargin.
//   3. Acting costs `actionCost` from the agent's own schedule (budget). No budget → no
//      action. This finite budget is what bounds ping-pong and (Step 2) forces the
//      intra-agent trade-off.
//
// At most ONE action per agent per tick, so the budget is a real constraint on attention.
// Deterministic: agents processed in sorted id order; ties broken by sorted resource id.
// Goal-persistence state (each agent's committed focus) is returned, kept OUT of the world.

import {
  ZERO,
  maxTension,
  tension,
  type Action,
  type AgentState,
  type Desire,
  type Resource,
  type WorldState,
} from "../src/index.ts";
import type { PlannerConfig } from "./types.ts";

/** agent's committed focus desire id, carried across ticks (planner-only state). */
export type FocusState = Record<string, string>;

const held = (r: Resource, agent: string): bigint => r.allocations[agent] ?? ZERO;
const allocatedTotal = (r: Resource): bigint =>
  Object.keys(r.allocations).reduce((s, a) => s + r.allocations[a], ZERO);

/** Choose the focus desire with margin hysteresis. Returns the chosen desire (or undefined). */
function selectFocus(agent: AgentState, prevFocusId: string | undefined, focusMargin: bigint): Desire | undefined {
  if (agent.desires.length === 0) return undefined;
  const champion = maxTension(agent);
  if (!champion) return undefined;
  if (prevFocusId === undefined) return champion.desire;
  const incumbent = agent.desires.find((d) => d.id === prevFocusId);
  if (!incumbent) return champion.desire;
  if (champion.desire.id === incumbent.id) return incumbent;
  // switch only if the challenger clearly beats the incumbent (hysteresis)
  return champion.value > tension(incumbent) + focusMargin ? champion.desire : incumbent;
}

/** Top OTHER holder of a resource (most units, excluding `self`), deterministic on ties. */
function topOtherHolder(r: Resource, self: string): { agent: string; amount: bigint } | undefined {
  let best: { agent: string; amount: bigint } | undefined;
  for (const agent of Object.keys(r.allocations).sort()) {
    if (agent === self) continue;
    const amount = r.allocations[agent];
    if (amount <= ZERO) continue;
    if (!best || amount > best.amount) best = { agent, amount };
  }
  return best;
}

/** Highest tension any of `holder`'s desires derive from resource `rid` (what they'd defend). */
function holderStakeTension(world: WorldState, holderId: string, rid: string): bigint {
  const holder = world.agents.find((a) => a.id === holderId);
  if (!holder) return ZERO;
  let best = ZERO;
  for (const d of holder.desires) {
    if (d.draws_from.some((c) => c.resource_id === rid)) {
      const t = tension(d);
      if (t > best) best = t;
    }
  }
  return best;
}

export interface PlanResult {
  actions: Action[];
  focus: FocusState;
}

/**
 * Build the action an agent would take to pursue ONE desire this tick: close the gap on its
 * most-under-supplied claim, acquiring from the free pool or seizing from the top holder
 * (only if it out-tenses them by the margin). Returns undefined if there's nothing to do or
 * it can't legally take the resource. Does NOT check the budget — the caller meters that.
 */
function buildActionForDesire(
  world: WorldState,
  agentId: string,
  desire: Desire,
  cfg: PlannerConfig,
): Action | undefined {
  const schedId = cfg.scheduleResourceId(agentId);
  const gaps = desire.draws_from
    .map((c) => {
      const r = world.resources[c.resource_id];
      const have = r ? held(r, agentId) : ZERO;
      return { rid: c.resource_id, gap: c.claim - have };
    })
    .filter((g) => g.gap > ZERO)
    .sort((a, b) => (b.gap !== a.gap ? (b.gap > a.gap ? 1 : -1) : a.rid < b.rid ? -1 : 1));
  if (gaps.length === 0) return undefined;

  const { rid, gap } = gaps[0];
  const r = world.resources[rid];
  if (!r) return undefined;

  const free = r.capacity - allocatedTotal(r);
  if (free > ZERO) {
    const amount = gap < free ? gap : free;
    return {
      actor: agentId,
      transfers: [{ resource_id: rid, to: agentId, amount }],
      cost: [{ resource_id: schedId, amount: cfg.actionCost }],
    };
  }
  const victim = topOtherHolder(r, agentId);
  if (!victim) return undefined;
  const mine = tension(desire);
  const theirs = holderStakeTension(world, victim.agent, rid);
  if (mine <= theirs + cfg.seizeMargin) return undefined;
  const amount = gap < victim.amount ? gap : victim.amount;
  return {
    actor: agentId,
    transfers: [{ resource_id: rid, from: victim.agent, to: agentId, amount }],
    cost: [{ resource_id: schedId, amount: cfg.actionCost }],
  };
}

/**
 * Produce this tick's actions + next focus state. Pure given (world, cfg, focusState).
 *
 * Intra-agent budgeting is the heart of Step 2: an agent spends its ONE finite schedule
 * budget across ALL its tense desires, in priority order (committed focus first, then the
 * rest by tension), STOPPING when the budget runs out. With an abundant budget it can fund
 * every desire each tick (no trade-off). With a scarce budget it can only fund the top
 * one(s) → the lower-priority desire starves. That trade-off is *derived* from the budget
 * being finite — never declared. The Liu moment lives exactly here.
 *
 * (Budget read is pre-refill; applyTick refills before debiting, so every planned action is
 * guaranteed affordable — the planner is conservative, never overspends.)
 */
export function plan(world: WorldState, cfg: PlannerConfig, focusState: FocusState): PlanResult {
  const actions: Action[] = [];
  const nextFocus: FocusState = {};

  for (const agent of [...world.agents].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const focus = selectFocus(agent, focusState[agent.id], cfg.focusMargin);
    if (!focus) continue;
    nextFocus[agent.id] = focus.id;

    const schedId = cfg.scheduleResourceId(agent.id);
    const sched = world.resources[schedId];
    let remaining = sched ? held(sched, agent.id) : ZERO;

    // priority order: committed focus first, then the other desires by tension desc
    const others = agent.desires
      .filter((d) => d.id !== focus.id)
      .sort((a, b) => {
        const ta = tension(a);
        const tb = tension(b);
        return tb !== ta ? (tb > ta ? 1 : -1) : a.id < b.id ? -1 : 1;
      });
    const order = [focus, ...others];

    for (const desire of order) {
      if (tension(desire) < cfg.actThreshold) continue; // not worth attention
      if (remaining < cfg.actionCost) break; // budget exhausted → lower priorities starve
      const action = buildActionForDesire(world, agent.id, desire, cfg);
      if (action) {
        actions.push(action);
        remaining -= cfg.actionCost;
      }
    }
  }

  return { actions, focus: nextFocus };
}
