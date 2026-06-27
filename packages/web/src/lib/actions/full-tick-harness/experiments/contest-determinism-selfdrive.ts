/**
 * 當家花旦誰拿 —— 是算的還是 LLM 判的？（contest determinism / fairness probe）
 *
 * Owners operate ENDLESS and have real stakes in who wins a zero-sum winner-take-all slot. So "who wins"
 * must be DETERMINISTIC + reproducible (auditable: "why did I lose?"), not an LLM verdict. This imports the
 * REAL engine functions (packages/web/src/lib/chain/contest.ts — pure, no RNG) and proves it:
 *   1. reproducible: same inputs → identical winner over N runs (no RNG, no LLM).
 *   2. ability-gated: 想搶但搶不起 — max desire + low ability still loses (gate dominates).
 *   3. legible: a per-contender score breakdown shows exactly why the winner won.
 *   4. floor (臨危受命): the ablest gets thrust in when nobody willing contends.
 *   5. tie-break is id-order (deterministic), not coin-flip.
 *   6. gameability sweep: can you win a vocal/presence-gated slot by just WANTING it more? how much ability gap can desire close?
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/contest-determinism-selfdrive.ts
 */

import {
    chooseContestWinner,
    computeAbility,
    resolveContestSpec,
    toContender,
    INTENT_FLOOR,
    type Contender,
} from '../../../chain/contest.ts';
import { deriveSagaSkills, type WorldAttrs } from '../../../chain/saga-skills-core.ts';

// 當家花旦 ≈ the spotlight slot (台上目光): stage_presence 1.0, vocal 0.3, appearance 0.4, abilityGate 2.0.
const KIND = 'spotlight';
const spec = resolveContestSpec(KIND);

type Person = { id: string; name: string; role: string; attrs: WorldAttrs; intent: number; note: string };
const CAST: Person[] = [
    { id: '0xsu', name: '蘇映雪', role: '花旦', attrs: { appearance: 85, constitution: 72, acuity: 84, disposition: 80 }, intent: 0.80, note: '當紅、想要、能力強' },
    { id: '0xzheng', name: '鄭月卿', role: '花旦', attrs: { appearance: 78, constitution: 60, acuity: 86, disposition: 75 }, intent: 0.92, note: '老牌、最想要(怕被忘)、台風仍在' },
    { id: '0xcui', name: '小翠', role: '花旦', attrs: { appearance: 48, constitution: 52, acuity: 40, disposition: 38 }, intent: 1.00, note: '新人、想要到極點、功夫真沒到' },
    { id: '0xlin', name: '林菀', role: '花旦', attrs: { appearance: 88, constitution: 80, acuity: 82, disposition: 85 }, intent: 0.05, note: '能力頂尖、卻不上心' },
];

function score(c: Contender, gate: number): number {
    return (c.intent + INTENT_FLOOR) * Math.pow(Math.max(0, c.ability), gate);
}
function table(contenders: Array<{ p: Person; c: Contender }>, gate: number): void {
    const rows = contenders
        .map(({ p, c }) => ({ name: p.name, intent: c.intent, ability: c.ability, score: score(c, gate), note: p.note }))
        .sort((a, b) => b.score - a.score);
    for (const r of rows) {
        console.log(`    ${r.name.padEnd(4)}  想要 ${r.intent.toFixed(2)}  能力 ${r.ability.toFixed(3)}  →  分數 ${r.score.toFixed(4)}   (${r.note})`);
    }
}

