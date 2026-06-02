// Failure-mode detectors + life-cycle metrics over a run trace. These operationalize the
// 5 hypotheses ("does the mechanism actually work?") as numbers the tests assert against,
// not impressions:
//   H1 viable steady state   — a well-run cohort self-sustains (income ≥ cost, balance holds)
//   H2 no immortality        — zero-subscriber characters always die (memory rent wins)
//   H3 generational turnover — births + deaths cycle; alive count neither 0 nor unbounded
//   H4 alliances are causal  — patronage lowers death rate / raises lifespan vs the ablation
//   H5 no pathology          — no universal collapse, no runaway wealth inequality

import { MUNIT } from "../src/index.ts";
import type { DayRecord, RunResult } from "./types.ts";

export interface Analysis {
  everSpawned: number;
  finalAlive: number;
  totalDeaths: number;
  totalBirths: number;
  /** mean narrative days lived by the dead (0 if none died). */
  meanLifespan: number;
  /** mean balance (ENDLESS) of alive characters on the final day. */
  finalMeanBalanceEndless: number;
  /** mean balance (ENDLESS) of alive characters averaged over the late window. */
  lateMeanBalanceEndless: number;
  /** fraction of alive char-days in the late window at level healthy|stable. */
  lateHealthyFraction: number;
  /** fraction of all alive char-days that were insolvent. */
  bankruptcyRate: number;
  /** mean alive population over the late window (turnover regime, not just final snapshot). */
  avgAliveLate: number;
  /** min alive population over the late window (0 ⇒ momentary extinction). */
  minAliveLate: number;
  /** Gini of alive balances on the final day (0 = equal, 1 = one holder). */
  giniFinal: number;
  totalRescues: number;
  /** total owner subsidy (挹注) over the run, ENDLESS. */
  ownerSubsidyEndless: number;
  /** mean owner subsidy per alive char-day, ENDLESS — the cost to keep a beloved character. */
  ownerBurnPerCharDayEndless: number;
  conservedEveryDay: boolean;
  // derived booleans
  immortal: boolean; // any character alive at horizon
  universalCollapse: boolean; // everyone dead at horizon
  turnover: boolean; // deaths>0 && births>0 && 0 < finalAlive < everSpawned
}

const LATE = 0.4;

function lateStart(n: number): number {
  return Math.max(0, Math.floor(n * (1 - LATE)));
}

/** Gini coefficient of non-negative values. 0 when empty/all-equal. */
export function gini(values: bigint[]): number {
  const xs = values.filter((v) => v >= 0n).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const n = xs.length;
  if (n === 0) return 0;
  let sum = 0n;
  for (const v of xs) sum += v;
  if (sum === 0n) return 0;
  // Gini = (2·Σ i·x_i)/(n·Σx) − (n+1)/n, with i 1-based.
  let weighted = 0n;
  for (let i = 0; i < n; i++) weighted += BigInt(i + 1) * xs[i];
  const g = (2 * Number(weighted)) / (n * Number(sum)) - (n + 1) / n;
  return Math.max(0, Math.min(1, g));
}

export function analyze(run: RunResult): Analysis {
  const trace = run.trace;
  const n = trace.length;
  const last = trace[n - 1];
  const ls = lateStart(n);

  // lifespans
  const totalDeaths = run.deaths.length;
  const meanLifespan = totalDeaths === 0 ? 0 : run.deaths.reduce((a, d) => a + Number(d.livedDays), 0) / totalDeaths;
  const totalBirths = trace.reduce((a, r) => a + r.births, 0);

  // final-day alive balances
  const finalAliveBalances: bigint[] = [];
  for (const id of Object.keys(last.perChar)) {
    const s = last.perChar[id];
    if (!s.dead) finalAliveBalances.push(s.balance);
  }
  const finalAlive = finalAliveBalances.length;
  const meanEndless = (vals: bigint[]): number => {
    if (vals.length === 0) return 0;
    let sum = 0n;
    for (const v of vals) sum += v;
    return Number(sum) / vals.length / Number(MUNIT);
  };
  const finalMeanBalanceEndless = meanEndless(finalAliveBalances);

  // late-window aggregates
  let lateBalanceSum = 0;
  let lateBalanceDays = 0;
  let healthyAliveDays = 0;
  let aliveDays = 0;
  let insolventDays = 0;
  for (let i = ls; i < n; i++) {
    const r = trace[i];
    for (const id of Object.keys(r.perChar)) {
      const s = r.perChar[id];
      if (s.dead) continue;
      aliveDays += 1;
      lateBalanceSum += Number(s.balance) / Number(MUNIT);
      lateBalanceDays += 1;
      if (s.level === "healthy" || s.level === "stable") healthyAliveDays += 1;
      if (s.insolvent) insolventDays += 1;
    }
  }
  const lateMeanBalanceEndless = lateBalanceDays === 0 ? 0 : lateBalanceSum / lateBalanceDays;
  const lateHealthyFraction = aliveDays === 0 ? 0 : healthyAliveDays / aliveDays;

  // bankruptcy rate over the WHOLE run
  let allAliveDays = 0;
  let allInsolventDays = 0;
  for (const r of trace) {
    for (const id of Object.keys(r.perChar)) {
      const s = r.perChar[id];
      if (s.dead) continue;
      allAliveDays += 1;
      if (s.insolvent) allInsolventDays += 1;
    }
  }
  const bankruptcyRate = allAliveDays === 0 ? 0 : allInsolventDays / allAliveDays;

  const giniFinal = gini(finalAliveBalances);

  const ownerSubsidyEndless = Number(run.ownerSubsidyTotal) / Number(MUNIT);
  const ownerBurnPerCharDayEndless = allAliveDays === 0 ? 0 : ownerSubsidyEndless / allAliveDays;

  // late-window population band (characterizes the turnover regime)
  let aliveSum = 0;
  let aliveDayCount = 0;
  let minAliveLate = Number.POSITIVE_INFINITY;
  for (let i = ls; i < n; i++) {
    aliveSum += trace[i].aliveCount;
    aliveDayCount += 1;
    if (trace[i].aliveCount < minAliveLate) minAliveLate = trace[i].aliveCount;
  }
  const avgAliveLate = aliveDayCount === 0 ? 0 : aliveSum / aliveDayCount;
  if (!Number.isFinite(minAliveLate)) minAliveLate = 0;

  return {
    everSpawned: run.everSpawned,
    finalAlive,
    totalDeaths,
    totalBirths,
    meanLifespan,
    finalMeanBalanceEndless,
    lateMeanBalanceEndless,
    lateHealthyFraction,
    bankruptcyRate,
    avgAliveLate,
    minAliveLate,
    giniFinal,
    totalRescues: run.totalRescues,
    ownerSubsidyEndless,
    ownerBurnPerCharDayEndless,
    conservedEveryDay: run.conservedEveryDay,
    immortal: finalAlive > 0,
    universalCollapse: finalAlive === 0,
    turnover: totalDeaths > 0 && totalBirths > 0 && finalAlive > 0 && finalAlive < run.everSpawned,
  };
}
