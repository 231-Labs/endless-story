/**
 * PRESET — 傾心土壤 (affection soil).
 *
 * The cast is seeded around an AFFECTION stake (`affection:<target>`, capacity 1): the
 * incident framing puts several gazes on one person, feelings kept under the surface.
 * With `settle: 'relationship-evolve'`, each tick's POVs are read back into directed
 * tone edges — under a real LLM this soil grows 戀慕(romance)/吃醋(rivalry toward
 * fellow admirers)/緊張(tension) pointing AT the target, the asymmetric one-sided
 * yearning that a winner-takes-all contest cannot express.
 *
 * Contrast with `partnership-rivalry.ts` (搭戲土壤 → 競爭).
 */
import type { ExperimentConfig } from '../types';

export const affectionYearning: ExperimentConfig = {
    name: 'affection-yearning',
    description: '傾心土壤：眾人暗自傾心同一人，看有向關係長出戀慕/吃醋/緊張（非搶贏一個名額）。',
    ticks: 6,
    cast: { count: 6 },
    stake: {
        kind: 'affection',
        // cast[0] (文) is the focus everyone's gaze is drawn toward.
        targetIndex: 0,
        capacity: 1,
    },
    settle: 'relationship-evolve',
};

export default affectionYearning;
