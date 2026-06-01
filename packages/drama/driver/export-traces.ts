// Dump real traces from the engine to JSON for plotting. Run from the package dir:
//   node driver/export-traces.ts > /tmp/drama_traces.json
import { runScenario } from "./index.ts";
import { contested, uneven, naive } from "../scenarios/partnership.ts";
import { scarce, abundant, fameConstants } from "../scenarios/fame.ts";

const LIU = fameConstants.LIU;
const BAI = fameConstants.BAI;
const PART = fameConstants.PARTNERSHIP;
const SPOT = fameConstants.SPOTLIGHT;
const SLOT = "partnership:孟雲屏";
const n = (v: bigint | undefined) => (v === undefined ? null : Number(v) / 1e6);

function dumpPartnership(s: typeof contested) {
  const r = runScenario(s);
  return {
    id: s.id,
    ticks: r.trace.map((t) => Number(t.tick)),
    liu_tns: r.trace.map((t) => n(t.tension[LIU]?.partner)),
    liu_sat: r.trace.map((t) => n(t.satisfaction[LIU]?.partner)),
    bai_tns: r.trace.map((t) => n(t.tension[BAI]?.partner)),
    bai_sat: r.trace.map((t) => n(t.satisfaction[BAI]?.partner)),
    holder: r.trace.map((t) => (t.topHolder[SLOT] === LIU ? "柳" : t.topHolder[SLOT] === BAI ? "白" : "—")),
  };
}

function dumpFame(s: typeof scarce) {
  const r = runScenario(s);
  return {
    id: s.id,
    ticks: r.trace.map((t) => Number(t.tick)),
    partner_sat: r.trace.map((t) => n(t.satisfaction[LIU]?.partner)),
    fame_sat: r.trace.map((t) => n(t.satisfaction[LIU]?.fame)),
    partner_tns: r.trace.map((t) => n(t.tension[LIU]?.partner)),
    fame_tns: r.trace.map((t) => n(t.tension[LIU]?.fame)),
    budget: r.trace.map((t) => Number(t.schedule[LIU] ?? 0n)),
    wanting: r.trace.map((t) => t.wanting[LIU] ?? 0),
    funded: r.trace.map((t) => t.funded[LIU] ?? 0),
    part_hold: r.trace.map((t) => (t.topHolder[PART] === LIU ? 1 : 0)),
    spot_hold: r.trace.map((t) => (t.topHolder[SPOT] === LIU ? 1 : 0)),
  };
}

const out = {
  contested: dumpPartnership(contested),
  uneven: dumpPartnership(uneven),
  naive: dumpPartnership(naive),
  scarce: dumpFame(scarce),
  abundant: dumpFame(abundant),
};
process.stdout.write(JSON.stringify(out));
