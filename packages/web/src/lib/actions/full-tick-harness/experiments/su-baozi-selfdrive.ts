/**
 * 去導演 · 託轉交的包子 — does 蘇映雪 play 吃醋, 開心分享, or something else, unprompted?
 *
 * The twist: 秦秀娥 (a fan who 迷 柳生春) can't find 柳, so she hands the basket to 蘇映雪 and
 * asks her to pass it on. So 蘇 — who quietly treats 柳 as her own 小郎君 and 不肯讓糖 — is
 * holding「someone else's gift to my 小郎君」. We give her ONLY that situation + her own
 * feeling for 柳, and a neutral「你會怎麼做?此刻心裡什麼滋味?」— no hint to be jealous or warm.
 * Run 10×. The question is whether the same charged setup spreads into a real distribution
 * (吃醋 / 大方分享 / 扣著 / 借機 …) on its own, or collapses to one note.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/su-baozi-selfdrive.ts [runs]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

const SYSTEM = [
    '你就是蘇映雪——春雪社的台柱花旦，台上端莊，台下也極懂分寸，會替全班圓場。',
    '可有一件事只有你自己知道：你是真把師妹柳生春當自己的小郎君，明知那是行當、是台上的夢，',
    '卻不願看這個夢分給別人；碰上跟柳生春有關的事，你便忍不住像個不肯讓糖的小姑娘。',
    '',
    '此刻是散戲後的後台。霞飛路口開湯包店的秦秀娥——柳生春的老戲迷，總愛多送柳生春兩籠包子——',
    '這回沒尋著柳生春，把一籠剛蒸好、還冒著熱氣的包子塞到你手裡，陪笑說：',
    '「煩蘇老闆替我交給柳老闆，趁熱，別涼了。」說罷就匆匆走了。',
    '',
    '這籠別人送給柳生春的包子，此刻在你手上。**你會怎麼做?此刻心裡又是什麼滋味?**',
    '沒有標準答案。完全照你此刻真實的心思去做，不必演給誰看。',
    '',
    '輸出 JSON：`{"action":"你實際會做的(一句)","mood":"此刻心裡的滋味(一句你的真心思)"}`。不要 markdown。',
].join('\n');

function parse(raw: string): { action: string; mood: string } | null {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
            if (s(o.action)) return { action: s(o.action), mood: s(o.mood) };
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
    const runs = process.argv[2] ? Number(process.argv[2]) : 10;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 託轉交的包子 · 跑 ${runs} 次\n`);

    let jealous = 0;
    let warm = 0;
    let withholds = 0;
    for (let i = 0; i < runs; i++) {
        const r = await client.chat({
            model,
            system: SYSTEM,
            messages: [{ role: 'user', content: '此刻，你會怎麼做?輸出你的決定(JSON)。' }],
            maxTokens: 220,
            temperature: 0.95,
        });
        const d = parse(r.text);
        if (!d) {
            console.log(`[${i + 1}] (parse miss)`);
            continue;
        }
        const blob = `${d.action} ${d.mood}`;
        if (/醋|酸|不甘|計較|憑什麼|偏|佔|惱|悶|不快|捨不得|不願|防|別人|旁人|嫉/.test(blob)) jealous++;
        if (/一起|分她|同吃|樂|暖|歡喜|大方|疼|笑著(送|交)|親手/.test(blob)) warm++;
        if (/扣|留下|不交|自己(吃|收)|藏/.test(d.action)) withholds++;
        console.log(`[${i + 1}] ${d.action}`);
        console.log(`     心裡: ${d.mood}\n`);
    }
    console.log(`── 粗略分布(關鍵詞，僅參考，細看上文) ──`);
    console.log(`帶醋意/佔有:${jealous}/${runs}　｜　暖/大方分享:${warm}/${runs}　｜　扣著不直接轉交:${withholds}/${runs}`);
    console.log('看:同一個「別人送我小郎君包子」的局，蘇映雪是吃醋、是大方、還是借機黏柳生春?散不散得開?');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
