// One-shot academic report: run every scenario, print headline metrics, then a PASS/FAIL
// verdict on the 5 hypotheses + conservation. Run from anywhere:
//   node packages/economy/driver/report.ts
// Pure offline; this is the "does the mechanism actually work?" gate (Part C of the plan).

import { analyze, runScenario, type Analysis } from "./index.ts";
import { ALL_SCENARIOS, thriving, starving, vendor, mixedCohort, allianceOn, allianceOff } from "../scenarios/index.ts";

const n2 = (x: number) => x.toFixed(2);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const cell = (s: string, w: number) => s.padStart(w);

const runs = new Map<string, Analysis>();
for (const s of ALL_SCENARIOS) runs.set(s.id, analyze(runScenario(s)));

const lines: string[] = [];
lines.push("# Character-economy validation report\n");
lines.push("scenario          ever alive avgAlv deaths births meanLife lateBalE lateHlth bankrupt  gini rescue cons");
for (const s of ALL_SCENARIOS) {
  const a = runs.get(s.id)!;
  lines.push(
    `${s.id.padEnd(16)} ${cell(String(a.everSpawned), 4)} ${cell(String(a.finalAlive), 5)} ${cell(n2(a.avgAliveLate), 6)} ` +
      `${cell(String(a.totalDeaths), 6)} ${cell(String(a.totalBirths), 6)} ${cell(n2(a.meanLifespan), 8)} ${cell(n2(a.lateMeanBalanceEndless), 8)} ` +
      `${cell(pct(a.lateHealthyFraction), 8)} ${cell(pct(a.bankruptcyRate), 8)} ${cell(n2(a.giniFinal), 5)} ` +
      `${cell(String(a.totalRescues), 6)} ${cell(a.conservedEveryDay ? "Y" : "N", 4)}`,
  );
}

// mixed-cohort alive-population trajectory (sampled) — is turnover sustained or slow die-off?
{
  const r = runScenario(mixedCohort);
  const step = Math.max(1, Math.floor(r.trace.length / 40));
  const spark = r.trace.filter((_, i) => i % step === 0).map((d) => d.aliveCount).join(",");
  lines.push(`\nmixed-cohort aliveCount (every ${step}d): ${spark}`);
}

// Longevity probe: a FIXED-subscriber troupe is healthy for a long golden era but NOT immortal —
// append-only memory rent eventually overtakes a static income. Only growing readership sustains.
{
  lines.push("\nlongevity probe — thriving troupe at fixed 16 subscribers, varying horizon:");
  for (const H of [120, 200, 300, 400]) {
    const a = analyze(runScenario({ ...thriving, horizon: H }));
    lines.push(`  horizon ${String(H).padStart(3)}d: alive=${a.finalAlive} deaths=${a.totalDeaths} meanLife=${n2(a.meanLifespan)} lateHealthy=${pct(a.lateHealthyFraction)}`);
  }
  lines.push("  → memory rent makes even a well-run static cohort mortal (golden era, then decline).");
}

// ── hypothesis verdicts ──
const T = runs.get(thriving.id)!;
const S = runs.get(starving.id)!;
const M = runs.get(mixedCohort.id)!;
const ON = runs.get(allianceOn.id)!;
const OFF = runs.get(allianceOff.id)!;
const V = runs.get(vendor.id)!;

const checks: { id: string; pass: boolean; detail: string }[] = [
  {
    id: "H1 viable steady state (thriving)",
    pass: T.finalAlive > 0 && T.lateHealthyFraction >= 0.6 && T.finalMeanBalanceEndless > 56,
    detail: `alive=${T.finalAlive} lateHealthy=${pct(T.lateHealthyFraction)} finalBal=${n2(T.finalMeanBalanceEndless)}E (seed 56)`,
  },
  {
    id: "H2 no immortality (starving)",
    pass: S.universalCollapse,
    detail: `finalAlive=${S.finalAlive} meanLifespan=${n2(S.meanLifespan)}d`,
  },
  {
    id: "H3 generational turnover (mixed)",
    pass: M.turnover,
    detail: `deaths=${M.totalDeaths} births=${M.totalBirths} ever=${M.everSpawned} alive=${M.finalAlive}`,
  },
  {
    id: "H4 alliances are causal (on vs off)",
    pass: ON.totalRescues > 0 && (ON.totalDeaths < OFF.totalDeaths || ON.meanLifespan > OFF.meanLifespan),
    detail: `rescues=${ON.totalRescues} deaths on=${ON.totalDeaths} off=${OFF.totalDeaths} | lifespan on=${n2(ON.meanLifespan)} off=${n2(OFF.meanLifespan)}`,
  },
  {
    id: "H5 no pathology (mixed)",
    pass: !M.universalCollapse && M.giniFinal < 0.9,
    detail: `collapse=${M.universalCollapse} gini=${n2(M.giniFinal)}`,
  },
  {
    id: "H6 owner subsidy sustains reader-less char (vendor)",
    pass: V.finalAlive > 0 && V.totalDeaths === 0 && V.ownerBurnPerCharDayEndless > 0 && V.ownerBurnPerCharDayEndless < 12,
    detail: `alive=${V.finalAlive} deaths=${V.totalDeaths} ownerBurn=${n2(V.ownerBurnPerCharDayEndless)}E/char-day total=${V.ownerSubsidyEndless.toFixed(0)}E`,
  },
  {
    id: "INV conservation (all scenarios)",
    pass: ALL_SCENARIOS.every((s) => runs.get(s.id)!.conservedEveryDay),
    detail: ALL_SCENARIOS.map((s) => `${s.id}:${runs.get(s.id)!.conservedEveryDay ? "Y" : "N"}`).join(" "),
  },
];

lines.push("\n## Hypotheses");
let allPass = true;
for (const c of checks) {
  if (!c.pass) allPass = false;
  lines.push(`[${c.pass ? "PASS" : "FAIL"}] ${c.id}\n        ${c.detail}`);
}
lines.push(`\n${allPass ? "ALL PASS — mechanism validated (gate open for Part D)" : "SOME FAIL — tune constants / scenarios and re-run"}`);

process.stdout.write(lines.join("\n") + "\n");
