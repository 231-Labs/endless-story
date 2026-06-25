/**
 * 日常層 · 一籠包子 × 身心狀態 — does a varying STATE crack the distribution open?
 *
 * baozi-selfdrive showed canon 柳生春 collapsing to「自己少吃 + 轉給師姐」(too順 a setup, no
 * conflict). su-baozi showed that a setup WITH a conflict (佔有 vs 本分) spreads into a real
 * distribution on its own. The thesis: a varying daily-life STATE is what injects conflict
 * into an otherwise順 setup. Same 包子, same canon 柳生春 (still NO「怕胖」trait), only her
 * 此刻身心 changes — 餓得發慌 / 剛吃飽不饞 / 演砸了累垮心情堵. If 餓 makes her break and dither
 * (餓 vs 顧身形), 飽 makes her pass it on, 累垮 makes her dump it and ignore everyone, then
 * behaviour tracks STATE — and the daily layer is why a character is a living person.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/state-baozi-selfdrive.ts [runsPerState]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

const PERSONA = [
    '你就是柳生春——春雪社當紅小生，外表中性俊秀、眉眼英氣，台上一柄摺扇便能撩動滿堂春水的風流少年郎；',
    '台下其實溫柔、愛撒嬌，很黏師姐蘇映雪，對旁人也客氣周到。身形清瘦。',
    '',
    '此刻是散戲後的後台妝閣。霞飛路口開湯包店的秦秀娥——你的老戲迷，總愛多送你兩籠包子——',
    '剛把一籠剛蒸好、還冒著熱氣的包子塞進你手裡，說今兒多蒸了幾個，給你補補。',
    '此刻後台還有：師姐蘇映雪在隔壁妝閣卸妝；丑角賴金喜連趕了幾場戲，正累癱在條凳上。',
].join('\n');

const TAIL = [
    '',
    '**你會怎麼處置這籠包子?** 沒有標準答案。完全照你此刻真實的心思去做——餓不餓、累不累、',
    '在不在意身形、領不領這份情、會不會想到誰。就照「你這個人、此時此地」會做的去做，不必演給誰看。',
    '',
    '輸出 JSON：`{"action":"你實際會做的(一句)","why":"為什麼(一句)","mood":"此刻心裡(一句)"}`。不要 markdown。',
].join('\n');

const STATES: { key: string; label: string; line: string }[] = [
    {
        key: '餓',
        label: '餓得發慌',
        line: '你今兒從晌午就忙著趕妝、串場，水米沒沾幾口，這會兒散了戲，餓得前胸貼後背，胃裡一陣陣發空、發疼。',
    },
    {
        key: '飽',
        label: '剛吃飽不饞',
        line: '你散戲前剛在後台吃過師姐留的一碗銀耳羹，這會兒肚裡飽飽的，半點不饞，只覺得撐。',
    },
    {
        key: '累堵',
        label: '演砸了 · 累垮 · 心情堵',
        line: '你今晚那段「斷橋」沒使好，水袖甩脫了手，班主散戲時冷著臉、一句沒誇你；你心裡正堵得發慌，人也累垮了，只想癱著、誰也別理。',
    },
];

function parse(raw: string): { action: string; why: string; mood: string } | null {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
            if (s(o.action)) return { action: s(o.action), why: s(o.why), mood: s(o.mood) };
        } catch {
            /* earlier */
        }
    }
    return null;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 4;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 包子 × 身心狀態 · 每狀態跑 ${runs} 次\n`);

    for (const st of STATES) {
        console.log(`\n${'═'.repeat(76)}\n身心狀態 → ${st.label}\n${'═'.repeat(76)}`);
        const system = `${PERSONA}\n\n**此刻你的身心**：${st.line}\n${TAIL}`;
        let ate = 0;
        let passed = 0;
        for (let i = 0; i < runs; i++) {
            const r = await client.chat({
                model,
                system,
                messages: [{ role: 'user', content: '此刻，你會怎麼處置這籠包子?輸出你的決定(JSON)。' }],
                maxTokens: 240,
                temperature: 0.95,
            });
            const d = parse(r.text);
            if (!d) {
                console.log(`[${i + 1}] (parse miss)`);
                continue;
            }
            // crude tags: 大口/狼吞/吃了大半 vs 只嚐一口; 轉給人
            if (/狼吞|大口|吃了大半|全吃|連吃|風捲|塞了滿嘴|一連|好幾個|墊飽|填飽/.test(d.action)) ate++;
            if (/蘇映雪|師姐|映雪|金喜|賴師|龍套|大夥|夥計/.test(d.action)) passed++;
            console.log(`[${i + 1}] ${d.action}`);
            console.log(`     why: ${d.why}　｜　心裡: ${d.mood}\n`);
        }
        console.log(`  〔${st.label}〕大口吃/吃多:${ate}/${runs}　轉給他人:${passed}/${runs}`);
    }
    console.log(
        '\n看:三種身心狀態下,行為是否分開——餓的破戒/狼吞/掙扎,飽的順手轉送,累堵的隨手一擱誰也不理。' +
            '若行為跟著狀態走,衝突(餓vs顧身形)就是分布的引擎,日常層=活人的關鍵。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
