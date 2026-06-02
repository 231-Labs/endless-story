// H4 ablation: the ONLY difference between allianceOn and allianceOff is policy.alliances.
// Same cast, same seed, same everything else — so any death-rate / lifespan gap is CAUSED by
// patronage (角色間 Endless 流通). A rich patron (many subscribers) tops up failing allies.

import { DEFAULT_ECON, type CharConfig } from "../src/index.ts";
import type { Scenario } from "../driver/types.ts";
import { char, SEED_FUNDS, world } from "./cohort.ts";

const CAST: CharConfig[] = [
  char("patron", "花旦", 80, 90, 80, 26, 6), // becomes rich → can sponsor others
  char("窮甲", "文人", 55, 52, 58, 30, 0),
  char("窮乙", "樂師", 56, 50, 55, 32, -1),
  char("窮丙", "老生", 58, 54, 56, 34, -2),
];

/** Patron pulls a big crowd; the three poor allies barely scrape a couple of readers. */
function allianceSub(c: { cfg: CharConfig }): bigint {
  return c.cfg.id === "patron" ? 40n : 2n;
}

const base = {
  cfg: DEFAULT_ECON,
  horizon: 150,
  seedFunds: SEED_FUNDS,
  seed: 7,
} as const;

export const allianceOff: Scenario = {
  ...base,
  id: "alliance-off",
  description: "無角色間轉帳：窮夥伴記憶租金壓垮、早夭。對照組。",
  makeWorld: world(CAST),
  policy: { subscriberStep: allianceSub, alliances: false },
};

export const allianceOn: Scenario = {
  ...base,
  id: "alliance-on",
  description: "開啟 patronage：富恩主續命窮夥伴 → 死亡更少/壽命更長。實驗組。",
  makeWorld: world(CAST),
  policy: { subscriberStep: allianceSub, alliances: true },
};

export const ALLIANCE_SCENARIOS: Scenario[] = [allianceOff, allianceOn];
