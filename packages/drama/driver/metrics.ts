// Failure-mode detectors + drama metrics over a run trace. These operationalize spec §8
// ("eval criteria, not vibes") so the tests assert against numbers, not impressions.
//
//   flatline    — contention never produced a meaningful tension swing.
//   runaway     — everyone collapses into a low-satisfaction despair attractor.
//   oscillation — the contested holder keeps flipping in the late window (un-damped cycle).
//
// Plus legibility metrics: holder flips, and whether at least one flip was a *legible
// escalation* (the new holder had spiked to near-max tension just before seizing).

import { SCALE } from "../src/index.ts";
import type { RunResult, TickRecord } from "./types.ts";

const ZERO = 0n;

export interface Thresholds {
  /** below this peak-to-trough tension swing (max over contested desires) → flatline. */
  flatlineSwing: bigint;
  /** late-window mean satisfaction (all desires) below this → runaway/despair. */
  runawayFloor: bigint;
  /**
   * Oscillation is PATHOLOGICAL high-frequency thrash, NOT slow legible trading. We flag it
   * by FREQUENCY: if the contested resource changes hands so fast that the mean reign lasts
   * fewer than `minReignPeriod` ticks (and it flips ≥ minFlipsForOsc times), the holder is
   * thrashing. A symmetric rivalry that trades the role every ~9 beats is legible drama and
   * must NOT trip this — the spec's failure mode is the degenerate argmax flip (period ≈ 1),
   * which the naive ablation reproduces. Period-based so it self-scales with horizon.
   */
  minReignPeriod: number;
  /** need at least this many late flips before "frequency" is even meaningful. */
  minFlipsForOsc: number;
  /** a flip counts as "legible escalation" if the seizer's tension was ≥ this just before. */
  escalationTension: bigint;
  /** fraction of the run treated as the "late window" for settling metrics. */
  lateWindow: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  flatlineSwing: 150_000n, // ≥0.15 swing somewhere = real drama happened
  runawayFloor: 80_000n, // mean sat < 0.08 across everyone = despair
  minReignPeriod: 4, // reign shorter than 4 ticks = thrash; ≥4 = legible rivalry
  minFlipsForOsc: 3, // a couple of late flips isn't a limit cycle
  escalationTension: 700_000n, // seizer was ≥0.70 tense before grabbing = a spike
  lateWindow: 0.4,
};

function lateStart(n: number, frac: number): number {
  return Math.max(1, Math.floor(n * (1 - frac)));
}

/** Max peak-to-trough tension swing across the chosen (agent,desire) series. */
function maxTensionSwing(trace: TickRecord[], series: { agent: string; desire: string }[]): bigint {
  let best = ZERO;
  for (const s of series) {
    let lo: bigint | undefined;
    let hi: bigint | undefined;
    for (const rec of trace) {
      const v = rec.tension[s.agent]?.[s.desire];
      if (v === undefined) continue;
      if (lo === undefined || v < lo) lo = v;
      if (hi === undefined || v > hi) hi = v;
    }
    if (lo !== undefined && hi !== undefined && hi - lo > best) best = hi - lo;
  }
  return best;
}

/** Count holder changes of `rid` over a tick range (ignoring null↔same transitions). */
function countFlips(trace: TickRecord[], rid: string, from: number, to: number): number {
  let flips = 0;
  let prev = trace[from]?.topHolder[rid] ?? null;
  for (let i = from + 1; i < to; i++) {
    const cur = trace[i].topHolder[rid] ?? null;
    if (cur !== null && cur !== prev) flips++;
    if (cur !== null) prev = cur;
  }
  return flips;
}

/** Mean satisfaction across every (agent,desire) over a tick range. */
function meanSatisfaction(trace: TickRecord[], from: number, to: number): bigint {
  let sum = ZERO;
  let count = ZERO;
  for (let i = from; i < to; i++) {
    const rec = trace[i];
    for (const agent of Object.keys(rec.satisfaction)) {
      for (const d of Object.keys(rec.satisfaction[agent])) {
        sum += rec.satisfaction[agent][d];
        count += 1n;
      }
    }
  }
  return count === ZERO ? ZERO : sum / count;
}

