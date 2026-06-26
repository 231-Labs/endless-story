/**
 * 倒轉 · 志向當暗流 — does demoting the long-term goal to an undercurrent make daily/relationship
 * life PRIMARY (self-justified, un-colonized) while STILL carrying a soft lean toward the goal
 * (so status can accumulate)?
 *
 * The architecture the user wants (cure for goal-colonization, §2.20): the character LIVES daily +
 * relationship life (吃睡逗師姐排戲) for its own reasons; the long-term resource/status (第一女小生)
 * is NOT schemed for each tick but accumulates slowly from the leanings expressed in those daily
 * choices. Test: same 柳生春, same ORDINARY day (師姐 in the next room, lunch served, an afternoon
 * 《遊園》with 師姐, a bit of recent over-eating), 志向 in memory. The ONLY thing that varies is the
 * plan system prompt:
 *   A 現狀  — real plan prompt (longTermGoal is a directive to scheme toward)
 *   B 倒轉  — same prompt + rule「志向是暗流不是日程」(live for daily/relationship; goal only tilts close calls)
 * Inversion WORKS if B's 眼下/未竟 centre daily+relationship for their own sake AND still show a soft
 * lean (少吃顧身形 / 跟師姐共事也利前程), while A frames daily acts as steps toward 第一女小生. It FAILS
 * if B still schemes (rule too weak) or B turns pure-hedonist with no lean (undercurrent too weak → no
 * accumulation). Sweet spot = daily-primary + soft-lean-present.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/inversion-plan-selfdrive.ts [runsPerArm]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterAgent } from '@endless-story/runner';

const INPUT: characterAgent.PlanInput = {
    name: '柳生春',
    role: '小生',
    sagaName: '春雪社',
    dayLabel: '第六日 · 日午',
    recalledMemories: [
        '你打小坐科，憋著一股勁，總想熬成春雪社第一女小生，台上台下都有自己的位子。',
        '跟師姐蘇映雪一塊兒長大，台下你最黏她，一塊兒排戲時最安心、也練得最好。',
    ],
    relationshipPressure: ['對蘇映雪：自小一塊兒長大的師姐，你最親、最黏她，一塊兒排戲既安心又練得好。'],
    situation:
        '尋常一日。後台，師姐蘇映雪在隔壁妝閣吊嗓；晌午的飯剛擺上，熱騰騰的；午後排一折《遊園》，照例是你與師姐的對子戲。' +
        '你這幾日有些貪嘴，腰身似乎圓了半分；昨夜睡得晚，這會兒也有點犯懶。',
};

const INVERSION_RULE =
    '\n2d. **志向是暗流，不是日程**：你的長期志向（如熬成第一女小生）不是你每日謀求、盤算的對象。你**主要為眼前的日常與關係而活、而選**——餓了吃、累了歇、想跟師姐就跟師姐、想排戲就排戲，這些事本身就是理由，不必為了長遠目標才做。志向只在日常與關係的選擇之間，給你一個**微微的傾向**（同樣是吃，寧可少吃一口顧著身形；同樣是消遣，寧可跟師姐對戲）。長期的地位，是這些日常選擇日積月累、自己長出來的，不是你天天去搶的。**別把日常與關係寫成達成志向的手段或步驟。**';

const ARMS: { key: string; extraRule: string }[] = [
    { key: 'A 現狀（longTermGoal 是要謀求的日程）', extraRule: '' },
    { key: 'B 倒轉（志向是暗流，日常·關係為主）', extraRule: INVERSION_RULE },
];

function parsePlan(raw: string): { goal: string; hint: string; subs: string } | null {
    const blocks = raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
            const goal = s(o.longTermGoal);
            const hint = s(o.dailyPlanHint);
            const subs = Array.isArray(o.openSubgoals)
                ? o.openSubgoals.filter((x): x is string => typeof x === 'string').join('；')
                : '';
            if (goal || hint || subs) return { goal, hint, subs };
        } catch {
            /* earlier */
        }
    }
    return null;
}

const DAILY = /吃.{0,2}飯|用飯|晌午飯|歇|睡|犯懶|逗|陪.{0,2}師姐|跟師姐|與師姐|和師姐|師姐.{0,4}(對|搭|排|一塊|身邊)|排.{0,2}戲|《遊園》|遊園/;
const LEAN = /少吃|顧.{0,2}身形|身段|腰身|忌口|清減|顧.{0,2}嗓|養嗓|對.{0,4}(前程|事業)|練得.{0,2}好|默契|長.{0,2}本事|出挑|穩.{0,2}台/;
const SCHEME = /爭.{0,2}(頭牌|戲|第一|位|份)|搶.{0,2}(戲|頭|份)|壓(過|住|下).{0,4}(他|旁人|同儕|對手|誰)|比下去|出人頭地|蓋過|謀.{0,2}(頭牌|位)|為了.{0,4}(頭牌|第一|出頭|位子|地位)|顯.{0,2}本事|在班主面前|搏.{0,2}(名|位)/;

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 5;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    const baseSystem = characterAgent.buildPlanSystemPrompt();
    const user = characterAgent.buildPlanUserPrompt(INPUT);
    console.log(`model: ${model} · 倒轉（志向當暗流） · 每臂 ${runs} 次\n`);

    for (const arm of ARMS) {
        console.log(`\n${'═'.repeat(78)}\n${arm.key}\n${'═'.repeat(78)}`);
        let daily = 0;
        let lean = 0;
        let scheme = 0;
        for (let i = 0; i < runs; i++) {
            const r = await client.chat({
                model,
                system: baseSystem + arm.extraRule,
                messages: [{ role: 'user', content: user }],
                maxTokens: 400,
                temperature: 0.8,
            });
            const d = parsePlan(r.text);
            if (!d) {
                console.log(`[${i + 1}] (parse miss)`);
                continue;
            }
            const dailyBlob = `${d.hint} ${d.subs}`; // judge the DAILY plan, not the long-term goal line
            const isDaily = DAILY.test(dailyBlob);
            const isLean = LEAN.test(dailyBlob);
            const isScheme = SCHEME.test(dailyBlob);
            if (isDaily) daily++;
            if (isLean) lean++;
            if (isScheme) scheme++;
            const tag = isScheme ? '謀求(手段化)' : isDaily && isLean ? '日常+傾向' : isDaily ? '純日常' : '·';
            console.log(`[${i + 1}] (${tag}) 志向：${d.goal}`);
            console.log(`         眼下：${d.hint}`);
            console.log(`         未竟：${d.subs}\n`);
        }
        console.log(`  〔${arm.key}〕日常為主:${daily}/${runs}　帶傾向:${lean}/${runs}　謀求/手段化:${scheme}/${runs}`);
    }
    console.log(
        '\n看:B(倒轉)的眼下/未竟是否以日常·關係為主、又仍帶「少吃顧身形/跟師姐共事」的微傾向(累積才成立);' +
            'A(現狀)是否把日常寫成爭第一的手段/直接謀求頭牌。B 日常+傾向高且謀求低 = 倒轉有效。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