function main(): void {
    const gate = spec.abilityGate;
    const contenders = CAST.map((p) => ({ p, c: toContender(p.id, p.intent, p.role, p.attrs, spec) }));
    const nameById = new Map(CAST.map((p) => [p.id, p.name]));

    console.log(`當家花旦（${KIND}）誰拿 —— 純引擎計算、無 LLM、無 RNG\nContestSpec: stage_presence 1.0 / vocal 0.3 / appearance 0.4 · abilityGate γ=${gate}\n`);
    console.log('① 各人計分（能力由 先天attrs + 行當skills 推導；想要=戲劇張力 0..1）:');
    table(contenders, gate);
    const winner = chooseContestWinner(contenders.map((x) => x.c), gate);
    console.log(`  → 勝出: ${nameById.get(winner ?? '') ?? '無'}\n`);

    // 2. reproducibility — pure function, prove no RNG / no hidden state.
    let allSame = true;
    for (let i = 0; i < 100000; i++) {
        if (chooseContestWinner(contenders.map((x) => x.c), gate) !== winner) { allSame = false; break; }
    }
    console.log(`② 可重現: 同輸入跑 100000 次 → ${allSame ? '永遠同一個贏家 ✓ (確定性、可重算、可稽核)' : '出現分歧 ✗'}\n`);

    // 3. ability-gated: 小翠 wants it MOST (1.00) but loses — desire can't buy competence.
    const cui = contenders.find((x) => x.p.name === '小翠')!;
    const su = contenders.find((x) => x.p.name === '蘇映雪')!;
    console.log(`③ 想搶但搶不起: 小翠 想要 1.00 (最高) 但能力 ${cui.c.ability.toFixed(3)} → 分 ${score(cui.c, gate).toFixed(4)}；輸給蘇映雪 想要 0.80/能力 ${su.c.ability.toFixed(3)} → 分 ${score(su.c, gate).toFixed(4)}。${score(su.c, gate) > score(cui.c, gate) ? '✓ 能力閘擋住了「光想要」' : '✗'}\n`);

    // 4. floor (臨危受命): only the unwilling-but-able 林菀 present → still gets thrust in.
    const onlyLin = [contenders.find((x) => x.p.name === '林菀')!.c];
    const linWin = chooseContestWinner(onlyLin, gate);
    console.log(`④ 臨危受命 floor: 在場只剩不想爭的林菀(想要 0.05) → ${linWin ? `仍被推上 (${nameById.get(linWin)}) ✓` : '無人接 ✗'}（FLOOR=${INTENT_FLOOR} 讓最能的人在沒人想要時被頂上）\n`);

    // 5. tie-break determinism: two identical contenders → lower id wins, every time.
    const tieA: Contender = { id: '0xaaa', intent: 0.5, ability: 0.5 };
    const tieB: Contender = { id: '0xbbb', intent: 0.5, ability: 0.5 };
    const tw = chooseContestWinner([tieB, tieA], gate);
    console.log(`⑤ 平手拆解: 兩人完全同分 → 勝出 ${tw}（id 小者勝、與輸入順序無關 = 確定性，非擲骰）\n`);

    // 6. gameability sweep: 小翠 cranks desire to 1.0; how much ability gap can pure want close at γ=2.0?
    console.log(`⑥ 「光靠想要」能補多少能力差？(γ=${gate}，對手=蘇映雪 想要0.80/能力${su.c.ability.toFixed(3)})`);
    const target = score(su.c, gate);
    for (const ab of [0.30, 0.40, 0.50, 0.60, 0.70]) {
        const s = (1.0 + INTENT_FLOOR) * Math.pow(ab, gate);
        console.log(`    想要拉滿1.00 + 能力 ${ab.toFixed(2)} → 分 ${s.toFixed(4)}  ${s > target ? '贏得過' : '仍輸'}`);
    }
    console.log(`  → 能力低於約 ${Math.sqrt(target / (1.0 + INTENT_FLOOR)).toFixed(3)} 時，想要拉到滿也贏不過蘇映雪。**錢/慾望買不到能力**（γ≥2 時能力是硬牆）。`);

    console.log(`\n結論：贏家 = 純函數 (想要+FLOOR)×能力^γ argmax、ties by id，**可重算、可稽核、無 LLM 無 RNG**。\nLLM 只在「上游」：① 敘事事件改變 desire 的 weight/satisfaction → 影響 tension(想要)；② 導演可 per-event 改寫 ContestSpec(改什麼能力算數)。\n→ 對有錢有 owner 的零和槽：結算本身公平可審；要鎖的是**輸入**：能力來自透明 attrs(已好)、想要要可解釋、**經濟槽的 ContestSpec 應凍結別讓 LLM 導演 per-event 改權重**。`);
}

main();
