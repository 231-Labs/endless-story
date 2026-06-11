// The offline day driver: policy → settleDay → record, for `horizon` days. Deterministic.
// Thousands of days/second so calibration and failure-mode search are tractable (vs ~minutes
// per real day in the product loop). settleDay is the pure core; everything here is policy.

import {
  ageHazard,
  applyTransfers,
  conserves,
  dailyCost,
  lifeStage,
  settleDay,
  survivalLevel,
  vitalityState,
  MUNIT,
  VIT_FULL,
  type CharConfig,
  type CharState,
  type EconConfig,
  type TransferRequest,
  type WorldEconState,
} from "../src/index.ts";
import type { DayRecord, DeathLog, RunResult, Scenario } from "./types.ts";

/** Deterministic LCG (no Math.random — runs must be reproducible). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000; // [0,1)
  };
}

/** Fresh newborn: full vitality, genesis memories, seed grant. */
export function newChar(cfg: CharConfig, seedFunds: bigint): CharState {
  return {
    cfg,
    balance: seedFunds,
    vitality: VIT_FULL,
    memoryCount: 5n,
    imageCount: 0n,
    livedDays: 0n,
    subscribers: 0n,
    heldSlot: false,
    insolventStreak: 0n,
    dead: false,
    diedOnDay: null,
  };
}

const attrSum = (c: CharState): number => c.cfg.constitution + c.cfg.appearance + c.cfg.acuity;

/** Capacity-1 contested slot: top alive char by (subscribers, attrSum, id⁻¹) holds it. */
function assignSlot(world: WorldEconState): void {
  let winner: CharState | null = null;
  for (const c of world.chars) {
    if (c.dead) continue;
    if (
      !winner ||
      c.subscribers > winner.subscribers ||
      (c.subscribers === winner.subscribers && attrSum(c) > attrSum(winner)) ||
      (c.subscribers === winner.subscribers && attrSum(c) === attrSum(winner) && c.cfg.id < winner.cfg.id)
    ) {
      winner = c;
    }
  }
  for (const c of world.chars) c.heldSlot = winner !== null && c.cfg.id === winner.cfg.id && !c.dead;
}

/**
 * Patronage: the richest healthy character tops up failing allies to a ~week runway.
 * This is the BETWEEN-DAY POLICY (who gives, to whom, how much) — a greedy decideAid stand-in.
 * The actual money move goes through the pure `applyTransfer` primitive (memo "patronage"), so
 * the driver, the on-chain `transfer_between_characters`, and the runner's GIVE phase share one
 * conservation-preserving transition. Returns the new world + how many rescues were applied.
 */
function runPatronage(world: WorldEconState, cfg: EconConfig): { world: WorldEconState; rescues: number } {
  const alive = world.chars.filter((c) => !c.dead).sort((a, b) => (a.cfg.id < b.cfg.id ? -1 : 1));
  const reserve = 30n * MUNIT; // patron keeps this for itself
  let patron: CharState | null = null;
  for (const c of alive) {
    if (vitalityState(c) === "healthy" && c.balance > reserve + 20n * MUNIT) {
      if (!patron || c.balance > patron.balance) patron = c;
    }
  }
  if (!patron) return { world, rescues: 0 };
  const allies = alive
    .filter((c) => c !== patron && (vitalityState(c) !== "healthy" || c.balance < dailyCost(c, cfg) * 3n))
    .sort((a, b) => (a.vitality < b.vitality ? -1 : a.vitality > b.vitality ? 1 : a.cfg.id < b.cfg.id ? -1 : 1));
  // Plan transfers against a projected patron balance (the policy decision), then apply the
  // batch through the shared primitive (the conservation-preserving state change).
  const reqs: TransferRequest[] = [];
  let projected = patron.balance;
  for (const ally of allies) {
    const surplus = projected - reserve;
    if (surplus <= 0n) break;
    const target = dailyCost(ally, cfg) * 7n;
    const need = target > ally.balance ? target - ally.balance : 0n;
    if (need <= 0n) continue;
    const amount = need < surplus ? need : surplus;
    reqs.push({ fromId: patron.cfg.id, toId: ally.cfg.id, amount, memo: "patronage" });
    projected -= amount;
  }
  const r = applyTransfers(world, reqs);
  return { world: r.next, rescues: r.applied };
}

