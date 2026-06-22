/**
 * PRESET — 搭戲土壤 (partnership soil).
 *
 * Same cast, same evolve step — but the stake is PARTNERSHIP (`partnership:<target>`):
 * the framing reads as「誰與誰搭戲的盤算，在這一場裡較上了勁」, so the POVs are about
 * FIGHTING FOR A SPOT beside the target rather than yearning toward them. Under a real
 * LLM this soil grows 競爭(rivalry)/緊張(tension) BETWEEN the contenders — the same
 * machinery, a different relationship network, purely because the dramatic soil changed.
 *
 * Run both presets and open the two HTML reports side by side: 傾心 → 戀慕 pointing at
 * the target; 搭戲 → 競爭 between the rivals. That contrast is the whole point of the lab.
 */
import type { ExperimentConfig } from '../types';

export const partnershipRivalry: ExperimentConfig = {
    name: 'partnership-rivalry',
    description: '搭戲土壤：眾人爭著與同一人搭戲，看有向關係長出競爭/緊張（同機制、不同土壤）。',
    ticks: 6,
    cast: { count: 6 },
    stake: {
        kind: 'partnership',
        // cast[0] is the sought-after stage partner everyone angles to pair with.
        targetIndex: 0,
        capacity: 1,
    },
    settle: 'relationship-evolve',
};

export default partnershipRivalry;
