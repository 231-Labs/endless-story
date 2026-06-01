import { STEP1_SCENARIOS } from "./partnership.ts";
import { STEP2_SCENARIOS } from "./fame.ts";

export {
  contested,
  uneven,
  naive,
  STEP1_SCENARIOS,
  constants as partnershipConstants,
} from "./partnership.ts";

export { scarce, abundant, STEP2_SCENARIOS, fameConstants } from "./fame.ts";

export const ALL_SCENARIOS = [...STEP1_SCENARIOS, ...STEP2_SCENARIOS];
