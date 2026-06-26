/**
 * 說嘴 · repute 的他驅流 — DETERMINISTIC sim (no LLM) of word-of-mouth as a SECOND repute input:
 * other autonomous agents' social beats ABOUT you move your repute, sized by their reach × their
 * relationship-edge toward you. 秦秀娥 (a湯包店戲迷, low reach, devoted) talks you up daily; 白韻秋
 * (a綢緞千金, high reach) patronizes you occasionally; a rival's faction (negative edge) bad-mouths.
 *
 * Validates: fame is partly SOCIAL/EXTERNAL — you rise faster when fans spread your name (and you
 * dip under slander), on top of your own daily-lean self-drive (§2.22). Contribution = WOM_GAIN ×
 * reach × edge, kept SUBORDINATE to the self-lean (so discipline still dominates, per §2.22 lesson).
 * Generic: same mechanism = 商會口碑 / 江湖名聲 / a smear campaign, no rename.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/repute-wordofmouth-cadence.ts
 */

const GAIN = 3; // self-lean → repute (per §2.22)
const DECAY = 0.05;
const BASELINE = 20;
const WOM = 1.5; // word-of-mouth scale; kept < GAIN so self-discipline dominates external buzz

const wob = (day: number, seed: number) => Math.sin((day + seed * 3) * 0.7);

// 柳生春's own consistent daily lean (少吃顧身形 + 跟師姐排戲)
const selfLean = (d: number) => 0.78 + 0.05 * wob(d, 1);

interface Contributor {
    name: string;
    reach: number; // how many people they touch (0..1)
    edge: number; // tone toward 柳生春: +admire / −rivalry (−1..1)
    active: (d: number) => boolean; // does their daily life produce a beat ABOUT 柳生春 today?
}
const CONTRIBUTORS: Contributor[] = [
    // devoted fan, small shop, talks her up most days
    { name: '秦秀娥(湯包店戲迷)', reach: 0.4, edge: 0.9, active: (d) => d % 2 === 0 },
    // rich patron, wide circle, but only after she starts patronizing (~day 15), every few days
    { name: '白韻秋(綢緞千金·高觸及)', reach: 1.0, edge: 0.8, active: (d) => d >= 15 && d % 4 === 0 },
    // a rival's faction bad-mouths once threatened (~day 24)
    { name: '鄭月卿陣營(抹黑·負邊)', reach: 0.6, edge: -0.7, active: (d) => d >= 24 && d % 5 === 0 },
];

function womDelta(day: number): { total: number; notes: string[] } {
    const notes: string[] = [];
    let total = 0;
    for (const c of CONTRIBUTORS) {
        if (!c.active(day)) continue;
        const d = WOM * c.reach * c.edge;
        total += d;
        notes.push(`${c.name} ${d >= 0 ? '+' : ''}${d.toFixed(2)}`);
    }
    return { total, notes };
}

function bar(v: number, max = 95, width = 26): string {
    const f = Math.max(0, Math.min(width, Math.round((v / max) * width)));
    return '█'.repeat(f) + '·'.repeat(width - f);
}

function main(): void {
    console.log(
        `說嘴=他驅 repute · WOM ${WOM}×reach×edge（< GAIN ${GAIN}，自律仍主導）· DECAY ${DECAY}\n` +
            `秦秀娥 reach.4×edge+.9 每兩天 · 白韻秋 reach1×+.8 第15天起每四天 · 鄭陣營 reach.6×−.7 第24天起每五天\n`,
    );
    let selfOnly = 45; // baseline: 柳生春 self-discipline only
    let withWom = 45; // same start, plus word-of-mouth
    const days = 40;
    for (let d = 1; d <= days; d++) {
        const lean = selfLean(d);
        selfOnly = Math.max(0, selfOnly + GAIN * lean - DECAY * (selfOnly - BASELINE));
        const { total, notes } = womDelta(d);
        withWom = Math.max(0, withWom + GAIN * lean + total - DECAY * (withWom - BASELINE));
        if (d % 2 === 0 || total !== 0) {
            const flag = notes.length ? `   說嘴:${notes.join('、')}` : '';
            console.log(
                `  D${String(d).padStart(2)}  自驅 ${selfOnly.toFixed(0).padStart(2)} ${bar(selfOnly)}` +
                    `  ｜ +說嘴 ${withWom.toFixed(0).padStart(2)} ${bar(withWom)}${flag}`,
            );
        }
    }
    console.log(
        `\n  自驅 only 收於 ${selfOnly.toFixed(0)}；+說嘴 收於 ${withWom.toFixed(0)}（差 ${(withWom - selfOnly).toFixed(0)}）。`,
    );
    console.log(
        '看:① 粉絲說嘴讓 repute 長得更快更高(名聲是別人替你長的);② 白韻秋高觸及一次抵秦秀娥好幾次;' +
            '③ 鄭陣營抹黑是同機制的負流;④ 仍 < 自律主導(WOM<GAIN)。柳生春沒多做什麼,名聲自己被推上去。',
    );
}

main();
