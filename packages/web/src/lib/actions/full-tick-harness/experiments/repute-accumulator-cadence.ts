/**
 * 累積器 · repute ← 日常傾向 → 守恆 slot 慢輪替 — DETERMINISTIC sim (no LLM, no chain) of the
 * de-colonizing resource driver: a per-character repute that accumulates from daily LEANINGS,
 * and a conserved capacity-1 slot (第一女小生) that tracks accumulated repute with HYSTERESIS so
 * it rotates SLOWLY, not abruptly via a contested event.
 *
 * Validates + tunes (the user's architecture, §2.21 + the economy/drama map): (1) repute
 * accumulates into ASYMMETRIC standing — a consistently-disciplined 柳生春 settles higher than a
 * coasting incumbent; (2) the conserved slot rotates only on a REAL, SUSTAINED lead (stable
 * against daily noise, responsive to a multi-week trend); (3) NO lock-in — a holder who coasts
 * (lean drops) loses the slot to a re-disciplined rival. This is status earned by living well over
 * weeks, not won in one event = de-colonization, made mechanical.
 *
 * Pure scalars + names (`repute`, `slot`) so it ports to any story background (merchant rank,
 * 江湖名望) with no mechanism change. Math.sin only (Math.random/Date are unavailable).
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/repute-accumulator-cadence.ts
 */

interface Params {
    GAIN: number; // repute added per unit of daily lean (0..1)
    DECAY: number; // habituation: pull toward BASELINE each day (→ equilibrium = BASELINE + gain/DECAY)
    BASELINE: number;
    HOLD_BONUS: number; // small repute feedback for the current slot holder (status helps, but bounded)
    SLOT_MARGIN: number; // hysteresis: a challenger must exceed the holder's repute by this much…
    SLOT_SUSTAIN: number; // …for this many consecutive days before the slot rotates
}
const P: Params = {
    GAIN: 3,
    DECAY: 0.05,
    BASELINE: 20,
    HOLD_BONUS: 0.15, // tuned down from 0.5: +0.5 locked the incumbent in (eq +10 ate the lean spread)
    SLOT_MARGIN: 3,
    SLOT_SUSTAIN: 5,
};

/** One day of repute: gain from today's lean (+ a small bonus if holding the slot), minus
 *  habituation decay toward baseline. Equilibrium ≈ BASELINE + (GAIN·lean + bonus)/DECAY, so a
 *  higher CONSISTENT lean settles at a higher repute — asymmetric standing falls out for free. */
function stepRepute(repute: number, lean: number, holdsSlot: boolean, p: Params): number {
    const gain = p.GAIN * lean + (holdsSlot ? p.HOLD_BONUS : 0);
    return Math.max(0, repute + gain - p.DECAY * (repute - p.BASELINE));
}

// small deterministic day-to-day wobble (Math.random is unavailable)
const wob = (day: number, seed: number) => Math.sin((day + seed * 3) * 0.7);

interface Char {
    name: string;
    repute: number;
    lean: (day: number) => number; // today's daily lean from their choices, 0..1
}

function eq(leanAvg: number, holds: boolean): number {
    return P.BASELINE + (P.GAIN * leanAvg + (holds ? P.HOLD_BONUS : 0)) / P.DECAY;
}

function bar(v: number, max = 90, width = 24): string {
    const f = Math.max(0, Math.min(width, Math.round((v / max) * width)));
    return '█'.repeat(f) + '·'.repeat(width - f);
}

