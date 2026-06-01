// One-shot report of every scenario's headline metrics, for the writeup. Run from the
// package dir: `node driver/report.ts`. Pure offline; kept as a Stage-2 eval seed.
import { runScenario, analyze, analyzeTradeoff } from "./index.ts";
import { STEP1_SCENARIOS, STEP2_SCENARIOS, fameConstants } from "../scenarios/index.ts";

const f = (v: bigint) => (Number(v) / 1e6).toFixed(3);
const p = (x: number) => (x === Infinity ? "inf" : x.toFixed(1));
const lines: string[] = [];

lines.push("# Step 1 — partnership (cross-agent contention)");
lines.push("scenario                      flat run osc  totFlips lateFlips reignP  esc  swing  lateSat");
for (const s of STEP1_SCENARIOS) {
  const a = analyze(runScenario(s));
  lines.push(
    `${s.id.padEnd(28)}  ${a.flatline ? "Y" : "."}    ${a.runaway ? "Y" : "."}   ${a.oscillation ? "Y" : "."}   ` +
      `${String(a.totalFlips).padStart(6)}   ${String(a.lateFlips).padStart(6)}   ${p(a.lateReignPeriod).padStart(5)}  ` +
      `${a.legibleEscalation ? "Y" : "."}   ${f(a.maxSwing)}  ${f(a.lateMeanSatisfaction)}`,
  );
}

lines.push("");
lines.push("# Step 2 — fame (intra-agent trade-off, metrics for 柳生春)");
lines.push("scenario           flat run osc  forcedChoice focusSwitch bothHigh maxNeglect");
for (const s of STEP2_SCENARIOS) {
  const r = runScenario(s);
  const a = analyze(r);
  const t = analyzeTradeoff(r, fameConstants.LIU);
  lines.push(
    `${s.id.padEnd(16)}   ${a.flatline ? "Y" : "."}    ${a.runaway ? "Y" : "."}   ${a.oscillation ? "Y" : "."}   ` +
      `${String(t.forcedChoiceTicks).padStart(10)}  ${String(t.focusSwitches).padStart(10)}  ` +
      `${String(t.bothHighTicks).padStart(7)}  ${String(t.maxNeglectRun).padStart(9)}`,
  );
}
process.stdout.write(lines.join("\n") + "\n");