export interface Analysis {
  flatline: boolean;
  runaway: boolean;
  oscillation: boolean;
  /** total holder flips across all contested resources, whole run. */
  totalFlips: number;
  /** flips in the late window (oscillation basis). */
  lateFlips: number;
  /** mean ticks between holder changes in the late window (∞ if it settled). */
  lateReignPeriod: number;
  /** at least one legible escalation (a spike-then-seize) occurred. */
  legibleEscalation: boolean;
  maxSwing: bigint;
  lateMeanSatisfaction: bigint;
}

/** All series (agent,desire) drawing from any contested resource. */
function contestedSeries(result: RunResult): { agent: string; desire: string }[] {
  const contested = new Set(result.scenario.contestedResources);
  const out: { agent: string; desire: string }[] = [];
  for (const agent of result.finalWorld.agents) {
    for (const d of agent.desires) {
      if (d.draws_from.some((c) => contested.has(c.resource_id))) {
        out.push({ agent: agent.id, desire: d.id });
      }
    }
  }
  return out;
}

/**
 * A flip is a *legible escalation* if, on the tick the holder changed to X, X's tension on
 * the tick BEFORE was ≥ escalationTension — i.e. X was maximally frustrated and that
 * frustration drove the seize (loser's tension spike → counter-action, brief Step 1).
 */
function hasLegibleEscalation(result: RunResult, th: Thresholds): boolean {
  const { trace } = result;
  for (const rid of result.scenario.contestedResources) {
    for (let i = 1; i < trace.length; i++) {
      const prevHolder = trace[i - 1].topHolder[rid] ?? null;
      const curHolder = trace[i].topHolder[rid] ?? null;
      if (curHolder === null || curHolder === prevHolder) continue;
      // tension of the new holder on the previous tick, on its desire(s) drawing from rid
      const before = trace[i - 1].tension[curHolder] ?? {};
      let peak = ZERO;
      for (const dId of Object.keys(before)) {
        const v = before[dId];
        if (v > peak) peak = v;
      }
      if (peak >= th.escalationTension) return true;
    }
  }
  return false;
}

export function analyze(result: RunResult, th: Thresholds = DEFAULT_THRESHOLDS): Analysis {
  const { trace } = result;
  const n = trace.length;
  const from = lateStart(n, th.lateWindow);

  const series = contestedSeries(result);
  const maxSwing = maxTensionSwing(trace, series);

  let totalFlips = 0;
  let lateFlips = 0;
  for (const rid of result.scenario.contestedResources) {
    totalFlips += countFlips(trace, rid, 0, n);
    lateFlips += countFlips(trace, rid, from, n);
  }

  const lateMean = meanSatisfaction(trace, from, n);

  const lateWindowTicks = n - from;
  const lateReignPeriod = lateFlips > 0 ? lateWindowTicks / lateFlips : Infinity;
  // pathological only if it flips OFTEN *and* fast (short reign)
  const oscillation = lateFlips >= th.minFlipsForOsc && lateReignPeriod < th.minReignPeriod;

  return {
    flatline: maxSwing < th.flatlineSwing,
    runaway: lateMean < th.runawayFloor,
    oscillation,
    totalFlips,
    lateFlips,
    lateReignPeriod,
    legibleEscalation: hasLegibleEscalation(result, th),
    maxSwing,
    lateMeanSatisfaction: lateMean,
  };
}

// ---------------------------------------------------------------------------------------
// Intra-agent trade-off analysis (Step 2 — the 柳生春 moment)
// ---------------------------------------------------------------------------------------
export interface TradeoffAnalysis {
  /**
   * Ticks where the agent WANTED ≥2 goals (tension ≥ actThreshold) but its finite budget
   * funded FEWER than it wanted → it was forced to neglect a goal. This is the trade-off
   * itself, measured directly. Scarce budget → high; abundant budget → ~0 (the proof it is
   * budget-derived, not scripted).
   */
  forcedChoiceTicks: number;
  /** how many times the agent's committed focus desire changed (it is torn, alternating). */
  focusSwitches: number;
  /** late-window mean ticks the agent stays on one focus (∞ if it never switches late). */
  lateFocusReignPeriod: number;
  /** ticks where ALL the agent's desires were simultaneously well-satisfied (≥ highThreshold). */
  bothHighTicks: number;
  /** longest run of consecutive ticks the agent left ≥1 wanted desire unfunded (neglect). */
  maxNeglectRun: number;
}

