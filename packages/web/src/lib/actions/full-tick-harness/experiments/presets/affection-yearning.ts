/**
 * PRESET — 傾心土壤 (affection soil).
 *
 * The cast is the shared 春雪戲班 troupe (`troupe-spring-snow.ts`), seeded around an
 * AFFECTION stake (`affection:<target>`, capacity 1): the incident framing puts several
 * gazes on one person (文蘅, the 當家花旦 at cast[0]), feelings kept under the surface.
 * With `settle: 'relationship-evolve'`, each tick's POVs are read back into directed tone
 * edges. Under a real LLM this soil grows 戀慕(romance)/吃醋(rivalry toward fellow admirers)
 * /緊張(tension) pointing AT the target, the asymmetric one-sided yearning that a
 * winner-takes-all contest cannot express.
 *
 * Because the people now have 行當 + 小傳 (孟昭 the 小生 already half-smitten, 姚青 the 青衣
 * carrying an old unspoken thing for him…), the POV anchors on a real persona instead of
 * improvising one each run. Contrast with `partnership-rivalry.ts` (same people, 搭戲土壤
 * → 競爭).
 */
import type { ExperimentConfig } from '../types';
import { SPRING_SNOW_CAST, SPRING_SNOW_STORY } from './troupe-spring-snow';

export const affectionYearning: ExperimentConfig = {
    name: 'affection-yearning',
    description: '傾心土壤：春雪戲班眾人暗自傾心同一人（當家花旦文蘅），看有向關係長出戀慕/吃醋/緊張（非搶贏一個名額）。',
    ticks: 6,
    cast: { count: SPRING_SNOW_CAST.length },
    story: {
        saga: SPRING_SNOW_STORY.saga,
        scenes: [...SPRING_SNOW_STORY.scenes],
        cast: SPRING_SNOW_CAST,
    },
    stake: {
        kind: 'affection',
        // cast[0] (文蘅, 當家花旦) is the focus everyone's gaze is drawn toward.
        targetIndex: 0,
        capacity: 1,
    },
    settle: 'relationship-evolve',
};

export default affectionYearning;
