// Tiny CLI to eyeball a scenario's trace + analysis. Usage:
//   node driver/cli.ts <scenarioId>
// Pure offline; for calibration/debugging only (not part of the engine).

import { runScenario, analyze, renderTrace } from "./index.ts";
import { ALL_SCENARIOS } from "../scenarios/index.ts";

const all = ALL_SCENARIOS;
const id = process.argv[2] ?? all[0].id;
const scenario = all.find((s) => s.id === id);
if (!scenario) {
  console.error(`unknown scenario "${id}". known: ${all.map((s) => s.id).join(", ")}`);
  process.exit(1);
}

const result = runScenario(scenario);
console.log(`\n=== ${scenario.id} ===\n${scenario.description}\n`);
for (const rid of scenario.contestedResources) {
  console.log(renderTrace(result, rid));
  console.log("");
}
const a = analyze(result);
console.log("analysis:", {
  flatline: a.flatline,
  runaway: a.runaway,
  oscillation: a.oscillation,
  totalFlips: a.totalFlips,
  lateFlips: a.lateFlips,
  legibleEscalation: a.legibleEscalation,
  maxSwing: Number(a.maxSwing) / 1e6,
  lateMeanSatisfaction: Number(a.lateMeanSatisfaction) / 1e6,
});
