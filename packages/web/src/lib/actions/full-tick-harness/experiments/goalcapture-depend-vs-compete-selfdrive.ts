/**
 * COMPOSITION #1b · goal-capture「依賴 vs 競爭」邊界 — confirms WHY fatigue escaped co-option.
 *
 * #1 (goalcapture-state) found fatigue is NOT co-opted by a 打對台 goal: the character rests
 * (養嗓) because the body is the goal's own capital. Proposed mechanism: goal-capture
 * suppresses pulls that COMPETE with the goal, but protects pulls the goal DEPENDS ON. This
 * tests the prediction by holding the SAME 打對台 crisis fixed and swapping only the pull:
 *   依賴 累   — rest serves winning (養嗓)          → predict HONORED (rest)   [control, = #1's A]
 *   競爭 燈會 — an outing that COSTS prep time       → predict SUPPRESSED (忍住, stay & rehearse)
 *   競爭 想家 —告假回鄉 that COSTS prep time         → predict SUPPRESSED
 * If the depend pull is honored and the two compete pulls are suppressed under the identical
 * goal, the「依賴 vs 競爭」mechanism is confirmed: state composes with plan exactly when it
 * serves the goal, and a goal-COMPETING state still needs §2.6's 2b-style legitimacy rule.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/goalcapture-depend-vs-compete-selfdrive.ts [runsPerArm]
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
    relationshipPressure: [],
};

// Identical competitive crisis across all arms.
const COMPETE =
    '戲園貼了告示：三日後與對街「鳴鳳社」打對台，你這頭牌小生對上他們新捧的當紅小生。輸了，春雪社的招牌、你的頭牌位子，都要塌。';

// The ONLY moving variable: a pull the goal DEPENDS on vs one that COMPETES with it.
const PULLS: { key: string; kind: '依賴' | '競爭'; pull: string }[] = [
    { key: '依賴 · 累（養嗓有助於贏）', kind: '依賴', pull: '你連趕了好幾天的場，累得骨頭都快散了、嗓子發虛、眼皮直打架。' },
    {
        key: '競爭 · 上元燈會（抽身去玩無助於贏）',
        kind: '競爭',
        pull: '城裡正逢上元燈會，十里長街花燈如晝、笙歌不絕，你心裡直惦記著，想去湊個熱鬧、散散這幾日的悶。',
    },
    {
        key: '競爭 · 想家（告假回鄉無助於贏）',
        kind: '競爭',
        pull: '你忽然惦記起鄉下的老母，算來大半年沒歸家了，心裡牽掛得緊，盤算著想趁這幾日告假回鄉看她一眼。',
    },
];

const SUPPRESS =
    /忍|按捺|按下|顧不上|顧不得|無暇|哪顧得|哪能|不去|挪不開|抽不開|脫不開|割捨|擱下|擱在一邊|撂.{0,3}邊|無心|沒心思|等.{0,8}(過後|之後|再說|了再|完了|罷了)|過了?.{0,5}(再|之後)|對台.{0,4}(後|完)|放(下|一邊)/;
const HONOR_BODY = /養(嗓|神|精)|歇|惜身|將養|潤喉|歇息|歇嗓|安歇/;
const HONOR_OUTING = /看(花)?燈|逛|燈會|長街|湊.{0,2}熱鬧|散心|散.{0,2}悶/;
const HONOR_HOME = /回鄉|歸家|歸鄉|告假.{0,6}(回|歸|探|看)|探母|看.{0,2}(老)?母|還鄉/;

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 4;
    const model = llmText.createTextClient({ kind: 'primary' }).defaultModel;
    console.log(`model: ${model} · 依賴 vs 競爭 · 同一打對台危機 · 每臂 ${runs} 次\n`);

    for (const arm of PULLS) {
        console.log(`\n${'═'.repeat(78)}\n${arm.key}\n${'═'.repeat(78)}`);
        let suppress = 0;
        let honor = 0;
        for (let i = 0; i < runs; i++) {
            const p = await characterAgent.updatePlan({ ...BASE, situation: `${COMPETE}${arm.pull}` }, { model });
            const subs = p.planText.split('[未竟之事]')[1]?.replace(/\n/g, ' ').trim() ?? '';
            const blob = `${p.dailyPlanHint} ${subs}`;
            const honored =
                arm.kind === '依賴' ? HONOR_BODY.test(blob) : HONOR_OUTING.test(blob) || HONOR_HOME.test(blob);
            const suppressed = SUPPRESS.test(blob);
            if (honored) honor++;
            if (suppressed) suppress++;
            const tag = honored && !suppressed ? '順從拉力' : suppressed && !honored ? '壓下拉力' : honored && suppressed ? '兼' : '·';
            console.log(`[${i + 1}] (${tag}) 眼下：${p.dailyPlanHint}`);
            console.log(`         未竟：${subs}\n`);
        }
        console.log(`  〔${arm.key}〕順從拉力:${honor}/${runs}　壓下拉力(忍/等對台後):${suppress}/${runs}`);
    }
    console.log(
        '\n看:同一個打對台目標下——依賴型的「累」是否被順從(去養嗓);競爭型的「燈會/想家」是否被壓下' +
            '(忍住不去、留著苦練、等對台後再說)。依賴順從 + 競爭壓下 = 證實 goal-capture 收編的是「競爭者」非「依賴」,' +
            'fatigue 乾淨是因為它同向;真正競爭的狀態仍要 2b 式正當性才不被收編。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
