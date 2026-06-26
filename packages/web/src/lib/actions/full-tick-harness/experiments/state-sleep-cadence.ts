/**
 * 日常層 · fatigue → sleep 節律 — a DETERMINISTIC simulation (no LLM, no chain) of the
 * fatigue-driven sleep trigger over a few days. Validates the trigger SHAPE + the
 * drift/work/recovery constants before any loop wiring.
 *
 * Context: the old sleep gate was a brittle `partOfDay === 'night'` string that silently
 * broke (fixed on main, PR #75). The durable model drives sleep off the character's own
 * fatigue (state.ts shouldSleep), with night only LOWERING the bar. This sim drives a
 * character tick-by-tick through three work patterns and prints when they sleep:
 *   A 正常作息   — work the daytime parts, idle at night        → should settle each night
 *   B 連趕夜場   — work every tick, even at night               → over-tired: naps by day too
 *   C 清閒看戲   — rarely works                                 → memory-floor blocks pointless sleep
 * Win = a believable daily rhythm emerges from the trigger alone, clustering at night,
 * with exhaustion able to force a daytime nap and an idle day producing no pointless sleep.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/state-sleep-cadence.ts
 */

import { characterWorker } from '@endless-story/runner';

const PARTS = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'] as const;
const PER_DAY = PARTS.length;
const DAYS = 3;

type WorkFn = (tickOfDay: number) => boolean;
const SCENARIOS: { key: string; works: WorkFn }[] = [
    { key: 'A 正常作息（白天演戲、入夜歇著）', works: (t) => t <= 3 },
    { key: 'B 連趕夜場（每個時辰都在台上）', works: () => true },
    { key: 'C 清閒看戲（難得搭一回戲）', works: (t) => t === 1 },
];

function bar(n: number, width = 20): string {
    const filled = Math.round(n * width);
    return '█'.repeat(filled) + '·'.repeat(width - filled);
}

function runScenario(works: WorkFn): void {
    let state: characterWorker.CharacterState = { ...characterWorker.NEUTRAL_STATE };
    let scattered = 0; // un-consolidated memories since last sleep
    let slept = 0;

    for (let tick = 0; tick < DAYS * PER_DAY; tick++) {
        const tickOfDay = tick % PER_DAY;
        const day = Math.floor(tick / PER_DAY) + 1;
        const part = PARTS[tickOfDay];
        const isNight = tickOfDay >= 4; // 入夜 / 深宵

        // time passes; if working, a beat happens (fatigue + a scattered memory)
        state = characterWorker.driftState(state);
        const worked = works(tickOfDay);
        if (worked) {
            state = characterWorker.evolveState(state, { fatigue: characterWorker.WORK_FATIGUE });
            scattered += 1;
        }

        const sleeps = characterWorker.shouldSleep({ fatigue: state.fatigue, isNight, scatteredCount: scattered });
        let mark = '';
        if (sleeps) {
            mark = `💤 睡 → 壓縮 ${scattered} 條`;
            state = characterWorker.evolveState(state, { fatigue: -characterWorker.SLEEP_RECOVERY });
            scattered = 0;
            slept += 1;
        }

        const flag = isNight ? '夜' : '　';
        const act = worked ? '演' : '·';
        console.log(
            `  第${day}日 ${part}${flag} ${act}  累 ${bar(state.fatigue)} ${state.fatigue.toFixed(2)}  零散${String(scattered).padStart(2)}  ${mark}`,
        );
    }
    console.log(`  → 三日共睡 ${slept} 次`);
}

function main(): void {
    console.log(
        `fatigue→sleep 節律模擬 · ${DAYS} 日 × ${PER_DAY} 時辰 · ` +
            `夜眠閾 ${characterWorker.NIGHT_SLEEP_FATIGUE} / 日眠閾 ${characterWorker.DAY_SLEEP_FATIGUE} · ` +
            `工作+${characterWorker.WORK_FATIGUE}/拍 · 睡回 ${characterWorker.SLEEP_RECOVERY} · 記憶地板 ${characterWorker.MIN_SCATTERED_TO_SLEEP}\n`,
    );
    for (const sc of SCENARIOS) {
        console.log(`${'═'.repeat(72)}\n${sc.key}\n${'═'.repeat(72)}`);
        runScenario(sc.works);
        console.log('');
    }
    console.log(
        '看:A 是否每入夜就睡、白天攢「累」與零散記憶;B 是否累到白天也得補眠;' +
            'C 是否因不累/沒東西可壓縮而少睡或不睡。節律若像活人,fatigue→sleep 觸發就成立。',
    );
}

main();
