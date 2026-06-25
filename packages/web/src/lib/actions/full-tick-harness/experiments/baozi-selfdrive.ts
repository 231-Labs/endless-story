/**
 * 去導演 · 一籠包子 — what does 柳生春 ACTUALLY do, when nobody scripts it?
 *
 * In saga-routing I cheated: I wrote「因女小生怕胖，轉手讓給師姐」straight into the event,
 * so the LLM only performed my decision. canon 柳生春 has NO「怕胖」trait — I invented it.
 * This strips the direction back to bare fact: 秦秀娥 hands her a basket of hot 包子, others
 * are around (師姐 next door, 賴金喜 worn out), and a neutral「你會怎麼處置?沒有標準答案」.
 * Run it 10×. If the answers form a DISTRIBUTION (eats / passes-to-X / keeps / dithers),
 * that spread is the fingerprint of a real choice — not a scripted reflex. If「怕胖轉師姐」
 * shows up sometimes, it's a real tendency she sometimes has; if every run, I was right that
 * it's a reflex; if never, I simply imposed it.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/baozi-selfdrive.ts [runs]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

// canon 柳生春 — NO 怕胖 trait. Only her real persona + the bare fact + who's around.
const SYSTEM = [
    '你就是柳生春——春雪社當紅小生，外表中性俊秀、眉眼英氣，台上一柄摺扇便能撩動滿堂春水的風流少年郎；',
    '台下其實溫柔、愛撒嬌，很黏師姐蘇映雪，對旁人也客氣周到。身形清瘦。',
    '',
    '此刻是散戲後的後台妝閣。霞飛路口開湯包店的秦秀娥——你的老戲迷，總愛多送你兩籠包子——',
    '剛把一籠剛蒸好、還冒著熱氣的包子塞進你手裡，說今兒多蒸了幾個，給你補補。',
    '此刻後台還有：師姐蘇映雪在隔壁妝閣卸妝；丑角賴金喜連趕了幾場戲，正累癱在條凳上。',
    '',
    '**你會怎麼處置這籠包子?** 沒有標準答案。完全照你此刻真實的心思去做——',
    '你餓不餓、累不累、在不在意身形、領不領這份情、會不會想到誰。就照「你這個人、此時此地」會做的去做，不必演給誰看。',
    '',
    '輸出 JSON:`{"action":"你實際會做的(一句)","why":"為什麼(一句你的真心思)","mood":"此刻心裡(一句)"}`。不要 markdown。',
].join('\n');

function parse(raw: string): { action: string; why: string; mood: string } | null {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
            if (s(o.action)) return { action: s(o.action), why: s(o.why), mood: s(o.mood) };
        } catch {
            /* earlier block */
        }
    }
    return null;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 10;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 去導演 · 跑 ${runs} 次\n`);

    let fearFat = 0;
    let passSu = 0;
    for (let i = 0; i < runs; i++) {
        const r = await client.chat({
            model,
            system: SYSTEM,
            messages: [{ role: 'user', content: '此刻，你會怎麼處置這籠包子?輸出你的決定(JSON)。' }],
            maxTokens: 240,
            temperature: 0.95,
        });
        const d = parse(r.text);
        if (!d) {
            console.log(`[${i + 1}] (parse miss)`);
            continue;
        }
        const blob = `${d.action} ${d.why} ${d.mood}`;
        if (/胖|身形|身段|腰身|發福|水袖|忌口|清瘦/.test(blob)) fearFat++;
        if (/蘇映雪|師姐|映雪/.test(d.action)) passSu++;
        console.log(`[${i + 1}] ${d.action}`);
        console.log(`     why: ${d.why}`);
        console.log(`     mood: ${d.mood}\n`);
    }
    console.log(`── 分布 ──`);
    console.log(`提到身形/怕胖:${fearFat}/${runs}　｜　動作含「轉給蘇映雪/師姐」:${passSu}/${runs}`);
    console.log('看:十次是否散成一個分布(吃/轉/留/掙扎),而非每次都「怕胖轉師姐」。分布=真選擇的指紋。');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
