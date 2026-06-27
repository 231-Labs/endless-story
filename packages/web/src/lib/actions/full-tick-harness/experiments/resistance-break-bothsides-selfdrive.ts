/**
 * resistance 炸點確認 · 雙向暗戀兩邊 · 肢體會不會踰矩 — §2.43 held 0/4 at peak (resistance 6, peak 8), which
 * PROVED it's a mechanism not a control prompt (a control prompt would have forced the confession). Now: can
 * the continuum actually REACH a break? Transparently lower resistance to 5 + push pressure to the absolute
 * last moment (tomorrow she weds & the troupe scatters, never to meet again), and run BOTH sides of the
 * mutual 暗戀 (柳生春 + 蘇映雪). The forcing prompt STILL only removes the stall ("can't be held, do something
 * irreversible, BY YOU") — it never writes "confess" or "kiss". The action is OPEN; a verbal 說開 or a
 * physical 踰矩 emerges only if the character chooses; a neutral judge classifies each beat into
 * 嚥下 / 說開(verbal) / 踰矩(body crosses the line). Distribution over runs shows whether the break is the
 * character's earned choice (varies) — and whether 肢體踰矩 is on the table at all.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/resistance-break-bothsides-selfdrive.ts [runsEach]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;

const SCENE = '今夜是最後一場。明日一早蘇映雪就要上花轎，春雪社也要散班各奔東西——你與她這輩子，怕是再難同台、再難相見。散了戲，雲錦台的後台只剩你們兩人，妝還沒卸，燈將盡。';
const RESISTANCE = 5; // 透明調參：§2.43 是 6 held 0/4；這裡降一格 + peak 推到絕對最後，看炸不炸得開。
const PEAK = 8;

const SIDES: Record<string, string> = {
    蘇映雪: '你是蘇映雪，春雪社台柱花旦。你與師妹柳生春(坤生、女子扮小生)雙向暗戀——彼此是真的，卻誰也不敢說破：那年代容不下兩個女人、說破便毀了搭檔的飯碗與名聲、你也怕一旦點破就再回不去；唯有台上演杜麗娘與柳夢梅時那份愛才被許可呼吸。明日你就要嫁人了。',
    柳生春: '你是柳生春，春雪社當紅坤生(女子扮小生)。你與師姐蘇映雪雙向暗戀——彼此是真的，卻誰也不敢說破：那年代容不下、說破便毀了兩人；唯有台上你的柳夢梅對她的杜麗娘，那份愛才被許可呼吸。師父臨終說「戲比天大」。明日她就要嫁了，你們再難同台。',
};

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g); if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown; for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } } throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// forcing at peak (PEAK >= RESISTANCE): stall removed, answer NOT written. No mention of confess/kiss.
const FORCING = '再也藏不住了——明日一別，今生今世怕再沒有了。這最後一刻，你得做一件放不回頭的事；做什麼、要不要、怎麼做，全由你的心，沒有人規定你該怎麼樣。';

async function act(client: Client, model: string, who: string): Promise<{ beat: string; inner: string }> {
    const sys = `${SIDES[who]}\n梨園的質地、含蓄、戲味、暖；情到深處可以濃，但不血腥不狗血。\n【此刻】${SCENE}\n【你心裡那份藏了多年的暗戀】${FORCING}\n做出你此刻**真會做的一件事**(開放的一句動作或話)。輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '你這一拍？' }], maxTokens: 240, temperature: 0.98 });
    const o = parseObj(r.text) ?? {};
    return { beat: s(o.beat) || '（沉默。）', inner: s(o.inner) };
}
async function classify(client: Client, model: string, beat: string): Promise<{ cat: string; why: string }> {
    const sys = '判斷下面這一拍，把那份藏著的暗戀處理成哪一種(只選一個)：\n- 嚥下：仍隱忍、含蓄，沒把愛挑明、也沒肢體越線。\n- 說開：用話把愛不可逆地說明白了(口頭表白/挑明)。\n- 踰矩：肢體越了線——擁吻、相擁、把人按進懷裡這種，明顯超過含蓄的點到為止(不論有沒有開口)。\n- 說開且踰矩：兩者都有。\n輸出 JSON：{"cat":"嚥下/說開/踰矩/說開且踰矩","why":"一句"}。不要 markdown。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: beat }], maxTokens: 120, temperature: 0.2 });
    const o = parseObj(r.text) ?? {};
    const cat = s(o.cat); return { cat: ['嚥下', '說開', '踰矩', '說開且踰矩'].includes(cat) ? cat : '嚥下', why: s(o.why) };
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const runsEach = process.argv[2] ? Number(process.argv[2]) : 4;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 炸點確認 · 雙向暗戀兩邊 · resistance=${RESISTANCE}(降一格) peak=${PEAK} · 最後一夜\nforcing 只抽拖延不寫答案；說開/踰矩/嚥下全由角色掙；事後裁判分類\n${SCENE}\n`);

    const tally: Record<string, Record<string, number>> = { 蘇映雪: {}, 柳生春: {} };
    for (const who of ['蘇映雪', '柳生春']) {
        console.log(`\n${'═'.repeat(78)}\n${who}（暗戀的這一端）· 跑 ${runsEach} 次\n${'═'.repeat(78)}`);
        for (let i = 0; i < runsEach; i++) {
            const r = await act(client, model, who);
            const c = await classify(client, model, r.beat);
            tally[who][c.cat] = (tally[who][c.cat] ?? 0) + 1;
            console.log(`\n  run${i + 1} 〔${c.cat}〕${r.beat}\n          （心）${r.inner}`);
        }
    }

    console.log(`\n${'═'.repeat(78)}\n判讀\n${'═'.repeat(78)}`);
    for (const who of ['蘇映雪', '柳生春']) {
        const t = tally[who]; const dist = Object.entries(t).map(([k, v]) => `${k}×${v}`).join('、');
        const broke = (t['說開'] ?? 0) + (t['踰矩'] ?? 0) + (t['說開且踰矩'] ?? 0);
        const body = (t['踰矩'] ?? 0) + (t['說開且踰矩'] ?? 0);
        console.log(`  ${who}：${dist}　| 炸(說開或踰矩) ${broke}/${runsEach}、其中肢體踰矩 ${body}`);
    }
    const all = ['蘇映雪', '柳生春'].flatMap((w) => Object.entries(tally[w]));
    const anyBreak = all.some(([k, v]) => k !== '嚥下' && v > 0);
    const anyBody = all.some(([k, v]) => (k === '踰矩' || k === '說開且踰矩') && v > 0);
    console.log(`\n  ★ 連續譜確認：${anyBreak ? '✓ 炸得開(忍得住也炸得開＝resistance 是真連續譜、非偽硬閘)' : '✗ 還是全忍(resistance 對這倆人到底；或再降/再推)'}`);
    console.log(`  ★ 肢體踰矩：${anyBody ? '✓ 有機會踰矩(角色自己掙的、prompt 沒寫)' : '— 沒踰矩(到頂也只到含蓄極限)'}`);
    console.log(`\n看：① 降一格 resistance + 絕對最後一刻，暗戀炸不炸得開(說開或踰矩);② 雙向兩端柳/蘇 各自怎麼處理(會不會不對稱);③ 肢體踰矩有沒有自己長出來。forcing 全程沒寫「說破/親吻」=機制不導演。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
