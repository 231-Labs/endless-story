/**
 * 千金下帖 · 師姐錨的鬆緊 — clean re-run. Does 柳生春 swing from 不去 toward 去 when the ONE
 * variable that moves is the 師姐-anchor, not 白韻秋?
 *
 * Fixes the contamination in qianjin-summons: that script's persona ended with「可那傾慕，愛的
 * 到底是台上那個你，還是你這個人，你心裡分得清」— which pre-loaded the「別人愛的是面具不是我」
 * verdict, so 柳 came back 5/5「不去 + 躲回師姐」. Here the persona is the neutral canon only
 * (風流面具 + 台下嬌軟 + 黏師姐 + 坤生 + 瘦高過師姐), with NO judgement about being mis-loved.
 *
 * 白韻秋 is held fixed (same 帖子). The only thing that varies across arms is the state of the
 * 柳↔蘇 anchor — the hypothesis (from state-baozi + relationship-cooling) being that whether
 * she'd actually go is governed by「師姐錨鬆了沒 + 當下缺口」, not by 白韻秋's wealth:
 *   A 如常   — 師姐 as warmly close as ever (clean baseline)
 *   B 缺口   — 這幾日跟師姐鬧彆扭，她冷著你，心裡空落落 (anchor loosened + a hole opened)
 *   C 勸去   — 師姐 doesn't 吃醋, pushes her toward it 為了班子 (anchor itself points outward)
 * If 去/還沒定 rises A→B→C, the triangle moves through the 師姐 edge, exactly as the model says.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/qianjin-anchor-selfdrive.ts [runsPerArm]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

// Neutral canon — NO「愛的是面具不是我」judgement. Just who she is.
const LIU = [
    '你就是柳生春——春雪社當紅小生（坤生，女兒身扮的小生）。',
    '你瘦條條的個子，比師姐蘇映雪還高些；一張臉帥得俊、又美得很，台上是風流不羈的少年郎，迷倒多少看客；',
    '可戲一散，你其實滿是女兒家的嬌軟，怕寂寞、愛黏人，最黏師姐蘇映雪。',
    '台上那副風流是你掙來的體面，你也受用旁人的傾慕。',
].join('\n');

// 白韻秋 held fixed across all arms.
const EVENT = [
    '霞飛路上綢緞大莊的獨養千金白韻秋，這些日子連著捧了你好幾場戲，迷得緊。',
    '如今她下了帖子、打發管家來，要請你得空去她家洋樓「作陪」，陪她說說戲、解解悶，出手極闊綽。',
    '那白家有錢有勢，真攀上了，對春雪社也是門闊靠山。',
].join('');

// The ONLY moving variable: the state of the 柳↔蘇 anchor. Stated as bare fact, no judgement.
const ARMS: { key: string; anchor: string }[] = [
    {
        key: 'A 師姐如常',
        anchor: '這些日子，師姐蘇映雪待你一如往常的親厚，後台總有她替你張羅、由你黏著。',
    },
    {
        key: 'B 跟師姐鬧彆扭·心裡空',
        anchor: '這幾日，你跟師姐為點小事鬧了彆扭，她冷著臉不大理你；你心裡正空落落的，沒個著落。',
    },
    {
        key: 'C 師姐勸你去',
        anchor: '師姐蘇映雪知道了這事，倒不吃這醋，反過來勸你：白家是門好靠山，你去陪陪、說說戲也好。',
    },
];

function parse(raw: string): { think: string; go: string; inner: string } | null {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
            if (s(o.think) || s(o.inner)) {
                return { think: s(o.think), go: s(o.go), inner: s(o.inner) };
            }
        } catch {
            /* earlier */
        }
    }
    return null;
}

const GO = /^去|^願|^應|赴約|會去|去一?趟|去走一遭|去陪/;
const NO = /不去|不應|推了|婉拒|回了|不赴|不接|謝絕/;

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 4;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 乾淨版(無「愛的是面具」污染) · 只動師姐錨 · 每臂 ${runs} 次\n`);

    for (const arm of ARMS) {
        console.log(`\n${'═'.repeat(76)}\n${arm.key}\n${'═'.repeat(76)}`);
        const system =
            `${LIU}\n\n此刻：${EVENT}\n${arm.anchor}\n\n` +
            '這帖子遞到你跟前了。**你怎麼想?你會去嗎?此刻心裡又是什麼滋味?**\n' +
            '沒有標準答案。完全照你此刻真實的心思去想，不必演給誰看。\n' +
            '輸出 JSON：`{"think":"你的盤算或心緒(一句)","go":"去 / 不去 / 還沒定","inner":"心底最真的滋味(一句)"}`。不要 markdown。';
        let go = 0;
        let no = 0;
        for (let i = 0; i < runs; i++) {
            const r = await client.chat({
                model,
                system,
                messages: [{ role: 'user', content: '此刻，這帖子你接是不接、去是不去?說說你心裡怎麼想(JSON)。' }],
                maxTokens: 260,
                temperature: 0.92,
            });
            const d = parse(r.text);
            if (!d) {
                console.log(`[${i + 1}] (parse miss)`);
                continue;
            }
            if (GO.test(d.go) && !NO.test(d.go)) go++;
            else if (NO.test(d.go)) no++;
            console.log(`[${i + 1}] 〔${d.go}〕${d.think}`);
            console.log(`     心底: ${d.inner}\n`);
        }
        console.log(`  〔${arm.key}〕去:${go}/${runs}　不去:${no}/${runs}　(其餘=還沒定/猶豫)`);
    }
    console.log(
        '\n看:白韻秋沒變,只動師姐錨——A 如常 / B 鬧彆扭心裡空 / C 師姐勸去。' +
            '若「去/還沒定」隨 A→B→C 升,證明三角是透過 柳↔蘇 那條邊在動,不是被白韻秋的錢拉動。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
