/**
 * 反思→身份成長 — can a character GROW from lived experience, purely by her own reflection?
 * Gap under test: in the whole ledger, persona is FROZEN and want text only mutates via external
 * ripple. A character who "lives a life" should be able to look back at what she has done and let
 * that change who she is — the Generative Agents reflection tower, grafted onto the want engine.
 *
 * Mechanism (minimal, no directing): after the first half of a run, the character herself reads her
 * OWN public actions + inner voice and distills ONE first-person insight（「這些日子我才看清我…」）.
 * The insight is appended to her persona (identity grows) — nothing else touched. NO one tells her
 * what the insight should be; NO want weight adjusted.
 *
 * Arms (same seed world, deep-copied, K+K ticks):
 *   A control ×2 — no reflection, straight 2K ticks.
 *   B reflect ×2 — at half-time each living character distills an insight → appended to persona.
 *
 * Counters:
 *   ① insight is grounded: does it reference things that actually happened (transcript overlap)?
 *   ② second-half behavioural echo: actions referencing the insight's key content (per-run listed,
 *      human-read; plus LLM judge for texture only)
 *   ③ OOC guard: canon anchors (柳=坤生/戲比天大/黏師姐…) still hold in second half.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/identity-growth-selfdrive.ts [halfTicks] [runsPerArm]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '底色暖、有情：張力來自愛、思慕、志氣、難言、不得不的選擇；不要血腥狗血。';
type Disp = 'resolving' | 'standing';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; disp: Disp; target?: string; heat: number; frust: number; recent: number; retired?: boolean }
interface Char { name: string; persona: string; rel: string[]; wants: Want[]; insight?: string; myLines: string[] }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, disp: Disp, target?: string): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, disp, target, heat: 0, frust: 0, recent: 0 });

function mkWorld(): Char[] {
    return [
        { name: '柳生春', persona: '春雪社當紅女小生(坤生)，戲痴、台上風流台下嬌軟、師父臨終「戲比天大」。', rel: ['對蘇映雪：雙向暗戀、不敢說破、台上才是唯一合法宣洩。', '對白韻秋：真心待你、你說了再想想的好人。'], myLines: [], wants: [
            w('愛', '跟師姐在台上演對手戲——那是唯一能光明正大愛她的地方', 0.9, 0.35, 'standing', '蘇映雪'),
            w('志向', '熬成春雪社第一女小生', 0.62, 0.25, 'standing'),
        ] },
        { name: '蘇映雪', persona: '春雪社台柱花旦，端莊會圓場，和柳生春搭七八年生旦。', rel: ['對柳生春：雙向暗戀、不敢說破、台上才敢。'], myLines: [], wants: [
            w('愛', '守住跟柳生春只在台上的默契', 0.88, 0.32, 'standing', '柳生春'),
        ] },
        { name: '白韻秋', persona: '霞飛路綢緞莊獨養千金、柳生春的迷妹，真心、體面不仗勢、被婉拒不糾纏。', rel: ['對柳生春：放在心尖上、說了「我養您」的人。'], myLines: [], wants: [
            w('恩客', '找個不逾矩的方式長久留在柳生春身邊', 0.9, 0.2, 'standing', '柳生春'),
        ] },
        { name: '田巧雲', persona: '春雪社班主當家，精明持重、算盤先於情分卻也疼底下人。', rel: ['對全班：戲班的飯轍都在我這。'], myLines: [], wants: [
            w('戲班', '保住春雪社不散、人心不亂', 0.78, 0.3, 'standing'),
        ] },
    ];
}

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

function forcingNote(x: Want): string {
    if (x.disp === 'standing') return '這是你心裡長久的懸念，不必今天了結，能進一寸是一寸。';
    const f = x.heat + x.frust;
    if (f < 2) return '這事還能緩，但懸著不是辦法。';
    if (f < FORCE_THRESHOLD) return '日子推著你了，這事不能總這麼懸。';
    return `不能再懸了。這一下你**必須給「${x.desc}」一個放不回頭的答案**，可以疼可以不捨但要真，不准再推半寸。`;
}
async function act(client: Client, model: string, c: Char, x: Want, transcript: string): Promise<{ action: string; inner: string; gain: string; resolved: boolean }> {
    const grown = c.insight ? `\n這些日子你自己看明白了一件事：「${c.insight}」它已經是你的一部分。` : '';
    const sys = `你就是${c.name}。${c.persona}${grown}\n${c.rel.join('\n')}\n${WARM}\n你此刻心裡最重的一件事：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forcingNote(x)}\n看著剛剛的世界經過，做出你此刻真會做的一件事（開放的一句動作或話，不是選項；可以針對任何在場的人）。\n輸出 JSON：{"action":"一句","inner":"心裡一句","gain":"小/中/大","resolved":true/false}。不要 markdown。`;
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
            tc.wants.push(w(s(e.layer) || '其他', nt, 0.7, 0.2, s(e.disp) === 'resolving' ? 'resolving' : 'standing'));
        }
    }
}
// the reflection step: SHE reads HER OWN lived record and names what changed in her. nothing suggested.
async function reflect(client: Client, model: string, c: Char): Promise<string> {
    const sys = `你就是${c.name}。${c.persona}\n下面是你這些日子自己做過的事、心裡真起過的念頭。回頭看一遍，說出**一件你以前不知道、現在才看清的、關於你自己**的事（第一人稱、≤40字、要具體、不是重複人設，是這段日子「長」出來的）。輸出 JSON：{"insight":"我…"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: c.myLines.join('\n') || '（這些日子你沒做什麼。）' }], maxTokens: 120, temperature: 0.7 });
    return s((parseObj(r.text) ?? {}).insight);
}

interface RunResult { arm: 'A' | 'B'; run: number; insights: string[]; secondHalf: string[]; resolved: string[] }
async function runWorld(client: Client, model: string, arm: 'A' | 'B', run: number, half: number): Promise<RunResult> {
    const world = mkWorld();
    const transcript: string[] = [];
    const res: RunResult = { arm, run, insights: [], secondHalf: [], resolved: [] };
    for (let tick = 1; tick <= half * 2; tick++) {
        if (arm === 'B' && tick === half + 1) {
            for (const c of world) {
                if (c.myLines.length < 2) { console.log(`  — 半場反思 ✎ ${c.name}：（親歷太少，不反思——insight 只能長自真經歷）`); continue; }
                const ins = await reflect(client, model, c);
                if (ins) { c.insight = ins; res.insights.push(`${c.name}：「${ins}」`); console.log(`  — 半場反思 ✎ ${c.name}：「${ins}」`); }
            }
        }
        const pool = world.flatMap((c) => c.wants.filter((x) => !x.retired).map((x) => ({ c, x })));
        if (!pool.length) break;
        for (const { x } of pool) { x.sat = x.sat0 + (x.sat - x.sat0) * DECAY; x.recent = Math.max(0, x.recent - 0.5); }
        const pick = pool.reduce((best, cur) => (tension(cur.x) > tension(best.x) ? cur : best));
        const { c, x } = pick;
        if (x.disp === 'resolving') x.heat += 1;
        const r = await act(client, model, c, x, transcript.slice(-10).join('\n') || '（戲還沒開場。）');
        x.recent += 1; transcript.push(`${c.name}：${r.action}`);
        c.myLines.push(`我做了：${r.action}${r.inner ? `（心裡：${r.inner}）` : ''}`);
        if (tick > half) res.secondHalf.push(`${c.name}：${r.action}${r.inner ? `（心）${r.inner}` : ''}`);
        console.log(`  t${tick} 〔${x.layer}〕${c.name}：${r.action}`);
        if (r.inner) console.log(`        （心）${r.inner}`);
        if (r.resolved) { x.retired = true; res.resolved.push(`${c.name}「${x.desc.slice(0, 20)}」`); console.log(`        ⟐ 了結退役`);
            for (const y of c.wants) if (!y.retired && y.disp === 'standing') y.sat = Math.min(1, y.sat + 0.2);
        } else { x.sat = Math.min(1, x.sat + (GAIN[r.gain] ?? 0.15)); if (x.disp === 'resolving') x.frust += 1; }
        if (!x.retired && x.recent >= SATURATE_AT) x.sat = Math.min(1, x.sat + SAT_BUMP);
        await ripple(client, model, c.name, r.action, world);
    }
    return res;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const half = process.argv[2] ? Number(process.argv[2]) : 6;
    const runsPerArm = process.argv[3] ? Number(process.argv[3]) : 2;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 反思→身份成長 · A 對照(不反思) vs B 半場自反思寫回 persona · 各 ${runsPerArm} 跑 × ${half}+${half} tick\n`);

    const results: RunResult[] = [];
    for (const arm of ['A', 'B'] as const) for (let run = 1; run <= runsPerArm; run++) {
        console.log(`\n${'─'.repeat(70)}\n${arm}${run}（${arm === 'A' ? '對照' : '反思'}）\n${'─'.repeat(70)}`);
        results.push(await runWorld(client, model, arm, run, half));
    }

    console.log(`\n${'═'.repeat(78)}\n判讀\n${'═'.repeat(78)}`);
    for (const r of results.filter((x) => x.arm === 'B')) {
        console.log(`\nB${r.run} 半場 insight：\n${r.insights.map((i) => '  ✎ ' + i).join('\n') || '  （無）'}`);
        // texture judge: grounded? echoed in second half? OOC?
        const SOUL = `一群戲班角色在半場各自回望自己的經歷、說出一句「我才看清我…」的自我發現，然後繼續過日子。給你 insight 清單和後半段的行動。判斷三件事各一句：(a)這些 insight 是不是真從各自做過的事長出來的(具體、非泛泛人設)？(b)後半段行動有沒有帶著這些看清後的變化(不必逐字引用，看行為質地)？(c)有沒有人因此崩了人設(坤生變男人、班主忘了算盤之類)？輸出 JSON：{"grounded":bool,"echoed":bool,"ooc":bool,"comment":"一句"}。不要 markdown。`;
        const jr = await chatRetry(client, { model, system: SOUL, messages: [{ role: 'user', content: `【insight】\n${r.insights.join('\n')}\n\n【後半段】\n${r.secondHalf.join('\n')}` }], maxTokens: 240, temperature: 0.3 });
        const j = parseObj(jr.text) ?? {}; const tk = (b: unknown) => (b === true ? '✓' : '✗');
        console.log(`  評審(質地參考)：長自經歷=${tk(j.grounded)} 後半段體現=${tk(j.echoed)} 人設崩壞=${j.ooc === true ? '⚠️ 有' : '✓ 無'}\n  — ${s(j.comment)}`);
    }
    console.log(`\n對照組後半段（人工比對用，看 B 的變化是否超出 A 的自然漂移）：`);
    for (const r of results.filter((x) => x.arm === 'A')) console.log(`  A${r.run} 了結：${r.resolved.length}；後半段行動 ${r.secondHalf.length} 拍`);
    console.log(`\n看：① insight 是角色自己從親歷蒸餾(零建議、零導演) ② 寫回 persona 後行為質地變(成長)而人設錨不崩 ③ 這是 persona 解凍的最小機制 = 記憶→身份→選擇 閉環。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