function runScenario(title: string, chars: Char[], holder0: string, days: number): void {
    console.log(`\n${'═'.repeat(80)}\n${title}\n${'═'.repeat(80)}`);
    let holder = holder0;
    let leadName = '';
    let leadDays = 0;
    const find = (n: string) => chars.find((c) => c.name === n)!;

    for (let day = 1; day <= days; day++) {
        // 1) accumulate repute from today's leanings
        for (const c of chars) c.repute = stepRepute(c.repute, c.lean(day), c.name === holder, P);

        // 2) conserved slot rotates only on a real + sustained lead (hysteresis)
        const challenger = chars
            .filter((c) => c.name !== holder)
            .sort((a, b) => b.repute - a.repute)[0];
        let rotated = '';
        if (challenger && challenger.repute > find(holder).repute + P.SLOT_MARGIN) {
            leadDays = challenger.name === leadName ? leadDays + 1 : 1;
            leadName = challenger.name;
            if (leadDays >= P.SLOT_SUSTAIN) {
                rotated = `  ⟳ slot 輪替：${holder} → ${challenger.name}`;
                holder = challenger.name;
                leadName = '';
                leadDays = 0;
            }
        } else {
            leadName = '';
            leadDays = 0;
        }

        if (day % 3 === 0 || rotated) {
            const cols = chars
                .map((c) => `${c.name} ${c.repute.toFixed(0).padStart(2)}${c.name === holder ? '★' : ' '}`)
                .join('  ');
            console.log(`  D${String(day).padStart(2)}  ${cols}   [持有:${holder}]${rotated}`);
        }
    }
    // conservation check: exactly one holder
    console.log(`  → 結束持有:${holder}（slot 守恆＝恆一人持有）`);
}

function main(): void {
    console.log(
        `repute 累積器 · GAIN ${P.GAIN}/lean · DECAY ${P.DECAY}(eq=base+gain/decay) · ` +
            `HOLD+${P.HOLD_BONUS} · 輪替門檻 領先${P.SLOT_MARGIN}且撐${P.SLOT_SUSTAIN}天\n`,
    );
    console.log(
        `  均衡參考(lean→repute)：lean .82≈${eq(0.82, false).toFixed(0)} / .70≈${eq(0.7, false).toFixed(0)} / ` +
            `.60≈${eq(0.6, false).toFixed(0)} / .45≈${eq(0.45, false).toFixed(0)}（持有者另 +${(P.HOLD_BONUS / P.DECAY).toFixed(0)}）`,
    );

    // Scenario A — 柳生春 一致自律地往上爬；在位的鄭月卿吃老本、傾向逐日下滑 → slot 應慢慢輪替 鄭→柳
    runScenario(
        'A 一致自律 vs 在位吃老本（柳生春該慢慢熬成第一女小生）',
        [
            { name: '柳生春', repute: 50, lean: (d) => 0.82 + 0.06 * wob(d, 1) },
            { name: '鄭月卿', repute: 67, lean: (d) => Math.max(0.55, 0.8 - 0.005 * d) + 0.05 * wob(d, 2) },
            { name: '苗喜兒', repute: 28, lean: (d) => 0.46 + 0.08 * wob(d, 3) },
        ],
        '鄭月卿',
        50,
    );

    // Scenario B — 柳生春 拿下後開始擺爛（lean 掉）；鄭月卿 重新自律 → 驗證不鎖死，slot 該換回去
    runScenario(
        'B 持有者擺爛 vs 對手重整（地位非永久，不持續過好日子就守不住）',
        [
            { name: '柳生春', repute: 78, lean: (d) => (d < 12 ? 0.82 : 0.5) + 0.05 * wob(d, 1) },
            { name: '鄭月卿', repute: 60, lean: (d) => (d < 12 ? 0.6 : 0.84) + 0.05 * wob(d, 2) },
            { name: '苗喜兒', repute: 30, lean: (d) => 0.47 + 0.08 * wob(d, 3) },
        ],
        '柳生春',
        40,
    );

    console.log(
        '\n看:A 柳生春 repute 是否一致爬過鄭月卿、且 slot 只在「領先夠久」才輪替(不抖)；' +
            'B 擺爛的柳生春是否被重整的鄭月卿換下(不鎖死)。穩又會動 = 累積器有效，常數可用。',
    );
}

main();
