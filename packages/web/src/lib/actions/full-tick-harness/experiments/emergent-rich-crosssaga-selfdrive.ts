/**
 * 豐厚人物 + 跨 saga + 多種目標 — the §2.38 breadth ◑ (白韻秋 over-indexed ~11/24) is likely NOT an engine
 * knob problem but a CHARACTER FLATNESS problem: a one-want character monomaniacally hammers that one want;
 * a rich character with COMPETING wants (devotion + family-abroad pressure + economic survival) naturally
 * distributes AND reads more human. This is §2.26 (richness de-collapses) at the want layer.
 *
 * Test three things at once:
 *   ① richness fixes monopoly: give every char 2–3 cross-layer wants (love/ambition/family/livelihood/body);
 *      does 白 now VARY her behaviour + the world broaden, with no cooling knob?
 *   ② cross-saga pressure: materialize 白父 (a 家族企業 saga character) who is NOT in the 戲園 but exerts an
 *      ENDLESS lever — defy (stay) → he threatens to cut her family ENDLESS supply. Does a character in
 *      another saga genuinely stir this saga's drama? Does the economic lever force 白's choice?
 *   ③ more want-KINDS: family duty / economic survival / body, not just love/ambition → richer, life-like drama.
 * Still no directing — only birth (白父 + others) + death (mortality) are manual; outcomes emerge.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/emergent-rich-crosssaga-selfdrive.ts [ticks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '底色暖、有情：張力來自愛、思慕、志氣、難言、家累、生計、不得不的選擇；不要血腥狗血。';
type Disp = 'resolving' | 'standing';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; disp: Disp; target?: string; heat: number; frust: number; recent: number; retired?: boolean }
interface Char { name: string; saga: string; persona: string; rel: string[]; wants: Want[]; age: number; lifespan: number; alive: boolean }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, disp: Disp, target?: string): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, disp, target, heat: 0, frust: 0, recent: 0 });
const mk = (name: string, saga: string, persona: string, rel: string[], wants: Want[], lifespan: number): Char =>
    ({ name, saga, persona, rel, wants, age: 0, lifespan, alive: true });

const WORLD: Char[] = [
    mk('柳生春', '春雪社', '當紅女小生(坤生)，戲痴、台上風流台下嬌軟、師父「戲比天大」。', ['對蘇映雪：雙向暗戀、台上才合法。', '對白韻秋：真心待你的好人。'], [
        w('愛', '跟師姐在台上演對手戲——唯一能光明正大愛她的地方', 0.9, 0.35, 'standing', '蘇映雪'),
        w('志向', '熬成第一女小生', 0.6, 0.25, 'standing'),
        w('身體', '怕老、怕嗓子壞、想偷空養一養', 0.4, 0.3, 'standing'),
    ], 33),
    mk('蘇映雪', '春雪社', '台柱花旦，端莊會圓場，和柳生春搭七八年。', ['對柳生春：雙向暗戀、台上才敢。'], [
        w('愛', '守住跟柳生春只在台上的默契', 0.88, 0.32, 'standing', '柳生春'),
        w('志向', '坐穩春雪社頭塊牌、別被取代', 0.55, 0.28, 'standing'),
    ], 31),
    // 白韻秋：從一個 want 養成三個競爭 want（痴情 + 家逼出國 + 靠家裡 ENDLESS 過活）
    mk('白韻秋', '霞飛路', '白氏商號獨養千金，迷柳生春、真心體面不仗勢；錦衣玉食全靠家裡供養。', ['對柳生春：放心尖上、說了「我養您」。', '對家裡：父親嚴、自己一向順、可這回難。'], [
        w('恩客', '找個不逾矩的方式長久留在柳生春身邊', 0.85, 0.2, 'standing', '柳生春'),
        w('家族', '家裡要送我出國讀書、光耀門楣，我到底從不從', 0.5, 0.3, 'resolving'),
        w('生計', '我的吃穿用度全靠家裡的 ENDLESS，斷不得', 0.55, 0.25, 'standing'),
    ], 35),
    mk('田巧雲', '春雪社', '班主當家，精明持重、算盤先於情分卻也疼人。', ['對全班：飯轍都在我這。'], [
        w('戲班', '保住春雪社不散、人心不亂', 0.78, 0.3, 'standing'),
        w('事務', '平掉戲班七八年的虧空', 0.45, 0.2, 'standing'),
    ], 22),
    mk('鄭月卿', '春雪社', '老牌花旦、當年第一旦，眼看被後浪蓋過。', ['對蘇映雪：來勢洶洶的後輩。'], [
        w('志向', '別被後浪蓋過、守住僅剩戲份', 0.8, 0.25, 'standing', '蘇映雪'),
    ], 11),
];

interface Birth { tick: number; make: () => Char }
const BIRTHS: Birth[] = [
    // 跨 saga：白父在「白氏商號」saga，不在戲園，卻握著白的 ENDLESS。只給他想要，不寫他怎麼做。
    { tick: 7, make: () => mk('白崇仁', '白氏商號', '霞飛路白氏商號的家主、白韻秋的父親，重門楣、嫌戲子不入流；女兒的吃穿用度由他撥 ENDLESS。', ['對白韻秋：我的女兒，不能讓她在戲園裡敗了白家的名聲。'], [
        w('家族', '把女兒白韻秋弄出戲園、送出國讀書、不從就斷她的 ENDLESS', 0.82, 0.2, 'resolving', '白韻秋'),
    ], 40) },
    { tick: 15, make: () => mk('沈巧玲', '春雪社', '剛搭班的科班新秀花旦，急著出頭。', ['對春雪社：總跑龍套，我要爭個露臉。'], [
        w('志向', '在春雪社掙個出頭、別跑龍套', 0.8, 0.18, 'resolving'),
    ], 36) },
];

const tension = (x: Want) => x.weight * (1 - x.sat);
const GAIN: Record<string, number> = { 小: 0.15, 中: 0.32, 大: 0.55 };
const DECAY = 0.6, FORCE = 3, SAT_AT = 3, SAT_BUMP = 0.26;

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g); if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown; for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } } throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const living = (W: Char[]) => W.filter((c) => c.alive);

function forceNote(x: Want): string {
    if (x.disp === 'standing') return '這是長久的懸念，不必今天了結，能進一寸是一寸。';
    const f = x.heat + x.frust;
    if (f < 2) return '還能緩，但懸著不是辦法。';
    if (f < FORCE) return '日子推著你了，不能總這麼懸。';
    return `不能再懸了。這一下你**必須給「${x.desc}」一個放不回頭的答案**，可以疼可以不捨但要真。`;
}
async function act(client: Client, model: string, c: Char, x: Want, transcript: string): Promise<{ action: string; inner: string; gain: string; resolved: boolean }> {
    const cross = c.saga !== '春雪社' && c.saga !== '霞飛路' ? `（你不在戲園，你在「${c.saga}」，你的動作是從你那邊發出的影響/傳話/召喚。）` : '';
    const sys = `你就是${c.name}（${c.saga}）。${c.persona}\n${c.rel.join('\n')}\n${WARM}${cross}\n你此刻心裡最重的一件事：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forceNote(x)}\n看著近來的世界，做你此刻真會做的一件事（開放一句、可針對任何人）。輸出 JSON：{"action":"一句","inner":"心裡一句","gain":"小/中/大","resolved":true/false}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【近來世界】\n${transcript}\n\n輪到你（${c.name}）。` }], maxTokens: 230, temperature: 0.92 });
    const o = parseObj(r.text) ?? {};
    return { action: s(o.action) || '（沉默。）', inner: s(o.inner), gain: ['小', '中', '大'].includes(s(o.gain)) ? s(o.gain) : '小', resolved: o.resolved === true };
}
async function ripple(client: Client, model: string, actor: string, action: string, W: Char[]): Promise<void> {
    const roster = living(W).filter((c) => c.name !== actor).map((c) => `${c.name}：${c.wants.filter((y) => !y.retired).map((y) => y.desc).join('；') || '（暫無）'}`).join('\n');
    if (!roster) return;
    const sys = `${actor} 剛做了：「${action}」。判斷牽動了誰：心事更緊(tighten)/更鬆(loosen)，或牽出**一件全新、簡短(≤18字)**心事(非換句話說)。只報真被牽動的(0~3)。\n各人心事：\n${roster}\n輸出 JSON：{"ripples":[{"name":"","shift":"tighten/loosen/none","newThread":"≤18字或省略","layer":"","disp":"resolving/standing"}]}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '報。' }], maxTokens: 220, temperature: 0.5 });
    const o = parseObj(r.text); const arr = Array.isArray(o?.ripples) ? o!.ripples : [];
    for (const raw of arr) {
        const e = raw as Record<string, unknown>; const tc = living(W).find((c) => c.name === s(e.name)); if (!tc) continue;
        const live = tc.wants.filter((y) => !y.retired);
        if (live.length) { const top = live.sort((a, b) => tension(b) - tension(a))[0];
            if (s(e.shift) === 'tighten') top.sat = Math.max(0, top.sat - 0.18);
            else if (s(e.shift) === 'loosen') top.sat = Math.min(1, top.sat + 0.15); }
        const nt = s(e.newThread);
        if (nt && nt.length <= 22 && !tc.wants.some((y) => y.desc.includes(nt) || nt.includes(y.desc.slice(0, 8)))) tc.wants.push(w(s(e.layer) || '其他', nt, 0.7, 0.2, s(e.disp) === 'resolving' ? 'resolving' : 'standing'));
    }
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const ticks = process.argv[2] ? Number(process.argv[2]) : 22;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 豐厚+跨saga+多目標 · 純湧現 · ${ticks} tick\n白養成 3 個競爭 want(痴情/家逼出國/生計ENDLESS)。t7 出生跨saga白父(握ENDLESS槓桿)。\n`);

    const W = [...WORLD];
    const transcript: string[] = []; const acts: Array<{ who: string; layer: string }> = []; const deaths: string[] = []; const resolved: string[] = [];

    for (let tick = 1; tick <= ticks; tick++) {
        for (const b of BIRTHS) if (b.tick === tick) { const nc = b.make(); W.push(nc); transcript.push(`【世界】${nc.name}（${nc.saga}）登場。`); console.log(`\n— t${tick} ☉ 出生：${nc.name}（${nc.saga}）—`); }
        for (const c of living(W)) { c.age += 1; if (c.age >= c.lifespan) { c.alive = false; const reg = c.wants.filter((y) => !y.retired && y.disp === 'standing').sort((a, b) => b.weight - a.weight)[0]; const ess = reg ? `${reg.desc}（此生未了）` : '（了無牽掛）'; deaths.push(`${c.name}：${ess}`); transcript.push(`【世界】${c.name}去了。`); console.log(`\n— t${tick} ✝ 死亡：${c.name} — 遺憾「${ess}」`); } }
        const pool = living(W).flatMap((c) => c.wants.filter((x) => !x.retired).map((x) => ({ c, x })));
        if (!pool.length) break;
        for (const { x } of pool) { x.sat = x.sat0 + (x.sat - x.sat0) * DECAY; x.recent = Math.max(0, x.recent - 0.5); }
        const pick = pool.reduce((b, cur) => (tension(cur.x) > tension(b.x) ? cur : b));
        const { c, x } = pick;
        if (x.disp === 'resolving') x.heat += 1;
        const r = await act(client, model, c, x, transcript.slice(-10).join('\n') || '（戲還沒開場。）');
        acts.push({ who: c.name, layer: x.layer }); x.recent += 1; transcript.push(`${c.name}：${r.action}`);
        const forced = x.disp === 'resolving' && x.heat + x.frust >= FORCE;
        console.log(`t${tick} 〔${c.saga}·${x.layer}/${x.disp === 'resolving' ? 'R' : 'S'}〕${c.name}（張${tension(x).toFixed(2)}${forced ? '·逼' : ''}）：${r.action}`);
        if (r.inner) console.log(`        （心）${r.inner}`);
        if (r.resolved) { x.retired = true; resolved.push(`${c.name}「${x.desc.slice(0, 18)}」`); console.log(`        ⟐ 了結退役`); for (const y of c.wants) if (!y.retired && y.disp === 'standing') y.sat = Math.min(1, y.sat + 0.2); }
        else { x.sat = Math.min(1, x.sat + (GAIN[r.gain] ?? 0.15)); if (x.disp === 'resolving') x.frust += 1; }
        if (!x.retired && x.recent >= SAT_AT) x.sat = Math.min(1, x.sat + SAT_BUMP);
        await ripple(client, model, c.name, r.action, W);
    }

    console.log(`\n${'═'.repeat(78)}\n判讀（豐厚是否解掉壟斷 · 跨 saga 是否攪動 · 多目標是否更雜）\n${'═'.repeat(78)}`);
    const byWho = acts.reduce<Record<string, number>>((m, a) => { m[a.who] = (m[a.who] ?? 0) + 1; return m; }, {});
    const byLayer = acts.reduce<Record<string, number>>((m, a) => { m[a.layer] = (m[a.layer] ?? 0) + 1; return m; }, {});
    const baiActs = acts.filter((a) => a.who === '白韻秋');
    const baiLayers = baiActs.reduce<Record<string, number>>((m, a) => { m[a.layer] = (m[a.layer] ?? 0) + 1; return m; }, {});
    console.log(`① 豐厚解壟斷：白韻秋行動 ${baiActs.length} 次，分佈 ${Object.entries(baiLayers).map(([k, v]) => `${k}×${v}`).join('、') || '—'}　${Object.keys(baiLayers).length >= 2 ? '✓ 不再 monomaniac、有分散到家族/生計' : '◑ 仍單一'}`);
    console.log(`   各人行動次數：${Object.entries(byWho).map(([k, v]) => `${k}×${v}`).join('、')}`);
    console.log(`② 跨 saga：白崇仁(白氏商號)行動 ${byWho['白崇仁'] ?? 0} 次　${(byWho['白崇仁'] ?? 0) > 0 ? '✓ 別 saga 的人攪進了戲園的戲' : '✗ 沒進來'}`);
    console.log(`③ 多目標：層分佈 ${Object.entries(byLayer).map(([k, v]) => `${k}×${v}`).join('、')}　${Object.keys(byLayer).length >= 5 ? '✓ 家族/生計/愛/志向…雜了' : '◑'}`);
    console.log(`了結 ${resolved.length}：${resolved.join('；') || '—'}　死亡 ${deaths.length}　機械事務 ${byLayer['事務'] ?? 0} 次${(byLayer['事務'] ?? 0) === 0 ? '✓沉底' : ''}`);

    const SOUL = '下面是一個沒有導演、只放出生死亡、角色各有多個競爭慾望(含家累/生計)的世界跑了一段，其中有個角色的父親在別的 saga、用斷錢逼她。判斷各一句：(a)那個有家累的角色(白韻秋)是否不再monomaniac、行為變立體？(b)別 saga 的父親有沒有真的攪動這邊的戲？(c)經濟逼迫有沒有逼出真選擇？(d)戲比單一慾望時更像生活嗎？(e)五性質(焦點/廣度/收斂/懸念留著/不漂移)？輸出 JSON：{"richDistributes":bool,"crossSagaStirs":bool,"economicForces":bool,"feelsLifelike":bool,"fiveHold":bool,"comment":"一句"}。不要 markdown。';
    const jr = await chatRetry(client, { model, system: SOUL, messages: [{ role: 'user', content: transcript.filter((t) => !t.startsWith('【世界】')).join('\n') }], maxTokens: 260, temperature: 0.3 });
    const j = parseObj(jr.text) ?? {}; const tk = (b: unknown) => (b === true ? '✓' : '✗');
    console.log(`\n評審：豐厚分散=${tk(j.richDistributes)} 跨saga攪動=${tk(j.crossSagaStirs)} 經濟逼選擇=${tk(j.economicForces)} 更像生活=${tk(j.feelsLifelike)} 五性質=${tk(j.fiveHold)}\n　— ${s(j.comment)}`);
    console.log(`\n看：① 白豐厚後是否分散不再壟斷(廣度的真解=養厚人物，非引擎旋鈕) ② 跨 saga 父親攪動戲園 ③ ENDLESS 槓桿逼出真選擇 ④ 多目標更像生活。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
