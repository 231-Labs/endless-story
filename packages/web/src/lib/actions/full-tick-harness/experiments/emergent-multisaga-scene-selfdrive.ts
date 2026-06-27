/**
 * 多 saga + scene + 時鐘 — adds the two things the decoupled sims abstracted away (the user asked): SCENE
 * (locations + co-presence: you directly interact only with who's HERE; cross-location needs travel or a
 * channel) and a light CLOCK (parts of day advancing). Plus: 3 sagas (戲園 / 霞飛路商店街 / 漱玉詩社),
 * 蘇 gets a family tie (蘇家綢緞莊 on 霞飛路), and 白韻秋's persona is PINNED — she is a 商號千金, she does
 * NOT perform; self-reliance for her = her shop / 體己 / 見識, never 登台賣唱 (fixes the §2.39 context-bleed
 * where the 梨園 frame made her confabulate 「唱曲養他」). Still no directing — only birth + death are manual.
 *
 * Watch: ① scene constrains interaction sensibly (cross-saga goes via travel/channel, not co-presence) ②
 * the clock paces it ③ 白 stays in-character (no singing) ④ 3 sagas interleave without fragmenting ⑤ five
 * properties hold ⑥ new want-KINDS (詩社 捧角寫詞 / 蘇家聯姻 / 生計) enrich it.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/emergent-multisaga-scene-selfdrive.ts [ticks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '底色暖、有情：張力來自愛、思慕、志氣、難言、家累、生計、聲望、不得不的選擇；不要血腥狗血。';
type Disp = 'resolving' | 'standing';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; disp: Disp; target?: string; heat: number; frust: number; recent: number; retired?: boolean }
interface Char { name: string; saga: string; loc: string; persona: string; rel: string[]; wants: Want[]; age: number; lifespan: number; alive: boolean }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, disp: Disp, target?: string): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, disp, target, heat: 0, frust: 0, recent: 0 });
const mk = (name: string, saga: string, loc: string, persona: string, rel: string[], wants: Want[], lifespan: number): Char =>
    ({ name, saga, loc, persona, rel, wants, age: 0, lifespan, alive: true });

// LOCATIONS belong to sagas. Direct interaction needs co-location; cross-location = travel or channel.
const LOC_SAGA: Record<string, string> = {
    '春雪社後台': '戲園', '雲錦台戲台': '戲園',
    '白氏商號': '霞飛路', '蘇家綢緞莊': '霞飛路',
    '漱玉詩社': '詩社',
};

const WORLD: Char[] = [
    mk('柳生春', '戲園', '春雪社後台', '當紅女小生(坤生)，戲痴、台上風流台下嬌軟、師父「戲比天大」。', ['對蘇映雪：雙向暗戀、台上才合法。', '對白韻秋：真心待你的好人。'], [
        w('愛', '跟師姐在台上演對手戲——唯一能光明正大愛她的地方', 0.9, 0.35, 'standing', '蘇映雪'),
        w('志向', '熬成第一女小生', 0.6, 0.25, 'standing'),
    ], 33),
    mk('蘇映雪', '戲園', '春雪社後台', '台柱花旦，娘家是霞飛路蘇家綢緞莊；端莊會圓場、和柳生春搭七八年。', ['對柳生春：雙向暗戀、台上才敢。', '對蘇家：娘家在綢緞莊，爹娘盼我嫁個好人家、別在戲班蹉跎。'], [
        w('愛', '守住跟柳生春只在台上的默契', 0.88, 0.32, 'standing', '柳生春'),
        w('家族', '娘家催我相一門好親、別唱戲了，我從不從', 0.5, 0.3, 'resolving'),
    ], 31),
    // 白韻秋：人設釘死——商號千金、不會唱戲；自立靠鋪子/體己/見識，不是登台賣唱。
    mk('白韻秋', '霞飛路', '白氏商號', '白氏商號獨養千金，迷柳生春、真心體面不仗勢。**你是生意人家的小姐，不會唱戲、也不靠賣唱；要自立，靠的是你的鋪子、體己錢、生意見識。**', ['對柳生春：放心尖上、說了「我養您」。', '對家裡：父親嚴、自己一向順、這回難。'], [
        w('恩客', '找個不逾矩的方式長久留在柳生春身邊', 0.85, 0.2, 'standing', '柳生春'),
        w('家族', '家裡要送我出國讀書、光耀門楣，我到底從不從', 0.5, 0.3, 'resolving'),
        w('生計', '我的吃穿用度全靠家裡 ENDLESS，斷了得自己撐起一份生意', 0.55, 0.25, 'standing'),
    ], 35),
    mk('田巧雲', '戲園', '春雪社後台', '班主當家，精明持重、算盤先於情分卻也疼人。', ['對全班：飯轍都在我這。'], [
        w('戲班', '保住春雪社不散、人心不亂', 0.78, 0.3, 'standing'),
        w('事務', '平掉戲班七八年的虧空', 0.45, 0.2, 'standing'),
    ], 24),
    mk('鄭月卿', '戲園', '春雪社後台', '老牌花旦、當年第一旦，眼看被後浪蓋過。', ['對蘇映雪：來勢洶洶的後輩。'], [
        w('志向', '別被後浪蓋過、守住僅剩戲份', 0.8, 0.25, 'standing', '蘇映雪'),
    ], 12),
];

interface Birth { tick: number; make: () => Char }
const BIRTHS: Birth[] = [
    // 詩社 saga：捧角文人，新 want-kind（藝文：捧角+寫新詞傳世）
    { tick: 4, make: () => mk('卓清漪', '詩社', '漱玉詩社', '漱玉詩社的詞人，清高自許，愛為台上最動人的角兒填新詞、捧她傳世。', ['對春雪社：台上有真懂戲的角兒，我願為她寫一闋傳世的詞。'], [
        w('藝文', '挑中那個最動我心的角兒、為她寫一闋新詞捧她傳世', 0.78, 0.2, 'resolving'),
    ], 38) },
    // 白父：跨 saga，握 ENDLESS 槓桿
    { tick: 8, make: () => mk('白崇仁', '霞飛路', '白氏商號', '白氏商號家主、白韻秋的父親，重門楣、嫌戲子；女兒用度由他撥 ENDLESS。', ['對白韻秋：我的女兒，不能讓她在戲園敗了白家名聲。'], [
        w('家族', '把女兒弄出戲園、送出國、不從就斷她 ENDLESS', 0.82, 0.2, 'resolving', '白韻秋'),
    ], 40) },
    { tick: 16, make: () => mk('沈巧玲', '戲園', '春雪社後台', '剛搭班的科班新秀花旦，家裡等米下鍋、急著出頭。', ['對春雪社：總跑龍套，我要爭個露臉。'], [
        w('志向', '在春雪社掙個出頭、別跑龍套', 0.8, 0.18, 'resolving'),
        w('生計', '家裡等著米下鍋，得掙錢養家', 0.5, 0.25, 'standing'),
    ], 36) },
];

const PARTS = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'];
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
    if (x.disp === 'standing') return '這是長久的懸念，不必今天了結。';
    const f = x.heat + x.frust;
    if (f < 2) return '還能緩，但懸著不是辦法。';
    if (f < FORCE) return '日子推著你了，不能總這麼懸。';
    return `不能再懸了。這一下**必須給「${x.desc}」一個放不回頭的答案**，可以疼可以不捨但要真。`;
}
async function act(client: Client, model: string, c: Char, x: Want, W: Char[], clock: string, transcript: string): Promise<{ action: string; inner: string; gain: string; resolved: boolean; moveTo?: string }> {
    const here = living(W).filter((o) => o.name !== c.name && o.loc === c.loc).map((o) => o.name);
    const tgt = x.target ? living(W).find((o) => o.name === x.target) : undefined;
    const tgtLoc = tgt && tgt.loc !== c.loc ? `你想牽涉的${tgt.name}此刻在【${tgt.loc}】（不在你這兒——你只能動身過去、或託人傳話/用家裡的銀錢規矩等「通道」隔空使力，不能當面）。` : '';
    const locs = Object.keys(LOC_SAGA).join('、');
    const sys = `你就是${c.name}（${c.saga}）。${c.persona}\n${c.rel.join('\n')}\n${WARM}\n【此刻】${clock}，你在【${c.loc}】；同在這兒的：${here.length ? here.join('、') : '只你一人'}。${tgtLoc}\n你心裡最重的一件事：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forceNote(x)}\n做你此刻真會做的一件事（開放一句）。**只能對在場的人當面做；要找不在場的人，就動身或傳話。** 若你要去別處，填 moveTo。\n輸出 JSON：{"action":"一句","inner":"心裡一句","gain":"小/中/大","resolved":true/false,"moveTo":"要去的地點名或省略"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【近來世界】\n${transcript}\n\n輪到你（${c.name}）。` }], maxTokens: 240, temperature: 0.92 });
    const o = parseObj(r.text) ?? {};
    const mv = s(o.moveTo); return { action: s(o.action) || '（沉默。）', inner: s(o.inner), gain: ['小', '中', '大'].includes(s(o.gain)) ? s(o.gain) : '小', resolved: o.resolved === true, moveTo: LOC_SAGA[mv] ? mv : undefined };
}
async function ripple(client: Client, model: string, actor: string, action: string, W: Char[]): Promise<void> {
    const roster = living(W).filter((c) => c.name !== actor).map((c) => `${c.name}(${c.loc})：${c.wants.filter((y) => !y.retired).map((y) => y.desc).join('；') || '（暫無）'}`).join('\n');
    if (!roster) return;
    const sys = `${actor} 剛做了：「${action}」。判斷牽動了誰(心事更緊tighten/更鬆loosen，或牽出一件全新≤18字心事)。**只報真被牽動的(0~3)；隔著地點的人，除非那動作是傳話/斷錢/規矩這種能隔空使力的，否則牽動不到。**\n各人(地點)：心事：\n${roster}\n輸出 JSON：{"ripples":[{"name":"","shift":"tighten/loosen/none","newThread":"≤18字或省略","layer":"","disp":"resolving/standing"}]}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '報。' }], maxTokens: 220, temperature: 0.5 });
    const o = parseObj(r.text); const arr = Array.isArray(o?.ripples) ? o!.ripples : [];
    for (const raw of arr) {
        const e = raw as Record<string, unknown>; const tc = living(W).find((c) => c.name === s(e.name)); if (!tc) continue;
        const live = tc.wants.filter((y) => !y.retired);
        if (live.length) { const top = live.sort((a, b) => tension(b) - tension(a))[0];
            if (s(e.shift) === 'tighten') top.sat = Math.max(0, top.sat - 0.18); else if (s(e.shift) === 'loosen') top.sat = Math.min(1, top.sat + 0.15); }
        const nt = s(e.newThread);
        if (nt && nt.length <= 22 && !tc.wants.some((y) => y.desc.includes(nt) || nt.includes(y.desc.slice(0, 8)))) tc.wants.push(w(s(e.layer) || '其他', nt, 0.7, 0.2, s(e.disp) === 'resolving' ? 'resolving' : 'standing'));
    }
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const ticks = process.argv[2] ? Number(process.argv[2]) : 24;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 多saga+scene+時鐘 · 純湧現 · ${ticks} tick\nsaga：戲園/霞飛路商店街/詩社。地點約束(跨地靠移動或通道)。白人設釘死(不唱戲)。\n`);

    const W = [...WORLD];
    const transcript: string[] = []; const acts: Array<{ who: string; saga: string; layer: string }> = []; const deaths: string[] = []; const resolved: string[] = []; const moves: string[] = [];
    let part = 0, day = 1;

    for (let tick = 1; tick <= ticks; tick++) {
        const clock = `第${day}日·${PARTS[part]}`;
        for (const b of BIRTHS) if (b.tick === tick) { const nc = b.make(); W.push(nc); transcript.push(`【世界】${nc.name}（${nc.saga}·${nc.loc}）登場。`); console.log(`\n— t${tick} ☉ 出生：${nc.name}（${nc.saga}）—`); }
        for (const c of living(W)) { c.age += 1; if (c.age >= c.lifespan) { c.alive = false; const reg = c.wants.filter((y) => !y.retired && y.disp === 'standing').sort((a, b) => b.weight - a.weight)[0]; const ess = reg ? `${reg.desc}（此生未了）` : '（了無牽掛）'; deaths.push(`${c.name}：${ess}`); transcript.push(`【世界】${c.name}去了。`); console.log(`\n— t${tick} ✝ 死亡：${c.name} — 遺憾「${ess}」`); } }
        const pool = living(W).flatMap((c) => c.wants.filter((x) => !x.retired).map((x) => ({ c, x })));
        if (!pool.length) break;
        for (const { x } of pool) { x.sat = x.sat0 + (x.sat - x.sat0) * DECAY; x.recent = Math.max(0, x.recent - 0.5); }
        const pick = pool.reduce((b, cur) => (tension(cur.x) > tension(b.x) ? cur : b));
        const { c, x } = pick;
        if (x.disp === 'resolving') x.heat += 1;
        const r = await act(client, model, c, x, W, clock, transcript.slice(-10).join('\n') || '（戲還沒開場。）');
        acts.push({ who: c.name, saga: c.saga, layer: x.layer }); x.recent += 1; transcript.push(`${c.name}：${r.action}`);
        const forced = x.disp === 'resolving' && x.heat + x.frust >= FORCE;
        console.log(`t${tick} 〔${clock}|${c.loc}·${x.layer}/${x.disp === 'resolving' ? 'R' : 'S'}〕${c.name}（張${tension(x).toFixed(2)}${forced ? '·逼' : ''}）：${r.action}`);
        if (r.inner) console.log(`        （心）${r.inner}`);
        if (r.moveTo && r.moveTo !== c.loc) { console.log(`        → ${c.name} 動身去 ${r.moveTo}`); c.loc = r.moveTo; moves.push(`${c.name}→${r.moveTo}`); }
        if (r.resolved) { x.retired = true; resolved.push(`${c.name}「${x.desc.slice(0, 18)}」`); console.log(`        ⟐ 了結退役`); for (const y of c.wants) if (!y.retired && y.disp === 'standing') y.sat = Math.min(1, y.sat + 0.2); }
        else { x.sat = Math.min(1, x.sat + (GAIN[r.gain] ?? 0.15)); if (x.disp === 'resolving') x.frust += 1; }
        if (!x.retired && x.recent >= SAT_AT) x.sat = Math.min(1, x.sat + SAT_BUMP);
        await ripple(client, model, c.name, r.action, W);
        part = (part + 1) % PARTS.length; if (part === 0) day += 1;
    }

    console.log(`\n${'═'.repeat(78)}\n判讀（scene/時鐘/三saga/白人設）\n${'═'.repeat(78)}`);
    const bySaga = acts.reduce<Record<string, number>>((m, a) => { m[a.saga] = (m[a.saga] ?? 0) + 1; return m; }, {});
    const byLayer = acts.reduce<Record<string, number>>((m, a) => { m[a.layer] = (m[a.layer] ?? 0) + 1; return m; }, {});
    console.log(`saga 分佈：${Object.entries(bySaga).map(([k, v]) => `${k}×${v}`).join('、')}　${Object.keys(bySaga).length >= 3 ? '✓ 三 saga 都動了' : '◑'}`);
    console.log(`層分佈：${Object.entries(byLayer).map(([k, v]) => `${k}×${v}`).join('、')}`);
    console.log(`移動 ${moves.length} 次：${moves.slice(0, 8).join('、')}${moves.length > 8 ? '…' : ''}`);
    console.log(`了結 ${resolved.length}：${resolved.join('；') || '—'}　死亡 ${deaths.length}　機械事務 ${byLayer['事務'] ?? 0} 次`);
    console.log(`白人設檢查：含「唱」的句子 ${transcript.filter((t) => t.includes('唱')).length} 句（需人工確認白韻秋有無賣唱破口）`);

    const SOUL = '下面是一個沒有導演、跨三個 saga(戲園/商店街/詩社)、角色各有多慾望、且有地點與時辰的世界跑了一段。判斷各一句：(a)地點約束合理嗎(跨地靠移動/傳話而非當面瞬移)？(b)三個 saga 有沒有交織而不散？(c)那個商號千金(白韻秋)有沒有守住身份、沒去當戲子賣唱？(d)詩社捧角寫詞這條新線有沒有自然長出來？(e)五性質(焦點/廣度/收斂/懸念留著/不漂移)？輸出 JSON：{"sceneSane":bool,"sagasInterleave":bool,"baiInCharacter":bool,"poetryThread":bool,"fiveHold":bool,"comment":"一句"}。不要 markdown。';
    const jr = await chatRetry(client, { model, system: SOUL, messages: [{ role: 'user', content: transcript.filter((t) => !t.startsWith('【世界】')).join('\n') }], maxTokens: 260, temperature: 0.3 });
    const j = parseObj(jr.text) ?? {}; const tk = (b: unknown) => (b === true ? '✓' : '✗');
    console.log(`\n評審：地點合理=${tk(j.sceneSane)} 三saga交織=${tk(j.sagasInterleave)} 白守身份=${tk(j.baiInCharacter)} 詩社線長出=${tk(j.poetryThread)} 五性質=${tk(j.fiveHold)}\n　— ${s(j.comment)}`);
    console.log(`\n看：① 地點約束(跨地靠移動/傳話) ② 三 saga 交織不散 ③ 白守住商號千金身份不賣唱 ④ 詩社捧角寫詞新線 ⑤ 五性質。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
