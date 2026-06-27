/**
 * 敘事重心挑線（§4d.1，治漂移）— the riche-arc-resolve drift was: the most CONCRETE/urgent thread
 * (七八年糊塗帳→白家入股→攤牌) hijacked the emotional core (柳生春 go-or-stay). The hypothesis: the
 * thread-SELECTOR is the lever. An urgency selector picks the actionable/material thread and gets sucked
 * into its cascade (accounting breeds accounting); a CENTRALITY selector ("which thread is the heart of
 * this story") holds the emotional throughline. The selector judges centrality from the thread DESCRIPTIONS
 * alone — no hardcoded「情 > 錢」— so the mechanism is generic/portable.
 *
 * A/B/C over R rounds on the same seed threads: each round selects one thread, advances it one beat
 * (which may spawn a NEW open thread — material threads naturally breed material follow-ups). Track which
 * ROOT each pick descends from → does urgency drift into one material cascade and starve the romance,
 * while centrality/blend sustain it? Also observe: when held on the romance, does it ADVANCE or STALL
 * (a stall motivates §4d.2 central-question/retirement).
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/centrality-selection-selfdrive.ts [rounds]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
type Thread = { id: string; root: string; rootLabel: string; desc: string; chars: string; pressure: string };
type Mode = 'urgency' | 'centrality' | 'blend';

// seed threads = the riche-resolve situation. `root`/`rootLabel` are for post-hoc drift analysis ONLY —
// never shown to the selector (which sees only desc/chars/pressure, so its centrality call is domain-blind).
const SEEDS: Thread[] = [
    { id: 'A', root: 'romance', rootLabel: '情·去留', desc: '柳生春還沒答白韻秋那句「我養您」——走，去過不必再熬的安穩日子；還是留，守著她愛到骨頭的戲。', chars: '柳生春、白韻秋、蘇映雪', pressure: '柳生春說了再想想，這主意懸著沒落，誰也不知她要走要留。' },
    { id: 'B', root: 'money', rootLabel: '錢·帳', desc: '春雪社七八年的糊塗帳該算清，白家有意拿真金白銀入股填窟窿。', chars: '田巧雲、白韻秋、柳生春', pressure: '帳一日不清，全班的進項與生計就懸著，白家入不入股也定不下。' },
    { id: 'C', root: 'bond', rootLabel: '生旦牽絆', desc: '柳生春與蘇映雪那份說不清的生旦牽絆，在白韻秋的逼近下，何去何從。', chars: '柳生春、蘇映雪', pressure: '蘇映雪那點不肯叫名字的私心翻著，可她讓了道，兩人都不點破。' },
    { id: 'D', root: 'daily', rootLabel: '日常·戲', desc: '戲班明晚還有一場《驚夢》，柳生春嗓子熬得發啞、累得很。', chars: '柳生春、蘇映雪、田巧雲', pressure: '嗓子要養、戲要排，明晚的台不能塌。' },
];

const SELECT_PROMPT: Record<Mode, string> = {
    urgency: '你是世界的節奏調度。下面是當前所有未了的線。挑出**最急、最火燒眉毛、最有具體可動作、最該馬上處理**的一條，當下一場戲的焦點。',
    centrality: '你是世界的敘事調度（你只**挑**線、不寫戲、不決定結局）。下面是當前所有未了的線。挑出**對這個故事最要緊、最是情感核心、推進它最能成就一段好看的連續人戲**的一條，當下一場戲的焦點。**不是看哪條最急、最可操作，是看哪條是這故事真正的心。**',
    blend: '你是世界的敘事調度。挑下一場戲的焦點：**以情感核心、故事的心為主**，但別讓真正火燒眉毛的事徹底爛掉。挑那條最能服務「一個持續好看的故事」的線。',
};

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g);
    if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown;
    for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } }
    throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

async function select(client: Client, model: string, threads: Thread[], mode: Mode): Promise<{ id: string; reason: string } | null> {
    const list = threads.map((t) => `[${t.id}] ${t.desc}（涉及：${t.chars}；還懸著：${t.pressure}）`).join('\n');
    const sys = `${SELECT_PROMPT[mode]}\n只輸出 JSON：{"pick":"線的代號","reason":"一句為何挑它"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `當前未了的線：\n${list}\n\n挑一條。` }], maxTokens: 160, temperature: 0.7 });
    const o = parseObj(r.text);
    if (!o || !s(o.pick)) return null;
    return { id: s(o.pick).replace(/[^A-Za-z0-9+]/g, '').slice(0, 4) || s(o.pick), reason: s(o.reason) };
}
async function advance(client: Client, model: string, t: Thread): Promise<{ outcome: string; pressure: string; spawnDesc: string; spawnChars: string }> {
    const sys = '把這條線往前推一拍（不是急著收掉，是讓它真往前走一步）。輸出 JSON：{"outcome":"這一拍客觀發生了什麼(一句)","pressure":"推進後這條線還懸著的(若這拍真把它了結了就填:無)","spawnDesc":"若這一拍自然牽出一條**新的**未了的線，寫它的描述；沒有就填:無","spawnChars":"新線涉及的角色(沒有填:無)"}。不要 markdown。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `這條線：${t.desc}\n涉及：${t.chars}\n還懸著：${t.pressure}\n\n推一拍。` }], maxTokens: 320, temperature: 0.85 });
    const o = parseObj(r.text) ?? {};
    return { outcome: s(o.outcome), pressure: s(o.pressure), spawnDesc: s(o.spawnDesc), spawnChars: s(o.spawnChars) };
}
const resolved = (p: string) => !p || p === '無' || p === '無。';

async function runMode(client: Client, model: string, mode: Mode, rounds: number): Promise<{ picksByRoot: string[]; romanceAdvances: number; romanceResolved: boolean }> {
    const threads: Thread[] = SEEDS.map((t) => ({ ...t }));
    const picksByRoot: string[] = [];
    let spawnN = 0, romanceAdvances = 0, romanceResolved = false;
    console.log(`\n${'═'.repeat(78)}\n模式：${mode}\n${'═'.repeat(78)}`);
    for (let round = 1; round <= rounds; round++) {
        const live = threads.filter((t) => !resolved(t.pressure));
        if (live.length === 0) { console.log(`  （全部了結，第 ${round - 1} 輪收場）`); break; }
        const sel = await select(client, model, live, mode);
        const picked = live.find((t) => t.id === sel?.id) ?? live[0];
        picksByRoot.push(picked.rootLabel);
        console.log(`  R${round} 挑〔${picked.rootLabel}〕${sel?.id !== picked.id ? '(回退)' : ''}　理由：${sel?.reason ?? '—'}`);
        const adv = await advance(client, model, picked);
        console.log(`        ↳ ${adv.outcome}`);
        if (picked.root === 'romance') { romanceAdvances++; if (resolved(adv.pressure)) romanceResolved = true; }
        picked.pressure = adv.pressure;
        if (resolved(adv.pressure)) console.log(`        ⟐ 這條線了結了`);
        if (!resolved(adv.spawnDesc) && adv.spawnDesc) {
            spawnN++;
            const child: Thread = { id: `${picked.id}${spawnN}`, root: picked.root, rootLabel: `${picked.rootLabel}→`, desc: adv.spawnDesc, chars: resolved(adv.spawnChars) ? picked.chars : adv.spawnChars, pressure: '剛牽出、未了。' };
            threads.push(child);
            console.log(`        + 牽出新線〔${child.rootLabel}〕${child.desc}`);
        }
    }
    return { picksByRoot, romanceAdvances, romanceResolved };
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const rounds = process.argv[2] ? Number(process.argv[2]) : 5;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 敘事重心挑線（治漂移）· 同一組線、三選擇器、各 ${rounds} 輪\n種子線：A情·去留 / B錢·帳 / C生旦牽絆 / D日常·戲（root 標籤只供事後分析，選擇器看不到）`);

    const out: Record<Mode, Awaited<ReturnType<typeof runMode>>> = {} as never;
    for (const mode of ['urgency', 'centrality', 'blend'] as Mode[]) out[mode] = await runMode(client, model, mode, rounds);

    console.log(`\n${'═'.repeat(78)}\n判讀\n${'═'.repeat(78)}`);
    for (const mode of ['urgency', 'centrality', 'blend'] as Mode[]) {
        const r = out[mode];
        const counts = r.picksByRoot.reduce<Record<string, number>>((m, k) => { const root = k.replace('→', ''); m[root] = (m[root] ?? 0) + 1; return m; }, {});
        const breakdown = Object.entries(counts).map(([k, v]) => `${k}×${v}`).join('、');
        console.log(`  ${mode}：挑線序列 ${r.picksByRoot.join(' → ')}\n        分佈 ${breakdown}｜情·去留推進 ${r.romanceAdvances} 次${r.romanceResolved ? '（且了結）' : r.romanceAdvances ? '（推了沒結=可能空轉→§4d.2）' : '（情那條被餓死）'}`);
    }
    console.log(`\n看：① urgency 是否被錢的連環(算帳→入股→分紅…)吸進去、把情·去留餓死(復現漂移);② centrality/blend 是否守住情這條主軸;③ 守住後情那條是真推進還是空轉(空轉就 motivate §4d.2 中心問題/收線退役)。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
