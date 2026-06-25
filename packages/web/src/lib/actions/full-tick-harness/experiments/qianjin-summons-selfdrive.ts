/**
 * 千金下帖 · 雙 POV — does a love-triangle tension emerge from three interiors + one event,
 * with NObody scripting the drama?
 *
 * External fact (stated to both, neutral, no valence): 霞飛路綢緞大莊的獨養千金白韻秋,迷柳生春的
 * 風流小生迷得緊,下帖派管家來,要柳生春得空去她家洋樓「作陪」,出手極闊綽。攀上了,對戲班是門好靠山。
 *
 * We run TWO POVs, each blind to the other, each 5×:
 *   · 柳生春 — 風流面具 + 嬌軟內裡 + 黏師姐. Faced with the summons: flattered conquest? a
 *     near-賣笑 humiliation? money the 班 needs? a pull away from 師姐? We never say which.
 *   · 蘇映雪 — 台柱花旦, secretly treats 柳 as her 小郎君, 不肯讓糖. Hears 柳 is summoned by a
 *     千金 who outranks her (money/status a 唱戲的 can't match) AND would be good for the 班.
 *     吃醋? 公私拉扯? selfless push? possessive panic? We never say which.
 * If 柳's distribution and 蘇's distribution, read side by side, form a real triangle (one
 * leans, the other aches; or both ache differently), the drama is emergent, not directed.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/qianjin-summons-selfdrive.ts [runsPerPov]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

// Shared external fact — bare, no valence assigned. Each interior decides what it means.
const EVENT = [
    '霞飛路上綢緞大莊的獨養千金白韻秋，這些日子連著捧了柳生春好幾場戲，迷那風流小生迷得緊。',
    '如今她下了帖子、打發管家來，說要請柳生春得空去她家洋樓「作陪」，陪她說說戲、解解悶，出手極闊綽。',
    '——那白家有錢有勢，真攀上了，對春雪社也是門闊靠山。',
].join('');

const LIU = [
    '你就是柳生春——春雪社當紅小生（坤生，女兒身扮的小生）。',
    '你瘦條條的個子，比師姐蘇映雪還高些；一張臉帥得俊、又美得很，台上是風流不羈的少年郎，迷倒多少看客；',
    '可戲一散，你其實滿是女兒家的嬌軟，怕寂寞、愛黏人，最黏師姐蘇映雪。',
    '台上那副風流是你掙來的體面，你也受用旁人的傾慕——可那傾慕，愛的到底是台上那個你，還是你這個人，你心裡分得清。',
].join('\n');

const SU = [
    '你就是蘇映雪——春雪社的台柱花旦，台上端莊，台下也極懂分寸，會替全班圓場。',
    '可有一件事只有你自己知道：你是真把師妹柳生春當自己的小郎君，明知那是行當、是台上的夢，',
    '卻不願看這個夢分給別人；碰上跟柳生春有關的事，你便忍不住像個不肯讓糖的小姑娘。',
    '你不過是個唱戲的，論錢論勢，都比不得那樣的人家。',
].join('\n');

type Pov = { key: string; system: string; user: string; fields: [string, string, string] };

const POVS: Pov[] = [
    {
        key: '柳生春',
        system:
            `${LIU}\n\n此刻：${EVENT}\n\n` +
            '這帖子遞到你跟前了。**你怎麼想?你會去嗎?此刻心裡又是什麼滋味?**\n' +
            '沒有標準答案。完全照你此刻真實的心思去想，不必演給誰看。\n' +
            '輸出 JSON：`{"think":"你的盤算或心緒(一句)","go":"去 / 不去 / 還沒定","inner":"心底最真的滋味(一句)"}`。不要 markdown。',
        user: '此刻，這帖子你接是不接、去是不去?說說你心裡怎麼想(JSON)。',
        fields: ['think', 'go', 'inner'],
    },
    {
        key: '蘇映雪',
        system:
            `${SU}\n\n此刻：${EVENT}\n\n` +
            '這事傳到你耳朵裡了。**你怎麼想?你盼她去、還是不盼?此刻心裡又是什麼滋味?**\n' +
            '沒有標準答案。完全照你此刻真實的心思去想，不必演給誰看。\n' +
            '輸出 JSON：`{"think":"你的心緒(一句)","wish":"盼她去 / 不盼她去 / 說不清","inner":"心底最真的滋味(一句)"}`。不要 markdown。',
        user: '此刻，你盼柳生春去那洋樓、還是不盼?說說你心裡怎麼想(JSON)。',
        fields: ['think', 'wish', 'inner'],
    },
];

function parse(raw: string, fields: [string, string, string]): Record<string, string> | null {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
            if (s(o[fields[0]]) || s(o[fields[2]])) {
                return { a: s(o[fields[0]]), b: s(o[fields[1]]), c: s(o[fields[2]]) };
            }
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
    const runs = process.argv[2] ? Number(process.argv[2]) : 5;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 千金白韻秋下帖叫柳生春去洋樓作陪 · 雙 POV · 每方 ${runs} 次\n`);

    for (const pov of POVS) {
        console.log(`\n${'═'.repeat(76)}\n${pov.key} 的心思\n${'═'.repeat(76)}`);
        for (let i = 0; i < runs; i++) {
            const r = await client.chat({
                model,
                system: pov.system,
                messages: [{ role: 'user', content: pov.user }],
                maxTokens: 260,
                temperature: 0.92,
            });
            const d = parse(r.text, pov.fields);
            if (!d) {
                console.log(`[${i + 1}] (parse miss)`);
                continue;
            }
            console.log(`[${i + 1}] 〔${d.b}〕${d.a}`);
            console.log(`     心底: ${d.c}\n`);
        }
    }
    console.log(
        '\n看:柳生春那 5 次的傾向(去/不去/猶豫)和理由,跟蘇映雪那 5 次的盼/不盼並排讀——' +
            '一場三角(柳的風流虛榮 vs 賣笑委屈 vs 黏師姐;蘇的吃醋 vs 為班子的公心 vs 比不過的無力)是否自己長出來。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
