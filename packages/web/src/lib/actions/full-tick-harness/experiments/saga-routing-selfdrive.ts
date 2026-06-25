/**
 * SAGA-ROUTING SELF-DRIVE — 屬地/屬人 routing on one cross-saga beat.
 *
 * One event (霞飛路 湯包店 老闆娘 秦秀娥 brings 柳生春 a basket of hot 包子 in 春雪社's backstage;
 * 柳, 怕胖, passes them to her 師姐 蘇映雪) is written THREE ways:
 *   - 屬地 客觀章回    — by the place it happened in (春雪社): only the observable, no one's内心
 *   - 老闆娘 POV       — routed to HER saga (霞飛路): a 市井 toneRegister — 包子熱氣、銅板、街坊
 *   - 柳生春 POV       — routed to HER saga (春雪社): the 梨園 register — 身段、台下目光、怕胖
 * If the 客觀章回 carries no一人之內心, and the two POVs read in visibly different textures
 * (市井 vs 梨園) on the SAME facts, 屬地客觀 / 屬人主觀 routing holds across sagas.
 *
 * DESIGN NOTE surfaced here: prompt.ts:95 hard-codes「風格是民初梨園小說」into VOICE — so
 * 老闆娘's POV leans梨園 unless overridden. This run leans on soul.toneRegister to pull市井;
 *真正落地時那條梨園 base 該變成 per-saga 的世界觀/文體 base.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/saga-routing-selfdrive.ts
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

// 霞飛路 saga soul — 市井 register (its world is hot baskets, coins, street gossip).
const XIAFEI_SOUL: characterWorker.SagaSoul = {
    toneRegister:
        '市井白話、煙火氣。眼裡是包子的熱氣、找零的銅板、攤頭吆喝、街坊長短，是過日子的實在算計與熱心腸；不是水袖身段、不是戲文典故。',
};
// 春雪社 saga soul — 梨園 register, warm.
const CHUNXUE_SOUL: characterWorker.SagaSoul = {
    toneRegister: '梨園後台的質地：身段、調門、妝面、台下目光、行頭冷暖；含蓄、戲味。',
    emotionalStance: 'tender',
};

const LAOBANNIANG = {
    id: '0xqin-xiue',
    name: '秦秀娥',
    role: '—',
    gender: '女',
    ageYears: 44,
    sagaName: '霞飛路',
    sceneName: '春雪社後台',
    physicalFacts: '霞飛路口開湯包店的老闆娘，手粗實、嗓門亮，圍裙上總沾著麵粉；愛看戲，尤其迷柳生春的小生。',
    attributes: { appearance: 50, constitution: 78, acuity: 72, disposition: 70 },
};
const LIUSHENGCHUN = {
    id: '0xliu-sheng-chun',
    name: '柳生春',
    role: '小生',
    gender: '女',
    ageYears: 24,
    sagaName: '春雪社',
    sceneName: '後台妝閣',
    physicalFacts: '春雪社當紅小生，外表中性俊秀、眉眼英氣；台上風流少年郎，台下清亮會疼人。纖瘦，女小生最怕胖。',
    attributes: { appearance: 88, constitution: 72, acuity: 82, disposition: 76 },
};

const EVENT =
    '散戲後，雲錦台春雪社的後台妝閣。霞飛路口湯包店的秦秀娥老闆娘，提著一籠剛蒸好、還冒著熱氣的包子，擠進後台來尋柳生春，說今兒多蒸了幾個、趁熱給她補補。柳生春接了，卻因女小生怕胖，轉手把那籠包子讓給了師姐蘇映雪。';

async function pov(soul: characterWorker.SagaSoul, character: typeof LIUSHENGCHUN, trigger: string, model: string) {
    const system = characterWorker.buildPovSystemPrompt(soul, 'pov');
    const user = characterWorker.buildPovUserPrompt({ character, triggerNarrative: trigger, recentMemorySnippets: [] });
    const r = await llmText.createTextClient({ kind: 'primary' }).chat({
        model,
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: 1400,
        temperature: 0.85,
    });
    return r.text.trim();
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key — set ZAI/POE');
        process.exit(2);
    }
    const model = llmText.createTextClient({ kind: 'primary' }).defaultModel;
    console.log(`model: ${model}\n`);

    // 屬地客觀章回 — by 春雪社 (place), objective only.
    const objective = await llmText.createTextClient({ kind: 'primary' }).chat({
        model,
        system:
            '你是這個世界的場記。把剛發生的一樁事，用客觀第三人稱寫成一小段「發生了什麼」——只寫看得見、聽得見的：誰來了、做了什麼、說了什麼、誰怎麼回應。**絕不寫任何人的內心、動機、感受**（那是各人 POV 的事）。150–250 字，舊白話，直接進正文。',
        messages: [{ role: 'user', content: `# 事件\n${EVENT}\n\n寫這樁事的客觀記錄。` }],
        maxTokens: 700,
        temperature: 0.6,
    });
    console.log(`━━━━ 屬地·客觀章回（春雪社·事發地，無人之內心）━━━━\n${objective.text.trim()}\n`);

    const lbn = await pov(
        XIAFEI_SOUL,
        LAOBANNIANG as typeof LIUSHENGCHUN,
        '你（秦秀娥）提著一籠剛蒸好的熱包子，擠進雲錦台春雪社的後台，尋著你最愛看的那位小生柳生春，把包子塞給她，說多蒸了幾個給她補補。',
        model,
    );
    console.log(`━━━━ 屬人·秦秀娥 POV（路由到霞飛路·市井）━━━━\n${lbn}\n`);

    const lsc = await pov(
        CHUNXUE_SOUL,
        LIUSHENGCHUN,
        '霞飛路那位開湯包店的秦娘子，又提著一籠熱包子擠進後台來尋你，硬塞給你。你心裡領她的情，可女小生怕胖，便轉手把那籠包子讓給了師姐蘇映雪。',
        model,
    );
    console.log(`━━━━ 屬人·柳生春 POV（路由到春雪社·梨園）━━━━\n${lsc}\n`);

    console.log(
        '看:① 客觀章回只有可觀察的事、無人內心;② 秦秀娥 POV 是市井的筆(包子/銅板/街坊),柳生春 POV 是梨園的筆(身段/怕胖/台下目光);③ 同一籠包子,兩種質地、兩種在意。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
