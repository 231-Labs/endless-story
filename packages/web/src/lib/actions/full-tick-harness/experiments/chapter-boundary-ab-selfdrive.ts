/**
 * 章回切點 A/B 對照 — the ONLY difference between (a) settle-based and (b) time-budget-based chaptering is
 * WHEN you cut a chapter; the underlying events are identical. So freeze ONE beat-stream and weave it both
 * ways, then compare. The stream is built to stress the difference: a STANDING thread (柳蘇 暗戀, never
 * resolves), two RESOLVING threads (沈求角 / 蘇父催婚, resolve mid-stream), a NIGHT fast-forward (one long
 * beat = 8h), and a cross-scene MOVE (蘇父 walks into the 後台).
 *   (a) settle:  cut a chapter right after any event RESOLVES (chapters = complete dramatic units).
 *   (b) budget:  cut a chapter every fixed time-window; a long beat (night) is its own chapter; unresolved
 *                threads carry across the cut (chapters = time segments).
 * Compare: which reads better, which handles the never-resolving STANDING thread + the NIGHT + dense
 * dialogue better, does (a) leave a dangling no-resolution tail, does (b) cut mid-exchange.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/chapter-boundary-ab-selfdrive.ts
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const PERSONA: Record<string, string> = {
    蘇映雪: '春雪社台柱花旦，暗戀師妹柳生春(兩個女人、台上才敢)，娘家綢緞莊催她回去相親。',
    柳生春: '春雪社坤生(女子扮小生)，暗戀師姐蘇映雪，台上才能光明正大愛她。',
    田巧雲: '春雪社班主當家，精明持重也疼人。',
    沈巧玲: '剛搭班的新秀花旦，家裡等米下鍋、急著求個正經角兒。',
    蘇崇山: '蘇家綢緞莊家主、蘇映雪的父親，務實愛面子，逼女兒回家別在戲班蹉跎。',
};

// the SHARED event stream（同一套 event）。dt=此拍時長(分)；resolves=這拍讓某 event 收場。
interface Spec { dt: number; scene: string; ev: string; type: 'standing' | 'resolving'; char: string; hint: string; resolves: boolean; long?: boolean }
const SPECS: Spec[] = [
    { dt: 3, scene: '春雪社後台', ev: '柳蘇暗戀', type: 'standing', char: '蘇映雪', hint: '替柳生春理戲服肩頭、藉故多停一息', resolves: false },
    { dt: 2, scene: '春雪社後台', ev: '柳蘇暗戀', type: 'standing', char: '柳生春', hint: '借勢蹭一下師姐的手、眼波卻只敢在台詞裡漏', resolves: false },
    { dt: 5, scene: '蘇家綢緞莊', ev: '蘇父催婚', type: 'resolving', char: '蘇崇山', hint: '拍桌、命人傳話要映雪三日內回家相親', resolves: false },
    { dt: 4, scene: '春雪社後台', ev: '沈求角', type: 'resolving', char: '沈巧玲', hint: '紅著臉求田班主給個有名有姓的正經角兒、別再跑龍套', resolves: false },
    { dt: 3, scene: '春雪社後台', ev: '沈求角', type: 'resolving', char: '田巧雲', hint: '掂量後鬆口、給沈巧玲一個小旦的角兒', resolves: true },
    { dt: 2, scene: '春雪社後台', ev: '柳蘇暗戀', type: 'standing', char: '蘇映雪', hint: '聽見沈得了角、心裡為自己與柳的處境酸了一下', resolves: false },
    { dt: 4, scene: '蘇家綢緞莊', ev: '蘇父催婚', type: 'resolving', char: '蘇崇山', hint: '提筆寫下最後通牒的家書、要她不回就斷月例', resolves: false },
    { dt: 2, scene: '春雪社後台', ev: '柳蘇暗戀', type: 'standing', char: '柳生春', hint: '替師姐擋了穿堂風、一句台詞裡藏了心', resolves: false },
    { dt: 480, scene: '—', ev: '夜', type: 'resolving', char: '—', hint: '入夜，眾人各自歇下，這一整夜無話', resolves: true, long: true },
    { dt: 3, scene: '春雪社後台', ev: '柳蘇暗戀', type: 'standing', char: '蘇映雪', hint: '次日清晨對鏡，想起昨夜父親的家書與柳的擋風', resolves: false },
    { dt: 6, scene: '春雪社後台', ev: '蘇父催婚', type: 'resolving', char: '蘇崇山', hint: '親自到戲園後台、要當場把映雪拉回家(他從綢緞莊走來)', resolves: false },
    { dt: 5, scene: '春雪社後台', ev: '蘇父催婚', type: 'resolving', char: '蘇映雪', hint: '當著眾人面回絕父親：我不嫁、戲也不撂', resolves: true },
    { dt: 3, scene: '春雪社後台', ev: '柳蘇暗戀', type: 'standing', char: '柳生春', hint: '看著師姐回絕了父親、心裡疼惜又不敢說，只把這份情又往戲裡藏', resolves: false },
];

interface Beat { i: number; clock: number; scene: string; ev: string; type: string; char: string; text: string; dt: number; resolves: boolean; long?: boolean }

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g); if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown; for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } } throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const fmt = (b: Beat) => `${b.char === '—' ? '〔場〕' : b.char + '：'}${b.text}`;

async function genBeat(client: Client, model: string, sp: Spec, recent: string): Promise<string> {
    if (sp.char === '—') return sp.hint; // 場景旁白(夜)直接用
    const sys = `你就是${sp.char}。${PERSONA[sp.char] ?? ''}\n梨園的質地、含蓄、戲味、暖底色；不血腥狗血。寫你此刻**一個動作或一句話**(客觀一句、屬地)，照下面的意圖。意圖：${sp.hint}。\n只輸出那一句(純文字、不要 JSON、不要引號)。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【近來】\n${recent || '（開場）'}\n\n你這一拍：` }], maxTokens: 110, temperature: 0.88 });
    return s(r.text).replace(/^["「『]|["」』]$/g, '') || sp.hint;
}
async function weave(client: Client, model: string, beats: Beat[], label: string): Promise<string> {
    const body = beats.map((b) => `[${b.scene}/${b.ev}] ${fmt(b)}`).join('\n');
    const sys = '你是說書人。把下面這一段時間裡、幾個場景併發發生的事，**編織成一段章回**(梨園話本的口吻、暖、含蓄)。戲劇處寫細、過場/睡覺一句帶過、不同場景用「與此同時」「那廂」之類轉。忠於發生的事、別新增情節。輸出一段章回文字(不要標題、不要 JSON)。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `這一章涵蓋的素材(按時序)：\n${body}` }], maxTokens: 600, temperature: 0.85 });
    void label; return s(r.text);
}

// (a) settle：resolves 後切。 (b) budget：時間窗到切、long 自成一章、沒收的接下章。
function sliceSettle(beats: Beat[]): Beat[][] { const out: Beat[][] = []; let cur: Beat[] = []; for (const b of beats) { cur.push(b); if (b.resolves) { out.push(cur); cur = []; } } if (cur.length) out.push(cur); return out; }
function sliceBudget(beats: Beat[], windowMin: number, longTh = 240): Beat[][] {
    const out: Beat[][] = []; let cur: Beat[] = []; let acc = 0;
    for (const b of beats) {
        if (b.long || b.dt >= longTh) { if (cur.length) { out.push(cur); cur = []; acc = 0; } out.push([b]); continue; }
        cur.push(b); acc += b.dt;
        if (acc >= windowMin) { out.push(cur); cur = []; acc = 0; }
    }
    if (cur.length) out.push(cur); return out;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 章回切點 A/B · 同一串 event、兩種編織時機\n`);

    // 1) 生成共享 beat 流（只生成一次）
    const beats: Beat[] = []; let clock = 0; const recent: string[] = [];
    for (let i = 0; i < SPECS.length; i++) {
        const sp = SPECS[i]; const text = await genBeat(client, model, sp, recent.slice(-4).join('\n'));
        const b: Beat = { i, clock, scene: sp.scene, ev: sp.ev, type: sp.type, char: sp.char, text, dt: sp.dt, resolves: sp.resolves, long: sp.long };
        beats.push(b); clock += sp.dt; if (sp.char !== '—') recent.push(`${sp.char}：${text}`);
    }
    console.log(`── 共享 beat 流（${beats.length} 拍，總 ${clock} 分；柳蘇=standing 永不收、沈/蘇父=resolving、夜=快轉8h）──`);
    for (const b of beats) console.log(`  #${b.i} [+${b.dt}m|${b.scene}/${b.ev}${b.resolves ? '·收' : ''}] ${fmt(b)}`);

    // 2) 兩種切法
    const A = sliceSettle(beats);
    const B = sliceBudget(beats, 120);
    console.log(`\n切法 A(settle)：${A.length} 章，每章拍數 [${A.map((c) => c.length).join(', ')}]（含末尾無收的 standing 尾巴 ${A[A.length - 1].some((b) => !b.resolves) && !A[A.length - 1].some((b) => b.resolves) ? '✓有' : '—'}）`);
    console.log(`切法 B(budget 120m)：${B.length} 章，每章拍數 [${B.map((c) => c.length).join(', ')}]（夜自成一章、跨夜不切碎對話）`);

    // 3) 各自編織
    console.log(`\n${'═'.repeat(78)}\n【A · settle 切點】事件收場才斷章\n${'═'.repeat(78)}`);
    const aCh: string[] = []; for (let k = 0; k < A.length; k++) { const t = await weave(client, model, A[k], `A${k}`); aCh.push(t); console.log(`\n── 第 ${k + 1} 回 ──\n${t}`); }
    console.log(`\n${'═'.repeat(78)}\n【B · budget 切點】時間窗到就斷章\n${'═'.repeat(78)}`);
    const bCh: string[] = []; for (let k = 0; k < B.length; k++) { const t = await weave(client, model, B[k], `B${k}`); bCh.push(t); console.log(`\n── 第 ${k + 1} 回 ──\n${t}`); }

    // 4) 對照判讀
    const SOUL = '同一串事件，被兩種「何時斷章」的方式編成章回。A=事件收場才斷(章回是完整戲劇單元)；B=固定時段斷(章回是時間段、沒收的接下章)。比較各一句：(a)哪種讀起來章回更完整不突兀？(b)永不收的 standing 線(柳蘇暗戀)哪種處理得好(A 會不會拖著不斷/留尾巴、B 會不會把它自然分散)？(c)過夜快轉哪種更俐落？(d)會不會把熱對話切碎？(e)綜合哪種當預設較穩、為何。輸出 JSON：{"completeness":"A/B/各有","standingHandling":"A/B/各有","nightHandling":"A/B/各有","cutsMidScene":"A/B/都不/都會","recommend":"A/B","why":"一句"}。不要 markdown。';
    const jr = await chatRetry(client, { model, system: SOUL, messages: [{ role: 'user', content: `【A 章回】\n${aCh.map((c, i) => `第${i + 1}回：${c}`).join('\n\n')}\n\n【B 章回】\n${bCh.map((c, i) => `第${i + 1}回：${c}`).join('\n\n')}` }], maxTokens: 300, temperature: 0.3 });
    const j = parseObj(jr.text) ?? {};
    console.log(`\n${'═'.repeat(78)}\n判讀\n${'═'.repeat(78)}`);
    console.log(`完整度勝：${s(j.completeness)}　standing 處理勝：${s(j.standingHandling)}　過夜勝：${s(j.nightHandling)}　切碎熱對話：${s(j.cutsMidScene)}\n建議預設：${s(j.recommend)} —— ${s(j.why)}`);
    console.log(`\n看：同一串 event、只差切點。A 完整但可能被 standing 拖著不斷/留尾、B 穩定但可能切碎對話。挑一個當預設，或混(B 為主、剛好有 event 收就順勢斷)。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
