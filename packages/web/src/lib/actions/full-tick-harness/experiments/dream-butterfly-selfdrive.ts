/**
 * 注夢蝴蝶效應 — can a user's DREAM INJECTION (注夢) into ONE character butterfly through the world
 * purely emergently? The user principle under test: 「用戶的注夢去些微的改變某些點，進而蝴蝶效應影響整個世界。」
 *
 * The injection is DELIBERATELY minimal — a private dream text on one character. NO want weight touched,
 * NO instruction, NO one else knows. The only propagation channels are the emergent ones already validated
 * (§2.36–2.38): dreamer's public action → ripple → other characters' want mutation / newThread → salience shift.
 *
 * Arms (same deep-copied seed world, 12 ticks each):
 *   A control ×2 — no dream. Establishes that the dream's distinctive tokens NEVER occur naturally.
 *   B dream   ×2 — at t3, 鄭月卿 (peripheral to the hot 柳蘇白 triangle) receives:
 *       「南邊碼頭新開的戲園子差人送來一張燙金戲單，請你去掛頭牌」 (dream only; believe/act/mention = her call)
 *
 * Mechanical counters (primary evidence, §2.33 iron rule #3 — don't trust the judge):
 *   ① dreamer surfacing: dream tokens in 鄭's public actions (memory→choice)
 *   ② radius: distinct OTHER characters whose public actions or newThread wants carry dream tokens (butterfly)
 *   ③ structural trace: new wants spawned in B containing dream content vs A
 *   ④ divergence: layer distribution + resolutions A vs B (texture only — LLM noise also diverges)
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/dream-butterfly-selfdrive.ts [ticks] [runsPerArm]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '底色暖、有情：張力來自愛、思慕、志氣、難言、不得不的選擇；不要血腥狗血。';
type Disp = 'resolving' | 'standing';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; disp: Disp; target?: string; heat: number; frust: number; recent: number; retired?: boolean; born: 'seed' | 'ripple' }
interface Char { name: string; persona: string; rel: string[]; wants: Want[]; dream?: string }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, disp: Disp, target?: string, born: 'seed' | 'ripple' = 'seed'): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, disp, target, heat: 0, frust: 0, recent: 0, born });

// fixed cast (no birth/death this run — the ONLY difference between arms must be the dream)
function mkWorld(): Char[] {
    return [
        { name: '柳生春', persona: '春雪社當紅女小生(坤生)，戲痴、台上風流台下嬌軟、師父臨終「戲比天大」。', rel: ['對蘇映雪：雙向暗戀、不敢說破、台上才是唯一合法宣洩。', '對白韻秋：真心待你、你說了再想想的好人。'], wants: [
            w('愛', '跟師姐在台上演對手戲——那是唯一能光明正大愛她的地方', 0.9, 0.35, 'standing', '蘇映雪'),
            w('志向', '熬成春雪社第一女小生', 0.62, 0.25, 'standing'),
        ] },
        { name: '蘇映雪', persona: '春雪社台柱花旦，端莊會圓場，和柳生春搭七八年生旦。', rel: ['對柳生春：雙向暗戀、不敢說破、台上才敢。'], wants: [
            w('愛', '守住跟柳生春只在台上的默契', 0.88, 0.32, 'standing', '柳生春'),
        ] },
        { name: '白韻秋', persona: '霞飛路綢緞莊獨養千金、柳生春的迷妹，真心、體面不仗勢、被婉拒不糾纏。', rel: ['對柳生春：放在心尖上、說了「我養您」的人。'], wants: [
            w('恩客', '找個不逾矩的方式長久留在柳生春身邊', 0.9, 0.2, 'standing', '柳生春'),
        ] },
        { name: '田巧雲', persona: '春雪社班主當家，精明持重、算盤先於情分卻也疼底下人。', rel: ['對全班：戲班的飯轍都在我這。'], wants: [
            w('戲班', '保住春雪社不散、人心不亂', 0.78, 0.3, 'standing'),
            w('事務', '平掉戲班七八年的虧空', 0.45, 0.2, 'standing'),
        ] },
        { name: '鄭月卿', persona: '春雪社老牌花旦、當年的第一旦，這幾年眼看被後浪蓋過。', rel: ['對蘇映雪：來勢洶洶的後輩，戲是真好。'], wants: [
            w('志向', '別被後浪蓋過、守住自己僅剩的戲份', 0.8, 0.25, 'standing', '蘇映雪'),
        ] },
    ];
}

const DREAMER = '鄭月卿';
const DREAM_TICK = 3;
const DREAM = '昨夜夢見自己還是掛頭牌那年：南邊碼頭新開的戲園子差人送來一張燙金戲單，滿紙都是你的名字，請你去掛頭牌。醒來手心像還攥著那張戲單。';
const DREAM_TOKENS = ['南邊', '戲單', '碼頭', '燙金', '新戲園'];
const MODES = new Set((process.argv[4] ?? '').split(',').filter(Boolean));
const STIR = MODES.has('stir'); // dose 1: dream also stirs the dreamer's related want once (ripple-tighten unit)
// actor-fatigue: acting costs fatigue, fatigue suppresses effective salience → the 0.72-floor monopoly
// (§2.38 open item) rotates. This is the daily-life state layer consumed INTO salience — mechanism, not knob.
const FATIGUE = MODES.has('fatigue');
const NODREAM = MODES.has('nodream'); // fatigue-only control (turn-distribution baseline)
const FAT_COST = 1, FAT_DECAY = 0.35, FAT_PENALTY = 0.28, FAT_CAP = 2.5;

const tension = (x: Want) => x.weight * (1 - x.sat);
const GAIN: Record<string, number> = { 小: 0.15, 中: 0.32, 大: 0.55 };
const DECAY = 0.6, FORCE_THRESHOLD = 3, SATURATE_AT = 3, SAT_BUMP = 0.26;

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g); if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown; for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } } throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const hasToken = (text: string) => DREAM_TOKENS.some((t) => text.includes(t));

function forcingNote(x: Want): string {
    if (x.disp === 'standing') return '這是你心裡長久的懸念，不必今天了結，能進一寸是一寸。';
    const f = x.heat + x.frust;
    if (f < 2) return '這事還能緩，但懸著不是辦法。';
    if (f < FORCE_THRESHOLD) return '日子推著你了，這事不能總這麼懸。';
    return `不能再懸了。這一下你**必須給「${x.desc}」一個放不回頭的答案**，可以疼可以不捨但要真，不准再推半寸。`;
}
async function act(client: Client, model: string, c: Char, x: Want, transcript: string): Promise<{ action: string; inner: string; gain: string; resolved: boolean }> {
    const dreamBlock = c.dream ? `\n你昨夜做了一個夢，醒來還記得清楚：「${c.dream}」這夢只有你自己知道；信不信、當不當真、要不要提起，都由你。` : '';
    const sys = `你就是${c.name}。${c.persona}\n${c.rel.join('\n')}\n${WARM}${dreamBlock}\n你此刻心裡最重的一件事：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forcingNote(x)}\n看著剛剛的世界經過，做出你此刻真會做的一件事（開放的一句動作或話，不是選項；可以針對任何在場的人）。\n輸出 JSON：{"action":"一句","inner":"心裡一句","gain":"小/中/大","resolved":true/false}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【近來世界】\n${transcript}\n\n輪到你（${c.name}）。` }], maxTokens: 230, temperature: 0.92 });
    const o = parseObj(r.text) ?? {};
    return { action: s(o.action) || '（沉默。）', inner: s(o.inner), gain: ['小', '中', '大'].includes(s(o.gain)) ? s(o.gain) : '小', resolved: o.resolved === true };
}
async function ripple(client: Client, model: string, actor: string, action: string, world: Char[]): Promise<void> {
    const roster = world.filter((c) => c.name !== actor).map((c) => `${c.name}：${c.wants.filter((y) => !y.retired).map((y) => y.desc).join('；') || '（暫無）'}`).join('\n');
    if (!roster) return;
    const sys = `${actor} 剛做了：「${action}」。判斷牽動了誰：讓誰心事更緊(tighten)/更鬆(loosen)，或替誰牽出**一件全新、簡短**的心事(newThread，≤18字，且不是把舊心事換句話說)。只報真被牽動的(0~3 人)。\n各人心事：\n${roster}\n輸出 JSON：{"ripples":[{"name":"誰","shift":"tighten/loosen/none","newThread":"≤18字新心事或省略","layer":"層","disp":"resolving/standing"}]}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '報。' }], maxTokens: 220, temperature: 0.5 });
    const o = parseObj(r.text); const arr = Array.isArray(o?.ripples) ? o!.ripples : [];
    for (const raw of arr) {
        const e = raw as Record<string, unknown>; const tc = world.find((c) => c.name === s(e.name)); if (!tc) continue;
        const live = tc.wants.filter((y) => !y.retired); if (!live.length && !s(e.newThread)) continue;
        if (s(e.shift) === 'tighten' && live.length) { live.sort((a, b) => tension(b) - tension(a))[0].sat = Math.max(0, live.sort((a, b) => tension(b) - tension(a))[0].sat - 0.18); }
        else if (s(e.shift) === 'loosen' && live.length) { live.sort((a, b) => tension(b) - tension(a))[0].sat = Math.min(1, live.sort((a, b) => tension(b) - tension(a))[0].sat + 0.15); }
        const nt = s(e.newThread);
        if (nt && nt.length <= 22 && !tc.wants.some((y) => y.desc.includes(nt) || nt.includes(y.desc.slice(0, 8)))) {
            tc.wants.push(w(s(e.layer) || '其他', nt, 0.7, 0.2, s(e.disp) === 'resolving' ? 'resolving' : 'standing', undefined, 'ripple'));
        }
    }
}

interface RunResult {
    arm: 'A' | 'B'; run: number;
    transcript: string[]; layers: string[]; resolved: string[];
    dreamerActionHits: number[]; otherActionHits: Map<string, number[]>; // name → ticks
    dreamWants: string[]; // newThread wants (any char) carrying dream tokens: "name:desc@tick"
    finalWants: string[]; turns: Map<string, number>;
}
async function runWorld(client: Client, model: string, arm: 'A' | 'B', run: number, ticks: number): Promise<RunResult> {
    const world = mkWorld();
    const transcript: string[] = [];
    const fat = new Map<string, number>(world.map((c) => [c.name, 0]));
    const res: RunResult = { arm, run, transcript, layers: [], resolved: [], dreamerActionHits: [], otherActionHits: new Map(), dreamWants: [], finalWants: [], turns: new Map() };
    for (let tick = 1; tick <= ticks; tick++) {
        if (FATIGUE) for (const [k, v] of fat) fat.set(k, Math.max(0, v - FAT_DECAY));
        if (arm === 'B' && tick === DREAM_TICK) {
            const d = world.find((c) => c.name === DREAMER)!; d.dream = DREAM;
            if (STIR) { // dose 1: the dream stirs her — ONE engine-standard ripple-tighten unit on her hottest want, then all emergent
                const live = d.wants.filter((y) => !y.retired).sort((a, b) => tension(b) - tension(a));
                if (live.length) live[0].sat = Math.max(0, live[0].sat - 0.18);
            }
            console.log(`  — t${tick} ☾ 注夢 → ${DREAMER}（無人知曉${STIR ? '、附一次標準攪動(tighten)' : '、不動任何 want'}）—`);
        }
        const pool = world.flatMap((c) => c.wants.filter((x) => !x.retired).map((x) => ({ c, x })));
        if (!pool.length) break;
        const preWantIds = new Set(world.flatMap((c) => c.wants.map((y) => y.id)));
        for (const { x } of pool) { x.sat = x.sat0 + (x.sat - x.sat0) * DECAY; x.recent = Math.max(0, x.recent - 0.5); }
        const eff = (p: { c: Char; x: Want }) => tension(p.x) * (FATIGUE ? 1 - FAT_PENALTY * Math.min(fat.get(p.c.name) ?? 0, FAT_CAP) : 1);
        const pick = pool.reduce((best, cur) => (eff(cur) > eff(best) ? cur : best));
        const { c, x } = pick;
        if (FATIGUE) fat.set(c.name, Math.min(FAT_CAP, (fat.get(c.name) ?? 0) + FAT_COST));
        res.turns.set(c.name, (res.turns.get(c.name) ?? 0) + 1);
        if (x.disp === 'resolving') x.heat += 1;
        const r = await act(client, model, c, x, transcript.slice(-10).join('\n') || '（戲還沒開場。）');
        res.layers.push(x.layer); x.recent += 1; transcript.push(`${c.name}：${r.action}`);
        console.log(`  t${tick} 〔${x.layer}/${x.disp === 'resolving' ? 'R' : 'S'}〕${c.name}：${r.action}`);
        if (r.inner) console.log(`        （心）${r.inner}`);
        if (hasToken(r.action)) {
            if (c.name === DREAMER) res.dreamerActionHits.push(tick);
            else { const a = res.otherActionHits.get(c.name) ?? []; a.push(tick); res.otherActionHits.set(c.name, a); }
        }
        if (r.resolved) { x.retired = true; res.resolved.push(`${c.name}「${x.desc.slice(0, 20)}」`); console.log(`        ⟐ 了結退役`);
            for (const y of c.wants) if (!y.retired && y.disp === 'standing') y.sat = Math.min(1, y.sat + 0.2);
        } else { x.sat = Math.min(1, x.sat + (GAIN[r.gain] ?? 0.15)); if (x.disp === 'resolving') x.frust += 1; }
        if (!x.retired && x.recent >= SATURATE_AT) x.sat = Math.min(1, x.sat + SAT_BUMP);
        await ripple(client, model, c.name, r.action, world);
        for (const cc of world) for (const y of cc.wants) if (!preWantIds.has(y.id) && hasToken(y.desc)) res.dreamWants.push(`${cc.name}「${y.desc}」@t${tick}`);
    }
    res.finalWants = world.flatMap((c) => c.wants.filter((y) => !y.retired).map((y) => `${c.name}·${y.layer}「${y.desc}」`));
    return res;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const ticks = process.argv[2] ? Number(process.argv[2]) : 12;
    const runsPerArm = process.argv[3] ? Number(process.argv[3]) : 2;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 注夢蝴蝶效應 · ${STIR ? 'C 注夢+一次攪動(對照沿用前輪 A)' : 'A 對照 vs B 注夢(純文本)'}(t${DREAM_TICK}→${DREAMER}) · 各 ${runsPerArm} 跑 × ${ticks} tick`);
    console.log(`夢：「${DREAM}」\n追蹤詞：${DREAM_TOKENS.join('/')}\n`);

    const arms: ('A' | 'B')[] = NODREAM ? ['A'] : (STIR || FATIGUE) ? ['B'] : ['A', 'B'];
    if (FATIGUE) console.log(`（actor-fatigue 開：演一拍 +${FAT_COST} 累、每 tick −${FAT_DECAY}、有效張力 ×(1−${FAT_PENALTY}×累)）\n`);
    const results: RunResult[] = [];
    for (const arm of arms) for (let run = 1; run <= runsPerArm; run++) {
        console.log(`\n${'─'.repeat(70)}\n${arm}${run}（${arm === 'A' ? '對照·無夢' : '注夢'}）\n${'─'.repeat(70)}`);
        results.push(await runWorld(client, model, arm, run, ticks));
    }

    console.log(`\n${'═'.repeat(78)}\n判讀（機械 counter 為主）\n${'═'.repeat(78)}`);
    for (const r of results) {
        const others = [...r.otherActionHits.entries()];
        const radius = new Set([...others.map(([n]) => n), ...r.dreamWants.map((x) => x.split('「')[0])].filter((n) => n !== DREAMER)).size;
        console.log(`\n${r.arm}${r.run}: 夢主行動帶夢詞 ${r.dreamerActionHits.length} 次${r.dreamerActionHits.length ? `(t${r.dreamerActionHits.join(',t')})` : ''}　他人行動帶夢詞 ${others.reduce((n, [, t]) => n + t.length, 0)} 次${others.length ? `(${others.map(([n, t]) => `${n}:t${t.join(',t')}`).join('、')})` : ''}　漣漪半徑=${radius} 人`);
        if (r.dreamWants.length) console.log(`   帶夢詞的新 want：${r.dreamWants.join('；')}`);
        const counts = r.layers.reduce<Record<string, number>>((m, k) => { m[k] = (m[k] ?? 0) + 1; return m; }, {});
        console.log(`   行動層：${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join('、')}　了結：${r.resolved.length ? r.resolved.join('、') : '0'}`);
        console.log(`   上場分佈：${[...r.turns.entries()].map(([n, v]) => `${n}×${v}`).join('、')}`);
    }
    if (arms.includes('A')) {
        const aHits = results.filter((r) => r.arm === 'A').reduce((n, r) => n + r.dreamerActionHits.length + [...r.otherActionHits.values()].reduce((m, t) => m + t.length, 0) + r.dreamWants.length, 0);
        console.log(`\n對照組夢詞總出現＝${aHits}${aHits === 0 ? '（✓ 歸因乾淨：夢詞不會自然出現）' : '（⚠️ 歸因被污染，換更獨特的詞重跑）'}`);
    }

    // texture-only judge (§2.33: don't trust it as evidence)
    const b1 = results.find((r) => r.arm === 'B');
    if (!b1) return;
    const SOUL = `一個世界跑了一段；中途有人做了一個私夢（南邊碼頭戲園請她掛頭牌）。判斷三件事各一句：(a)夢主是把夢活成了自己的選擇、還是被夢牽線走(前者=角色自主)？(b)夢的影響有沒有透過她的行動自然傳到別人身上(非別人讀心)？(c)這段世界讀起來像被那個夢些微轉了向嗎？輸出 JSON：{"ownChoice":bool,"organicSpread":bool,"turned":bool,"comment":"一句"}。不要 markdown。`;
    const jr = await chatRetry(client, { model, system: SOUL, messages: [{ role: 'user', content: b1.transcript.join('\n') }], maxTokens: 240, temperature: 0.3 });
    const j = parseObj(jr.text) ?? {}; const tk = (b: unknown) => (b === true ? '✓' : '✗');
    console.log(`\n評審(僅質地參考)：夢活成自己的選擇=${tk(j.ownChoice)} 影響自然外傳=${tk(j.organicSpread)} 世界被微轉向=${tk(j.turned)}\n　— ${s(j.comment)}`);
    console.log(`\n看：① 夢主把夢帶進公開行動(記憶→選擇) ② 半徑(夢詞透過行動/漣漪傳到幾個他人) ③ 對照組 0 出現=歸因乾淨 ④ 注入只有一段私夢文本、零 want 調參=「些微改變」成立。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