function record(
  world: WorldEconState,
  perChar: Record<string, { salary: bigint; dailyCost: bigint; insolvent: boolean }>,
  cfg: EconConfig,
  births: number,
  deaths: number,
  rescues: number,
  subsidy: bigint,
): DayRecord {
  const snap: DayRecord["perChar"] = {};
  let totalBalance = 0n;
  let aliveCount = 0;
  for (const c of world.chars) {
    const led = perChar[c.cfg.id];
    const salary = led?.salary ?? 0n;
    const dc = led?.dailyCost ?? dailyCost(c, cfg);
    if (!c.dead) {
      aliveCount += 1;
      totalBalance += c.balance;
    }
    snap[c.cfg.id] = {
      balance: c.balance,
      vitality: c.vitality,
      memory: c.memoryCount,
      subscribers: c.subscribers,
      heldSlot: c.heldSlot,
      salary,
      dailyCost: dc,
      insolvent: led?.insolvent ?? false,
      dead: c.dead,
      level: c.dead ? "dead" : survivalLevel(salary, c, cfg),
      stage: c.dead ? "dead" : lifeStage(salary, c, cfg),
    };
  }
  return { day: world.day, aliveCount, births, deaths, rescues, subsidy, totalBalance, perChar: snap };
}

/** Run a scenario to completion and return the full trace. Deterministic. */
export function runScenario(scenario: Scenario): RunResult {
  let world = scenario.makeWorld();
  const cfg = scenario.cfg;
  const rand = lcg(scenario.seed);
  const trace: DayRecord[] = [];
  const deaths: DeathLog[] = [];
  let everSpawned = world.chars.length;
  let bornCount = 0n;
  let totalRescues = 0;
  let ownerSubsidyTotal = 0n;
  let conservedEveryDay = conserves(world);

  for (let t = 0; t < scenario.horizon; t++) {
    const day = world.day;
    let birthsToday = 0;

    // A. births (before settle so newborns live the day)
    const b = scenario.policy.births;
    if (b && day > 0n && day % b.everyDays === 0n && bornCount < b.max) {
      world.chars.push(newChar(b.make(day, bornCount), scenario.seedFunds));
      world.accounts.injected += scenario.seedFunds; // external grant → conservation preserved
      bornCount += 1n;
      everSpawned += 1;
      birthsToday += 1;
    }

    // B. subscriber dynamics
    if (scenario.policy.subscriberStep) {
      for (const c of world.chars) {
        c.subscribers = c.dead ? 0n : scenario.policy.subscriberStep(c, day, rand);
      }
    }

    // C. contested slot
    if (scenario.policy.slotCapacity1) assignSlot(world);

    // C2. owner subsidy — external top-up the human owner injects into a beloved
    // (possibly reader-less) character. Counts as external injection → conservation preserved.
    let subsidyToday = 0n;
    if (scenario.policy.ownerSubsidy) {
      for (const c of world.chars) {
        if (c.dead) continue;
        const amt = scenario.policy.ownerSubsidy(c, cfg);
        if (amt > 0n) {
          c.balance += amt;
          world.accounts.injected += amt;
          subsidyToday += amt;
          ownerSubsidyTotal += amt;
        }
      }
    }

    // D. settle (pure)
    const { next, perChar } = settleDay(world, cfg);
    world = next;
    if (!conserves(world)) conservedEveryDay = false;

    // record deaths + classify cause
    let deathsToday = 0;
    for (const c of world.chars) {
      if (perChar[c.cfg.id]?.diedToday) {
        deathsToday += 1;
        const econ = c.insolventStreak > 0n;
        const age = ageHazard(c, cfg) > 0n;
        deaths.push({
          id: c.cfg.id,
          day,
          livedDays: c.livedDays,
          cause: econ && age ? "mixed" : econ ? "economic" : age ? "age" : "mixed",
        });
      }
    }

    // E. patronage (post-settle: rescue failing allies for the next day)
    let rescuesToday = 0;
    if (scenario.policy.alliances) {
      const p = runPatronage(world, cfg);
      world = p.world;
      rescuesToday = p.rescues;
      totalRescues += rescuesToday;
    }

    trace.push(record(world, perChar, cfg, birthsToday, deathsToday, rescuesToday, subsidyToday));
  }

  return { scenario, trace, finalWorld: world, deaths, everSpawned, totalRescues, ownerSubsidyTotal, conservedEveryDay };
}
