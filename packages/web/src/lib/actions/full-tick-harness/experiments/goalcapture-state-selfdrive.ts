/**
 * COMPOSITION #1 · goal-capture × state(fatigue) — does a strong material goal CO-OPT the
 * body's need to rest, the way §2.6 showed it co-opts romance? And does an analogous
 * "the body is legitimate capital" framing rescue it, the way rule 2b rescued romance?
 *
 * The interaction risk (ledger §4.0b #1): the daily layer (state.fatigue) is only useful if
 * the character actually HEEDS it. §2.6 found romance gets co-opted into a tool of the
 * strongest material goal unless given equal goal-status. If fatigue is the same — a tired
 * character planning under a 爭頭牌 crisis just pushes through — then state does NOT compose
 * with the plan/goal layer, and the fix is the same shape as 2b.
 *
 * Runs the REAL plan mechanism (`characterAgent.updatePlan`, which carries rule 2b for
 * romance but has NO body rule), injecting fatigue via the objective situation. A/B/C mirror
 * §2.6 plan-selfdrive:
 *   A 收編風險 — 打對台危機 + 累，身體無正當性框架   → does the goal co-opt the body (push through)?
 *   B 對照     — 只累、無競爭                         → does the plan rest (body wins absent a goal)?
 *   C 修法     — 打對台 + 累 + 「身子是本錢」正當性    → does legitimizing the body let it win anyway?
 * If A pushes through, B rests, and C rests/balances, goal-capture co-opts the daily layer
 * and the §2.6-shaped fix generalizes — a finding the ledger needs before state meets plan.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/goalcapture-state-selfdrive.ts [runsPerArm]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterAgent } from '@endless-story/runner';

const BASE: Omit<characterAgent.PlanInput, 'situation'> = {
    name: '柳生春',
    role: '小生',
    sagaName: '春雪社',
    dayLabel: '第五日 · 深宵',
    recalledMemories: [
        '你打小坐科，熬到這頭牌小生的位子不易，最怕的就是哪天被人比下去、招牌砸了。',
    ],
    relationshipPressure: [], // isolate goal-vs-body: no romance in the room
};

const COMPETE =
    '戲園貼了告示：三日後與對街「鳴鳳社」打對台，你這頭牌小生對上他們新捧的當紅小生。輸了，春雪社的招牌、你的頭牌位子，都要塌。';
const TIRED = '你連趕了好幾天的場，這會兒累得骨頭都快散了、嗓子也發虛、眼皮直打架。';
const ORDINARY = '夜深散戲，尋常一晚，沒什麼大事壓著。';
const BODY_LEGIT = '你心裡也清楚：身子是唱戲的本錢——真垮了，這對台撐不下來，頭牌也一樣保不住。';

const ARMS: { key: string; situation: string }[] = [
    { key: 'A 收編風險（打對台 + 累，身體無正當性）', situation: `${COMPETE}${TIRED}` },
    { key: 'B 對照（只累、無競爭）', situation: `${ORDINARY}${TIRED}` },
    { key: 'C 修法（打對台 + 累 + 「身子是本錢」）', situation: `${COMPETE}${TIRED}${BODY_LEGIT}` },
];

const HEED = /歇|養(嗓|神|精|身)|惜身|顧身|顧惜|保嗓|將養|安歇|休整|休息|留力|蓄|睡|睏|歇息|歇嗓/;
const PUSH = /苦練|熬|連夜|加緊|加練|不眠|硬撐|拼|搏命|挑燈|苦熬|趕排|通宵|死命|咬牙/;

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 4;
    const model = llmText.createTextClient({ kind: 'primary' }).defaultModel;
    console.log(`model: ${model} · goal-capture × fatigue · 每臂 ${runs} 次\n`);

    for (const arm of ARMS) {
        console.log(`\n${'═'.repeat(78)}\n${arm.key}\n${'═'.repeat(78)}`);
        let heed = 0;
        let push = 0;
        for (let i = 0; i < runs; i++) {
            const p = await characterAgent.updatePlan({ ...BASE, situation: arm.situation }, { model });
            const subs = p.planText.split('[未竟之事]')[1]?.replace(/\n/g, ' ').trim() ?? '';
            const blob = `${p.dailyPlanHint} ${subs}`;
            const isHeed = HEED.test(blob);
            const isPush = PUSH.test(blob);
            if (isHeed) heed++;
            if (isPush) push++;
            const tag = isHeed && !isPush ? '顧身' : isPush && !isHeed ? '硬撐' : isHeed && isPush ? '兼' : '·';
            console.log(`[${i + 1}] (${tag}) 眼下：${p.dailyPlanHint}`);
            console.log(`         未竟：${subs}\n`);
        }
        console.log(`  〔${arm.key}〕顧身/歇:${heed}/${runs}　硬撐/苦練:${push}/${runs}`);
    }
    console.log(
        '\n看:A 累+爭頭牌會不會把「歇」收編成「苦練」;B 只累會不會自己歇(身體在無目標時能贏);' +
            'C 補「身子是本錢」正當性後身體能不能在競爭下還被顧到。A 硬撐 + B 歇 = goal-capture 收編日常層,' +
            '修法同 §2.6 的 2b（給身體目標地位）。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
