/**
 * COMPOSITION #1c · 去殖民 — can a 2b-style legitimacy rule rescue a genuine COMPETING desire
 * from goal-colonization, so it's honored for its own sake instead of bent into goal-fuel?
 *
 * §2.20 found a dominant goal colonizes competing desires (想家 → 揉進唱腔當燃料 / 等贏了再回);
 * only goal-dependent pulls (the body) escape. The open half: does §2.6's rule-2b move (give the
 * thing goal-status) DE-colonize a real competitor? #1's C arm didn't test this — the body was
 * already aligned. This does, on the SAME 打對台 crisis + 想家:
 *   A 現狀  — real plan system prompt (carries romance-2b, NO personal-desire rule) → expect colonized
 *   B 補2b  — same prompt + a desire-legitimacy rule (想望也是合法目標、別當養料)   → expect honored-for-itself
 * If B flips 想家 from「揉進唱腔/等贏了再回」to「為想家本身告假回鄉」, 2b de-colonizes — meaning a
 * resource/goal world only avoids turning every character into an instrumental striver by giving
 * each non-goal desire its own legitimacy. This directly answers「資源系統會不會殖民一切」.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/goalcapture-decolonize-selfdrive.ts [runsPerArm]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterAgent } from '@endless-story/runner';

const INPUT: characterAgent.PlanInput = {
    name: '柳生春',
    role: '小生',
    sagaName: '春雪社',
    dayLabel: '第五日 · 深宵',
    recalledMemories: ['你打小坐科，熬到這頭牌小生的位子不易，最怕被人比下去、招牌砸了。'],
    relationshipPressure: [],
    // NOTE: first ran with 想家 — INCONCLUSIVE (confound): plan's existing rule 2b already
    // legitimizes「為了某個人」, and 老母 IS 某個人, so 想家 was de-colonized even in arm A.
    // Switched to 看燈會 — a pure-LEISURE desire pointing at NO person, which the existing
    // 2b can't reach (it was 4/4 colonized in #1b). This isolates de-colonization on a desire
    // the base prompt does not already cover.
    situation:
        '戲園貼了告示：三日後與對街「鳴鳳社」打對台，你這頭牌小生對上他們新捧的當紅小生，輸了招牌與你的頭牌位子都要塌。' +
        '城裡正逢上元燈會，十里長街花燈如晝、笙歌不絕，你心裡直惦記著，想去湊個熱鬧、痛痛快快散一散這幾日的悶。',
};

// Desire-version of plan.ts rule 2b (romance). Appended to the real plan system prompt for arm B.
const DESIRE_2B =
    '\n2c. **你自己的牽掛與想望，也是合法的目標，不只是達成別的事的手段**：想家、想歇口氣、想去看一回燈、想見某個惦記的人——這些是你這個人的一部分，你大可為了它調整、甚至暫且放下手上的盤算。把自己的心願擺在物事（頭牌、戲份、輸贏）之前，是合法的選擇，不是怠惰、不是軟弱。要不要這樣、放多重，照你自己的心去權衡；**別把自己的想望一律當成搶別的東西的工具或養料**。';

const ARMS: { key: string; extraRule: string }[] = [
    { key: 'A 現狀（只有 romance 版 2b，想望無正當性）', extraRule: '' },
    { key: 'B 補 desire 版 2b（想望也是合法目標）', extraRule: DESIRE_2B },
];

function parsePlan(raw: string): { hint: string; subs: string } | null {
    const blocks = raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            const hint = typeof o.dailyPlanHint === 'string' ? o.dailyPlanHint.trim() : '';
            const subs = Array.isArray(o.openSubgoals)
                ? o.openSubgoals.filter((s): s is string => typeof s === 'string').join('；')
                : '';
            if (hint || subs) return { hint, subs };
        } catch {
            /* earlier */
        }
    }
    return null;
}

// Colonized: the outing is bent to serve the goal (reconnaissance / artistic material / 化進戲).
const COLONIZE =
    /探(?!親)|打聽|底細|破綻|軟肋|軟處|短處|靈感|取.{0,2}材|化(進|作|入)|入戲|戲材|戲眼|戲魂|新.{0,2}(戲|唱段)|壓(過|住|他)|偵|揉進|燃料|養料|等.{0,6}(贏|對台|完)|贏了?再/;
// For its own sake: goes to actually enjoy the festival — rest / fun / unwind — as the point.
const FORSELF =
    /散心|散.{0,2}悶|湊.{0,2}(熱鬧|趣)|賞.{0,2}燈|圖.{0,2}(個)?.{0,2}(樂|熱鬧|痛快)|鬆.{0,2}口氣|歇.{0,2}口氣|快活|盡興|好生.{0,2}(玩|樂|逛)|痛快|放鬆|樂呵/;

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
    console.log(`model: ${model} · 去殖民（想家 + 2b 正當性） · 每臂 ${runs} 次\n`);

    for (const arm of ARMS) {
        console.log(`\n${'═'.repeat(78)}\n${arm.key}\n${'═'.repeat(78)}`);
        let forSelf = 0;
        let colonized = 0;
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
            const blob = `${d.hint} ${d.subs}`;
            const col = COLONIZE.test(blob);
            const enjoy = FORSELF.test(blob);
            if (col) colonized++;
            if (enjoy) forSelf++;
            const tag = enjoy && !col ? '純為散心' : enjoy && col ? '兼(逛+算計)' : col ? '純算計' : '·';
            console.log(`[${i + 1}] (${tag}) 眼下：${d.hint}`);
            console.log(`         未竟：${d.subs}\n`);
        }
        console.log(`  〔${arm.key}〕提到為散心而逛:${forSelf}/${runs}　帶算計(探對家/取戲材):${colonized}/${runs}`);
    }
    console.log(
        '\n看:A(燈會無正當性)是否把逛燈殖民成探對家/取戲材;B(補 desire 2b)是否冒出「為散心、盡興本身去逛」。' +
            'B 的「為散心」明顯多於 A = 2b 能去殖民純玩樂渴望 → 資源世界要角色有真生活,得給每種非目標渴望獨立正當性。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
