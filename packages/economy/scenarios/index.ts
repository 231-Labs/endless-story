export {
  SEED_FUNDS,
  char,
  world,
  constSub,
  slotDrivenSub,
  keepSolvent,
  thriving,
  starving,
  vendor,
  mixedCohort,
  payrollStress,
  COHORT_SCENARIOS,
} from "./cohort.ts";
export { allianceOff, allianceOn, ALLIANCE_SCENARIOS } from "./alliance.ts";

import { COHORT_SCENARIOS } from "./cohort.ts";
import { ALLIANCE_SCENARIOS } from "./alliance.ts";
export const ALL_SCENARIOS = [...COHORT_SCENARIOS, ...ALLIANCE_SCENARIOS];
