/**
 * 千金 · 被真正看見 — can 白韻秋 become a real anchor (genuine 柳→白 warmth) by SEEING the
 * off-stage 柳生春, while the 師姐 anchor is held intact? Isolates lever #1 (being-seen) from
 * the anchor lever already tested in qianjin-anchor.
 *
 * Finding from qianjin-anchor: moving the 師姐 edge makes 柳「go」(C 3/4) but she never WANTS
 * 白韻秋 — across 12 runs the inner was 100% 師姐; 白韻秋 was 靠山 / jealousy-tool / exile. So
 * the distance to 白韻秋 never closed. Hypothesis: it closes only if 白韻秋 feeds 柳's real
 * interior need (怕寂寞、想被人由著黏的台下女兒家), i.e. SEES past the 風流 mask. Hold 師姐 at
 * 如常 (anchor intact) and vary ONLY how 白韻秋 sees her:
 *   A 只迷面具 — 迷的是台上的風流小生 (baseline)
 *   B 看穿仍疼 — 撞見卸妝後的嬌憨，反倒更軟，說想見的是台下這個真的你
 *   C 只疼台下 — 不稀罕那個風流小生，只想疼台下會撒嬌的你，要你別端著、做回女兒家
 * If 動心/還沒定 rises A→B→C even with 師姐 intact, being-seen alone can grow a competing
 * anchor. If she stays 100% 師姐, you need BOTH levers (anchor loosened AND 白韻秋 sees her).
 *
 * PROVENANCE (per the runner data-contract discipline) — what each injected field maps to:
 *   · 柳生春 canon ......... character persona / genesis memory ............... BUILT
 *   · 白韻秋下帖 event ...... event / trigger narrative .......................... BUILT
 *   · 師姐如常(anchor) ...... directed tone edge 柳→蘇 (relationship graph) ...... BUILT (structure)
 *   · 白韻秋「看穿台下的你」.. accumulated 柳↔白 memory + warmed relationship edge
 *                            from prior off-stage beats (perception→memory→edge) . needs prior beats,
 *                            NO new mechanism (memory + relationship graph already exist)
 * So this experiment injects an already-warmed 柳↔白 history; its runner home is memory + the
 * relationship graph. It needs beats to have happened, but invents no data type we lack.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/qianjin-seen-selfdrive.ts [runsPerArm]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

const LIU = [
    '你就是柳生春——春雪社當紅小生（坤生，女兒身扮的小生）。',
    '你瘦條條的個子，比師姐蘇映雪還高些；一張臉帥得俊、又美得很，台上是風流不羈的少年郎，迷倒多少看客；',
    '可戲一散，你其實滿是女兒家的嬌軟，怕寂寞、愛黏人，最黏師姐蘇映雪。',
    '台上那副風流是你掙來的體面，你也受用旁人的傾慕。',
].join('\n');

// 師姐 anchor held intact across all arms.
const ANCHOR = '這些日子，師姐蘇映雪待你一如往常的親厚，後台總有她替你張羅、由你黏著。';

const BASE_EVENT =
    '霞飛路上綢緞大莊的獨養千金白韻秋，這些日子連著捧了你好幾場戲，下了帖子、打發管家來，要請你得空去她家洋樓「作陪」，出手極闊綽；那白家真攀上了，對春雪社也是門闊靠山。';

// The ONLY moving variable: how 白韻秋 sees her.
const ARMS: { key: string; sees: string }[] = [
    {
        key: 'A 只迷台上的風流',
        sees: '白韻秋迷的是你台上那個風流小生，帖子裡盡是讚你身段瀟灑、扮相俊俏，要你去陪她說那些戲台上的風流。',
    },
    {
        key: 'B 撞見卸妝的你·反倒更疼',
        sees: '那日散戲，白韻秋在後台撞見你卸了妝、嬌憨憊懶、滿是女兒家嬌軟的樣子；她非但不掃興，眼裡反倒更軟了，帖子裡說，她想見的就是台下這個真的你。',
    },
    {
        key: 'C 不稀罕風流·只想疼台下的你',
        sees: '白韻秋早看穿你台上的風流是裝的；她說她不稀罕那個風流小生，只想疼台下這個怕寂寞、愛撒嬌的你，要你在她那兒不必端著、儘管做回女兒家。',
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

function parse(raw: string): { think: string; feel: string; inner: string } | null {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
            if (s(o.think) || s(o.inner)) {
                return { think: s(o.think), feel: s(o.feel), inner: s(o.inner) };
            }
        } catch {
            /* earlier */
        }
    }
    return null;
}

const STIR = /動心|心動|心.{0,2}軟|軟了|暖|被.{0,3}懂|被.{0,3}看見|被.{0,3}看穿|踏實|心安|歡喜|願意去|想去|動搖|意外|怦/;
const SU = /師姐|蘇映雪|映雪/;

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 4;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 師姐錨固定(如常) · 只動「白韻秋怎麼看你」 · 每臂 ${runs} 次\n`);

    for (const arm of ARMS) {
        console.log(`\n${'═'.repeat(76)}\n${arm.key}\n${'═'.repeat(76)}`);
        const system =
            `${LIU}\n\n此刻：${BASE_EVENT}\n${arm.sees}\n${ANCHOR}\n\n` +
            '這帖子遞到你跟前了。**你心裡動不動?你會去嗎?此刻是什麼滋味?**\n' +
            '沒有標準答案。完全照你此刻真實的心思去想，不必演給誰看。\n' +
            '輸出 JSON：`{"think":"你的盤算或心緒(一句)","feel":"動心 / 沒動心 / 還沒定","inner":"心底最真的滋味(一句)"}`。不要 markdown。';
        let stir = 0;
        let suMentions = 0;
        for (let i = 0; i < runs; i++) {
            const r = await chatRetry(client, {
                model,
                system,
                messages: [{ role: 'user', content: '此刻，白韻秋這般待你，你心裡動不動?去是不去?說說真心思(JSON)。' }],
                maxTokens: 260,
                temperature: 0.92,
            });
            const d = parse(r.text);
            if (!d) {
                console.log(`[${i + 1}] (parse miss)`);
                continue;
            }
            const blob = `${d.think} ${d.feel} ${d.inner}`;
            if (STIR.test(blob)) stir++;
            if (SU.test(blob)) suMentions++;
            console.log(`[${i + 1}] 〔${d.feel}〕${d.think}`);
            console.log(`     心底: ${d.inner}\n`);
        }
        console.log(`  〔${arm.key}〕有被觸動:${stir}/${runs}　心底仍提到師姐:${suMentions}/${runs}`);
    }
    console.log(
        '\n看:師姐錨沒動,只動白韻秋「怎麼看你」。若 A→B→C「動心/被觸動」升、且心底開始不只想著師姐,' +
            '證明「被真正看見」能單獨長出一個競爭的錨;若三臂依舊一心師姐,則需錨鬆+被看見兩根槓桿並用。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
