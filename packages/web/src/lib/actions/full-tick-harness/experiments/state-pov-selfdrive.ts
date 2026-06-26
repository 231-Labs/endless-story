/**
 * 日常層 · state → 整段章回的質地 — does a per-character state vector tint a WHOLE POV
 * chapter (not just a single decision), without the character ceasing to be themselves?
 *
 * state-baozi proved state spreads a single decision (collards posture/recipient/mood). This
 * carries it into the real POV path (characterWorker.buildPovSystemPrompt + buildPovUserPrompt
 * with the new `state` field) to prove it tints a full chapter. Held FIXED: 柳生春, the soul
 * (春雪社 tender 梨園), and ONE deliberately mundane beat (散戲後卸妝，妝台上一籠溫著的包子). The
 * ONLY thing that varies is her 此刻身心:
 *   baseline — NEUTRAL_STATE (below all notable bands ⇒ buildStateBlock returns '' ⇒ a plain,
 *              regression-identical chapter; the control)
 *   餓     — hunger high (does the warm 包子 pull her eye, hunger tug at attention?)
 *   累堵   — fatigue high + mood low + note「演砸了，班主冷臉」(heavy, withdrawn, the cold seeps in?)
 *   舒暢   — mood high + note「滿堂彩，方才和師姐說笑」(light, warm, reaches for 師姐?)
 * Win = the SAME beat reads in four visibly different textures that track state, while 柳生春
 * stays 柳生春 (still 黏師姐, still the soft 坤生, still 怕胖-careful). Texture moves; identity holds.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/state-pov-selfdrive.ts
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

const SOUL: characterWorker.SagaSoul = {
    toneRegister: '梨園後台的質地：身段、調門、妝面、台下目光、行頭冷暖；含蓄、戲味。',
    emotionalStance: 'tender',
};

const LIU: characterWorker.CharacterSnapshot = {
    id: '0xliu-sheng-chun',
    name: '柳生春',
    role: '小生',
    gender: '女',
    ageYears: 24,
    sagaName: '春雪社',
    sceneName: '後台妝閣',
    physicalFacts:
        '春雪社當紅小生（坤生）。瘦條條偏高、比尋常花旦還高些；一張臉帥得俊又美得很，台上風流不羈的少年郎，一下戲卻滿是女兒家嬌軟。纖瘦，女小生最怕胖。',
    attributes: { appearance: 88, constitution: 70, acuity: 82, disposition: 76 },
};

// 黏師姐 is her invariant — fed as relationship pressure so we can check it survives every state.
const REL_HINTS = ['師姐蘇映雪：你最親、最肯在她跟前卸下防備的人，台下總愛黏著她討個依靠。'];

// ONE mundane beat, identical across arms. Low-stakes on purpose, so STATE is the dominant
// texture variable, not the event.
const BEAT =
    '散戲後的後台妝閣，看客與班裡人陸續散去，只剩零星說話聲與遠處收拾行頭的響動。你在銅鏡前卸妝，胭脂與鉛粉一層層褪下。妝台一角，擱著霞飛路秦秀娥方才送來、還溫著的一籠包子。夜深了，這是個尋常不過的散戲夜。';

const ARMS: { key: string; state?: characterWorker.CharacterState }[] = [
    { key: '基線（NEUTRAL，無注入＝對照）', state: { hunger: 0.2, fatigue: 0.2, mood: 0 } },
    { key: '餓（hunger 高）', state: { hunger: 0.85, fatigue: 0.3, mood: 0 } },
    {
        key: '累堵（fatigue 高 + mood 低）',
        state: {
            hunger: 0.3,
            fatigue: 0.85,
            mood: -0.7,
            note: '今晚「斷橋」沒使好，水袖甩脫了手，班主散戲時冷著臉、一句沒誇你。',
        },
    },
    {
        key: '舒暢（mood 高）',
        state: {
            hunger: 0.3,
            fatigue: 0.4,
            mood: 0.8,
            note: '今晚滿堂彩，謝了三次幕；方才還和師姐在側幕說笑。',
        },
    },
];

async function chatRetry(
    client: ReturnType<typeof llmText.createTextClient>,
    req: Parameters<ReturnType<typeof llmText.createTextClient>['chat']>[0],
    tries = 4,
): Promise<{ text: string }> {
    let last: unknown;
    for (let t = 0; t < tries; t++) {
        try {
            return await client.chat(req);
        } catch (e) {
            last = e;
            await new Promise((r) => setTimeout(r, 3000 * (t + 1)));
        }
    }
    throw last;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    const system = characterWorker.buildPovSystemPrompt(SOUL, 'pov');
    console.log(`model: ${model} · 日常層 · 同一柳生春同一散戲夜 · 只換 state · 共 ${ARMS.length} 章\n`);

    for (const arm of ARMS) {
        const user = characterWorker.buildPovUserPrompt({
            character: LIU,
            triggerNarrative: BEAT,
            recentMemorySnippets: [],
            relationshipHints: REL_HINTS,
            state: arm.state,
        });
        const r = await chatRetry(client, {
            model,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 1500,
            temperature: 0.82,
        });
        console.log(`\n${'═'.repeat(78)}\n身心狀態 → ${arm.key}\n${'═'.repeat(78)}\n${r.text.trim()}\n`);
    }
    console.log(
        '\n看:同一個散戲夜、同一個柳生春，四種 state 是否寫出四種質地——餓的眼睛黏向那籠包子、' +
            '累堵的沉與班主冷臉滲入、舒暢的輕快與想黏師姐；而四章裡她都還是那個黏師姐、怕胖、台下嬌軟的坤生。' +
            '質地隨 state 動，身份不動 = 日常層成立。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
