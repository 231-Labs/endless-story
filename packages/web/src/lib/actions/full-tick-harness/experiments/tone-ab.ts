/**
 * TONE A/B — prove the prose colour is a knob, not a fixed mood.
 *
 * Same character (canon 柳生春), same backstage moment (蘇映雪 present, her canon
 * ache carried in as a relationship hint), same craft IRON_RULES — only the saga
 * soul's `toneRegister` changes. Generates one POV per register and writes them
 * side by side so the difference is the colour, nothing else.
 *
 * NOT a tick-loop run: two-to-three plain LLM calls, ~1 min, lid-sleep-proof.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/tone-ab.ts
 */

// Env seam first (loads packages/web/.env.local → POE/ZAI/OpenAI into process.env).
import { hasTextProviderKey } from '../narrative-setup';
import { characterWorker } from '@endless-story/runner';
import { text as llmText } from '@endless-story/llm';
import { writeFileSync } from 'node:fs';

const LIU = {
    id: '0xliu-sheng-chun',
    name: '柳生春',
    role: '小生',
    gender: '女',
    ageYears: 24,
    sagaName: '春雪社',
    sceneName: '後台妝閣',
    physicalFacts:
        '外表中性俊秀，眉眼英氣；台上一柄摺扇便能撩動滿堂春水的風流少年郎，台下清亮乾淨、會疼人。',
    attributes: { appearance: 88, constitution: 72, acuity: 82, disposition: 76 },
};

// Neutral-to-faintly-warm trigger: nothing dark in the材料 itself, so whatever
// colour the prose takes comes from the register, not the situation.
const TRIGGER =
    '散戲後的雲錦臺後台妝閣，燈還亮著。你對著鏡子卸妝，今晚《白蛇》唱得順，台下叫了三回好。' +
    '師姐蘇映雪掀簾進來，順手替你理了理被頭套壓亂的鬢角，說了句「今兒這場穩」。';

// Carried into all three so they narrate the SAME hidden feeling — only the colour
// differs. Kept the 黏著師姐 core (the 雙向暗戀 soil) but in a NEUTRAL register: an
// attachment, not a fear. A grief-laden hint would override the toneRegister knob and
// drag every version cold (the first A/B run proved素材-emotion can dominate colour).
const REL_HINTS = [
    '對蘇映雪——你是我師姐，從小一塊兒長大；台下我最黏的就是你。後台這些散戲的夜，' +
        '你替我理鬢角、遞一盞茶、說一句「今兒穩」，是我一天裡最踏實、也最捨不得的時候。',
];

interface Register {
    key: string;
    label: string;
    soul?: characterWorker.SagaSoul;
}

const REGISTERS: Register[] = [
    {
        key: 'baseline',
        label: '現狀（克制 · 預設,交付線不變）',
        soul: undefined,
    },
    {
        key: 'tender',
        label: '親暱姿態（只鬆克制 · 不加色調）',
        soul: { emotionalStance: 'tender' },
    },
    {
        key: 'tender-warm',
        label: '親暱姿態 + 暖亮色調（兩個旋鈕全開）',
        soul: {
            emotionalStance: 'tender',
            toneRegister:
                '這個戲班的底色是暖的。後台有市井煙火氣、有彼此打趣的熱乎勁、有過日子的人情；' +
                '暖光、笑鬧、被人惦記的踏實，都往濃裡寫，不是冷雨孤燈。',
        },
    },
];

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key in packages/web/.env.local — set POE/ZAI/ANTHROPIC.');
        process.exit(2);
    }
    const client = llmText.createTextClient({ kind: 'primary' });
    const out: { label: string; key: string; text: string }[] = [];

    for (const reg of REGISTERS) {
        const system = characterWorker.buildPovSystemPrompt(reg.soul, 'pov');
        const user = characterWorker.buildPovUserPrompt({
            character: LIU,
            triggerNarrative: TRIGGER,
            recentMemorySnippets: [],
            relationshipHints: REL_HINTS,
        });
        const t0 = Date.now();
        const res = await client.chat({
            model: client.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 2500,
            temperature: 0.9,
        });
        const text = res.text.trim();
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        out.push({ label: reg.label, key: reg.key, text });
        console.log(`\n${'='.repeat(72)}`);
        console.log(`【${reg.label}】 ${text.length} 字 · ${dt}s`);
        console.log('='.repeat(72));
        console.log(text);
    }

    const html = [
        '<!doctype html><meta charset="utf-8"><title>文筆色調 A/B · 柳生春</title>',
        '<style>body{background:#14110f;color:#e8ddd0;font:16px/1.85 "Songti TC",serif;max-width:1500px;margin:0 auto;padding:32px}',
        'h1{color:#f0c89a;font-size:20px}.row{display:flex;gap:20px;align-items:flex-start}',
        '.col{flex:1;background:#1d1916;border:1px solid #3a322a;border-radius:10px;padding:20px}',
        '.tag{color:#f0c89a;font-weight:700;font-size:15px;margin-bottom:4px}.meta{color:#8a7c6a;font-size:12px;margin-bottom:14px}',
        'p{margin:0 0 12px;white-space:pre-wrap}</style>',
        '<h1>文筆色調 A/B — 同一個柳生春、同一場後台卸妝、同一份對蘇映雪的心事，只換色調</h1>',
        '<div class="row">',
        ...out.map(
            (o) =>
                `<div class="col"><div class="tag">${esc(o.label)}</div>` +
                `<div class="meta">${o.text.length} 字</div>` +
                o.text
                    .split(/\n{2,}/)
                    .map((para) => `<p>${esc(para)}</p>`)
                    .join('') +
                '</div>',
        ),
        '</div>',
    ].join('\n');
    const dest = '/tmp/es-tone-ab.html';
    writeFileSync(dest, html, 'utf-8');
    console.log(`\n\nreport → ${dest}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
