/**
 * DREAM LAB — the §2.51 stack, end to end, on the REAL tick loop.
 *
 * Same as lab.ts (preset → runExperiment → HTML report), plus ONE thing: before a
 * chosen tick it injects a dream into a chosen character through the PRODUCTION
 * 注夢 path (`rememberDreamAction` → observatory in-memory MemWal at importance 9
 * + `queueDreamStir` → next drama beat tightens her hottest desire once). Run it
 * with TICK_ACTOR_FATIGUE=1 to exercise the full validated dose: memory + stir +
 * spotlight rotation.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json TICK_ACTOR_FATIGUE=1 \
 *     <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/dream-lab.ts \
 *     [presetName=warm-small] [ticks=6] [dreamTick=2] [dreamer=田巧雲]
 *
 * Report → /tmp/es-lab-<preset>-dream.html (baseline lab.ts writes its own file,
 * so an A/B pair never overwrites each other).
 */

// run-experiment pulls in narrative-setup (env seam) before the tick loop — keep it first.
import { runExperiment } from './run-experiment';
import { renderReport } from './render-report';
import { presetByName, presetNames } from './presets/index';
import { harnessChain } from '../narrative-setup';
import { rememberDreamAction } from '@/lib/actions/remember-dream';
import { writeFileSync } from 'node:fs';
import { hasTextProviderKey } from '../narrative-setup';

const DREAM =
    '昨夜夢見自己還是滿頭青絲的年紀：南邊碼頭新開的戲園子差人送來一張燙金戲單，' +
    '滿紙都是你的名字，請你去掛頭牌唱開台戲。醒來手心像還攥著那張戲單，燙得慌。';

async function main(): Promise<void> {
    const name = process.argv[2] ?? 'warm-small';
    const ticks = process.argv[3] ? Number(process.argv[3]) : 6;
    const dreamTick = process.argv[4] ? Number(process.argv[4]) : 2;
    const dreamerName = process.argv[5] ?? '田巧雲';

    const preset = presetByName(name);
    if (!preset) {
        console.error(`unknown preset "${name}". known: ${presetNames().join(', ')}`);
        process.exit(2);
    }
    const config = { ...preset, ticks: Math.max(1, Math.floor(ticks)) };

    console.log(`── dream lab（§2.51 全劑量 · 真 tick loop）──────────────────`);
    console.log(`  preset : ${config.name} · ${config.ticks} ticks`);
    console.log(`  注夢    : t${dreamTick} → ${dreamerName}（生產 rememberDreamAction：記憶 imp9 + 一次攪動）`);
    console.log(`  fatigue: TICK_ACTOR_FATIGUE=${process.env.TICK_ACTOR_FATIGUE ?? '(off!)'}`);
    console.log(`  LLM    : ${hasTextProviderKey() ? 'REAL' : 'FAKE smoke'}`);
    console.log(`  夢     : 「${DREAM}」`);
    console.log(``);

    const result = await runExperiment(config, {
        onBeforeTick: async (tick) => {
            if (tick !== dreamTick) return;
            const dreamer = [...harnessChain.characters.values()].find((c) => c.name === dreamerName);
            if (!dreamer) {
                console.log(`  ☾ 注夢失敗：cast 裡沒有 ${dreamerName}（有：${[...harnessChain.characters.values()].map((c) => c.name).join('、')}）`);
                return;
            }
            const r = await rememberDreamAction(dreamer.id, DREAM);
            console.log(`  ☾ t${tick} 注夢 → ${dreamerName}（remembered=${r.remembered} · 攪動已排入下一個 drama beat）`);
        },
        onTick: (tick, total, note) => {
            console.log(`  tick ${tick}/${total}  ${note}`);
        },
    });

    const html = renderReport(result);
    const out = `/tmp/es-lab-${config.name}-dream.html`;
    writeFileSync(out, html);
    const edges = result.finalGraph.edges.length;
    console.log(``);
    console.log(`  final graph: ${result.finalGraph.nodes.length} nodes · ${edges} directed edge(s)`);
    console.log(`  report → ${out}`);
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('[dream-lab] fatal:', e);
        process.exit(1);
    });