export interface TradeoffThresholds {
  /** satisfaction at/above which a desire counts as "well satisfied". */
  highThreshold: bigint;
  lateWindow: number;
}

export const DEFAULT_TRADEOFF_THRESHOLDS: TradeoffThresholds = {
  highThreshold: 600_000n,
  lateWindow: 0.4,
};

function focusSeries(result: RunResult, agentId: string): string[] {
  // skip tick 0 (no focus yet)
  return result.trace.slice(1).map((rec) => rec.focus[agentId] ?? "");
}

export function analyzeTradeoff(
  result: RunResult,
  agentId: string,
  th: TradeoffThresholds = DEFAULT_TRADEOFF_THRESHOLDS,
): TradeoffAnalysis {
  const trace = result.trace;
  const agent = result.finalWorld.agents.find((a) => a.id === agentId);
  const desireIds = agent ? agent.desires.map((d) => d.id) : [];

  let forcedChoiceTicks = 0;
  for (const rec of trace) {
    const want = rec.wanting[agentId] ?? 0;
    const fund = rec.funded[agentId] ?? 0;
    if (want >= 2 && fund < want) forcedChoiceTicks++;
  }

  const focus = focusSeries(result, agentId);
  let focusSwitches = 0;
  for (let i = 1; i < focus.length; i++) {
    if (focus[i] && focus[i - 1] && focus[i] !== focus[i - 1]) focusSwitches++;
  }

  // late-window focus reign period
  const n = focus.length;
  const from = Math.max(0, Math.floor(n * (1 - th.lateWindow)));
  let lateSwitches = 0;
  for (let i = from + 1; i < n; i++) {
    if (focus[i] && focus[i - 1] && focus[i] !== focus[i - 1]) lateSwitches++;
  }
  const lateFocusReignPeriod = lateSwitches > 0 ? (n - from) / lateSwitches : Infinity;

  // both-high: every desire of the agent satisfied ≥ highThreshold on the same tick
  let bothHighTicks = 0;
  for (const rec of trace) {
    const sats = desireIds.map((id) => rec.satisfaction[agentId]?.[id] ?? 0n);
    if (sats.length >= 2 && sats.every((s) => s >= th.highThreshold)) bothHighTicks++;
  }

  // longest neglect run: consecutive ticks where the agent left ≥1 wanted desire unfunded.
  let maxNeglectRun = 0;
  let cur = 0;
  for (const rec of trace) {
    const want = rec.wanting[agentId] ?? 0;
    const fund = rec.funded[agentId] ?? 0;
    if (want >= 1 && fund < want) {
      cur++;
      if (cur > maxNeglectRun) maxNeglectRun = cur;
    } else {
      cur = 0;
    }
  }

  return { forcedChoiceTicks, focusSwitches, lateFocusReignPeriod, bothHighTicks, maxNeglectRun };
}

/** Compact one-line-per-tick ASCII trace of a contested resource holder + tensions. */
export function renderTrace(result: RunResult, resourceId: string): string {
  const lines: string[] = [];
  const agents = result.finalWorld.agents.map((a) => a.id);
  lines.push(`tick | holder(${resourceId}) | ${agents.map((a) => `${a}.tns/sat`).join("  ")}`);
  for (const rec of result.trace) {
    const holder = rec.topHolder[resourceId] ?? "—";
    const cells = agents.map((a) => {
      const tns = Object.values(rec.tension[a] ?? {});
      const sat = Object.values(rec.satisfaction[a] ?? {});
      const t = tns.length ? Number(tns.reduce((s, v) => (v > s ? v : s), 0n)) / 1e6 : 0;
      const s = sat.length ? Number(sat.reduce((x, v) => x + v, 0n)) / sat.length / 1e6 : 0;
      return `${t.toFixed(2)}/${s.toFixed(2)}`;
    });
    lines.push(`${String(rec.tick).padStart(4)} | ${holder.padEnd(12)} | ${cells.join("  ")}`);
  }
  return lines.join("\n");
}
