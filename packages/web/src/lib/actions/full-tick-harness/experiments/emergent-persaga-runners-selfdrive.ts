/**
 * 每 saga 一個 runner（正確架構）— §2.40 was architecturally WRONG: ONE runner over all sagas, one global
 * salience pick per tick → everything collapsed onto the hottest arc, and 春雪社's other characters' parallel
 * lives were never shown. The CORRECT architecture (user): EACH saga runs its OWN runner (its own loop, own
 * salience, own focus); the three story lines run IN PARALLEL; cross-saga is just "a character from another
 * saga gets WRITTEN INTO this line's scene." So each world-tick advances EVERY saga by one beat (parallel),
 * and a character whose want targets another saga can VISIT it (be written into its scene) or use a CHANNEL.
 *
 * Each saga is self-sufficient (its own internal drama, its own gravity): 戲園(台/愛/班) · 商店街(蘇家↔白家
 * 生意聯姻+白父控女) · 詩社(詞人爭魁/爭捧角). Cross-saga hooks only: 白愛柳、卓捧戲園的角、蘇娘家催婚。
 * PINNED: 柳生春是坤生(眾所周知的女子扮小生)；白韻秋愛的是個女子、柳↔蘇是兩個女人——那年代容不下=台上才合法的根。
 *
 * Watch: ① 三 saga 並行各自生戲(非全塌一條) ② 春雪社其他人(田/沈/蘇)有自己的平行戲(沒被白家線餓死)
 * ③ 跨 saga 角色被寫進別線的場(白→戲園、卓→戲園) ④ 柳是女生全程一致 ⑤ 各 saga 五性質。
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/emergent-persaga-runners-selfdrive.ts [worldTicks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '底色暖、有情：張力來自愛、思慕、志氣、難言、家累、生計、聲望、不得不的選擇；不血腥狗血。';
const QUEER = '柳生春是坤生（女兒身扮小生，眾所周知是女子）；愛慕她的都知道她是女子，這些情是女人之間的，那年代容不下、只能不點破——台上才是唯一能光明正大的地方。';
type Disp = 'resolving' | 'standing';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; disp: Disp; target?: string; heat: number; frust: number; recent: number; retired?: boolean }
interface Char { name: string; home: string; inSaga: string; persona: string; rel: string[]; wants: Want[]; age: number; lifespan: number; alive: boolean }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, disp: Disp, target?: string): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, disp, target, heat: 0, frust: 0, recent: 0 });
const mk = (name: string, home: string, persona: string, rel: string[], wants: Want[], lifespan: number): Char =>
    ({ name, home, inSaga: home, persona, rel, wants, age: 0, lifespan, alive: true });

const SAGAS = ['戲園', '商店街', '詩社'];
const WORLD: Char[] = [
    // 戲園 saga（自己的中心：台/愛/班/後浪）
    mk('柳生春', '戲園', '春雪社當紅坤生(女子扮小生)，戲痴、台上風流台下嬌軟、師父「戲比天大」。', ['對蘇映雪：兩個女人的雙向暗戀、不敢說破、台上才合法。', '對白韻秋：她真心待你、你說再想想的好人(她知你是女子)。'], [
        w('愛', '跟師姐在台上演對手戲——唯一能光明正大愛她的地方', 0.9, 0.35, 'standing', '蘇映雪'),
        w('志向', '熬成第一女小生', 0.6, 0.25, 'standing'),
    ], 33),
    mk('蘇映雪', '戲園', '春雪社台柱花旦，娘家是商店街蘇家綢緞莊；和柳生春搭七八年。', ['對柳生春：兩個女人的雙向暗戀、台上才敢。', '對蘇家：爹催我嫁人/接鋪子、別在戲班蹉跎。'], [
        w('愛', '守住跟柳生春只在台上的默契', 0.88, 0.32, 'standing', '柳生春'),
        w('家族', '娘家催我相親接鋪子別唱戲，我從不從', 0.5, 0.3, 'resolving', '蘇崇山'),
    ], 31),
    mk('田巧雲', '戲園', '春雪社班主當家，精明持重、算盤先於情分卻也疼人。', ['對全班：飯轍都在我這。'], [
        w('戲班', '保住春雪社不散、人心不亂', 0.78, 0.3, 'standing'),
        w('事務', '平掉戲班七八年的虧空', 0.45, 0.2, 'standing'),
    ], 26),
    mk('鄭月卿', '戲園', '老牌花旦、當年第一旦，眼看被後浪蓋過。', ['對蘇映雪：來勢洶洶的後輩。'], [
        w('志向', '別被後浪蓋過、守住僅剩戲份', 0.8, 0.25, 'standing', '蘇映雪'),
    ], 14),
    mk('沈巧玲', '戲園', '剛搭班科班新秀花旦，家裡等米下鍋、急著出頭。', ['對春雪社：總跑龍套，我要爭個露臉。'], [
        w('志向', '在春雪社掙個出頭、別跑龍套', 0.78, 0.2, 'resolving'),
        w('生計', '家裡等米下鍋、得掙錢養家', 0.5, 0.25, 'standing'),
    ], 36),
    // 商店街 saga（自己的中心：蘇家↔白家生意/聯姻 + 白父控女）
    mk('白韻秋', '商店街', '白氏商號獨養千金，迷柳生春(知她是女子)、真心體面；**生意人家小姐、不會唱戲，自立靠鋪子/體己/見識**。', ['對柳生春：放心尖上、說了「我養您」的女子。', '對家裡：父親嚴、這回難。'], [
        w('恩客', '找個不逾矩的方式長久留在柳生春身邊', 0.85, 0.22, 'standing', '柳生春'),
        w('家族', '家裡要送我出國讀書光耀門楣、我從不從', 0.5, 0.3, 'resolving', '白崇仁'),
    ], 35),
    mk('白崇仁', '商店街', '白氏商號家主、白韻秋的父親，重門楣嫌戲子；女兒用度由他撥 ENDLESS。', ['對白韻秋：我的女兒，不能讓她在戲園敗了名聲。', '對蘇崇山：蘇家綢緞莊是老對手，也是可聯姻的門當。'], [
        w('家族', '把女兒弄出戲園送出國、不從就斷她 ENDLESS', 0.8, 0.25, 'resolving', '白韻秋'),
        w('生意', '跟蘇家談一樁聯姻或併購、壓過對手獨大霞飛路', 0.6, 0.25, 'resolving', '蘇崇山'),
    ], 42),
    mk('蘇崇山', '商店街', '蘇家綢緞莊家主、蘇映雪的父親，務實愛面子，盼女兒嫁好別在戲班。', ['對蘇映雪：盼她相門好親、接鋪子。', '對白崇仁：白家是老對手，這聯姻是利是險難說。'], [
        w('家族', '把女兒蘇映雪從戲班拉回來、相一門好親', 0.65, 0.25, 'resolving', '蘇映雪'),
        w('生意', '跟白家這樁聯姻/併購，到底結不結', 0.55, 0.28, 'resolving', '白崇仁'),
    ], 44),
    // 詩社 saga（自己的中心：詞人爭魁、爭捧誰）
    mk('卓清漪', '詩社', '漱玉詩社詞人，清高自許，愛為台上最動人的角兒填新詞捧她傳世。', ['對樊既明：同社的對頭，文無第一卻偏要爭。', '對戲園：那兒有真懂戲的角兒，我願為她寫一闋傳世詞。'], [
        w('藝文', '挑中那個最動我心的角兒、為她寫闋新詞捧她傳世', 0.78, 0.2, 'resolving'),
        w('詩社', '壓過樊既明、坐穩漱玉詩社頭把交椅', 0.62, 0.28, 'standing', '樊既明'),
    ], 40),
    mk('樊既明', '詩社', '漱玉詩社老詞人，講究法度，瞧不上卓清漪捧戲子那套。', ['對卓清漪：後生太輕狂，捧戲子算什麼風雅。'], [
        w('詩社', '證明法度詞章才正宗、把卓清漪那套捧角壓下去', 0.66, 0.25, 'standing', '卓清漪'),
    ], 46),
];

const PARTS = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'];
const tension = (x: Want) => x.weight * (1 - x.sat);
const GAIN: Record<string, number> = { 小: 0.15, 中: 0.32, 大: 0.55 };
const DECAY = 0.6, FORCE = 3, SAT_AT = 3, SAT_BUMP = 0.26;
const sagaOf = (name: string, W: Char[]) => W.find((c) => c.name === name)?.home;

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g); if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown; for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } } throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const inSaga = (W: Char[], saga: string) => W.filter((c) => c.alive && c.inSaga === saga);

function forceNote(x: Want): string {
    if (x.disp === 'standing') return '這是長久的懸念，不必今天了結。';
    const f = x.heat + x.frust;
    if (f < 2) return '還能緩，但懸著不是辦法。'; if (f < FORCE) return '日子推著你了，不能總這麼懸。';
    return `不能再懸了。這一下**必須給「${x.desc}」一個放不回頭的答案**，可以疼可以不捨但要真。`;
}
async function act(client: Client, model: string, c: Char, x: Want, W: Char[], clock: string): Promise<{ action: string; inner: string; gain: string; resolved: boolean; visit?: string }> {
    const here = inSaga(W, c.inSaga).filter((o) => o.name !== c.name).map((o) => o.name);
    const tgt = x.target ? W.find((o) => o.name === x.target && o.alive) : undefined;
    const cross = tgt && sagaOf(tgt.name, W) !== c.inSaga ? `你想牽涉的${tgt.name}在【${tgt.home}】saga（不在你這場）——你可動身過去(visit)被寫進那邊的戲、或傳話/用銀錢規矩等通道隔空使力。` : '';
    const sys = `你就是${c.name}（${c.home} saga）。${c.persona}\n${c.rel.join('\n')}\n${QUEER}\n${WARM}\n【此刻】${clock}，你在【${c.inSaga}】這條故事線；同場：${here.length ? here.join('、') : '只你一人'}。${cross}\n你心裡最重的：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forceNote(x)}\n做你此刻真會做的一件事（開放一句、只能對在場的人當面做）。要去別 saga 找人就填 visit。\n輸出 JSON：{"action":"一句","inner":"一句","gain":"小/中/大","resolved":true/false,"visit":"要去的saga名(戲園/商店街/詩社)或省略"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '輪到你。' }], maxTokens: 230, temperature: 0.92 });
    const o = parseObj(r.text) ?? {}; const v = s(o.visit);
    return { action: s(o.action) || '（沉默。）', inner: s(o.inner), gain: ['小', '中', '大'].includes(s(o.gain)) ? s(o.gain) : '小', resolved: o.resolved === true, visit: SAGAS.includes(v) && v !== c.inSaga ? v : undefined };
}
async function ripple(client: Client, model: string, actor: string, action: string, sceneChars: Char[], W: Char[]): Promise<void> {
    // ripple within this saga's scene + cross-saga only via clear channel.
    const roster = W.filter((c) => c.alive && c.name !== actor).map((c) => `${c.name}(${c.inSaga})：${c.wants.filter((y) => !y.retired).map((y) => y.desc).join('；') || '—'}`).join('\n');
    const sys = `${actor} 剛做了：「${action}」。誰被牽動(緊tighten/鬆loosen，或牽出≤18字新心事)。**同場的可直接牽動；不同場的人，只有當動作是傳話/斷錢/聯姻提親這種隔空通道才牽動得到，否則別動。** 只報真被牽動(0~3)。\n各人(所在線)：心事：\n${roster}\n輸出 JSON：{"ripples":[{"name":"","shift":"tighten/loosen/none","newThread":"≤18字或省略","layer":"","disp":"resolving/standing"}]}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '報。' }], maxTokens: 200, temperature: 0.5 });
    const o = parseObj(r.text); const arr = Array.isArray(o?.ripples) ? o!.ripples : [];
    for (const raw of arr) {
        const e = raw as Record<string, unknown>; const tc = W.find((c) => c.alive && c.name === s(e.name)); if (!tc) continue;
        const live = tc.wants.filter((y) => !y.retired);
        if (live.length) { const top = live.sort((a, b) => tension(b) - tension(a))[0]; if (s(e.shift) === 'tighten') top.sat = Math.max(0, top.sat - 0.18); else if (s(e.shift) === 'loosen') top.sat = Math.min(1, top.sat + 0.15); }
        const nt = s(e.newThread);
        if (nt && nt.length <= 22 && !tc.wants.some((y) => y.desc.includes(nt) || nt.includes(y.desc.slice(0, 8)))) tc.wants.push(w(s(e.layer) || '其他', nt, 0.7, 0.2, s(e.disp) === 'resolving' ? 'resolving' : 'standing'));
    }
    void sceneChars;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const worldTicks = process.argv[2] ? Number(process.argv[2]) : 11;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 每 saga 一個 runner(三線並行) · 跨 saga 寫入 · 柳是女子釘死 · ${worldTicks} world-tick\n`);

    const W = [...WORLD];
    const lines: Record<string, string[]> = { 戲園: [], 商店街: [], 詩社: [] };
    const beats: Array<{ saga: string; who: string; layer: string }> = []; const visits: string[] = []; const deaths: string[] = []; const resolved: string[] = [];
    let part = 0, day = 1;

    for (let tick = 1; tick <= worldTicks; tick++) {
        const clock = `第${day}日·${PARTS[part]}`;
        for (const c of W.filter((c) => c.alive)) { c.age += 1; if (c.age >= c.lifespan) { c.alive = false; const reg = c.wants.filter((y) => !y.retired && y.disp === 'standing').sort((a, b) => b.weight - a.weight)[0]; deaths.push(`${c.name}(${c.home})：${reg ? reg.desc : '了無牽掛'}（此生未了）`); console.log(`  ✝ ${c.name} 去了（遺憾「${reg ? reg.desc : '—'}」）`); } }
        console.log(`\n──────── ${clock} ────────`);
        // EACH saga runs ONE beat this world-tick — three story lines in parallel.
        for (const saga of SAGAS) {
            const pool = inSaga(W, saga).flatMap((c) => c.wants.filter((x) => !x.retired).map((x) => ({ c, x })));
            if (!pool.length) { console.log(`  〔${saga}〕（此刻無人在場）`); continue; }
            for (const { x } of pool) { x.sat = x.sat0 + (x.sat - x.sat0) * DECAY; x.recent = Math.max(0, x.recent - 0.5); }
            const pick = pool.reduce((b, cur) => (tension(cur.x) > tension(b.x) ? cur : b));
            const { c, x } = pick;
            if (x.disp === 'resolving') x.heat += 1;
            const r = await act(client, model, c, x, W, clock);
            beats.push({ saga, who: c.name, layer: x.layer }); x.recent += 1;
            const forced = x.disp === 'resolving' && x.heat + x.frust >= FORCE;
            const visitTag = c.inSaga !== c.home ? `[客${c.home}]` : '';
            console.log(`  〔${saga}〕${c.name}${visitTag}（${x.layer}/${x.disp === 'resolving' ? 'R' : 'S'}·張${tension(x).toFixed(2)}${forced ? '·逼' : ''}）：${r.action}`);
            if (r.inner) console.log(`            （心）${r.inner}`);
            lines[saga].push(`${c.name}：${r.action}`);
            if (r.visit) { console.log(`            → ${c.name} 動身去【${r.visit}】被寫進那邊`); c.inSaga = r.visit; visits.push(`${c.name}:${c.home}→${r.visit}`); }
            if (r.resolved) { x.retired = true; resolved.push(`${c.name}「${x.desc.slice(0, 16)}」`); console.log(`            ⟐ 了結`); for (const y of c.wants) if (!y.retired && y.disp === 'standing') y.sat = Math.min(1, y.sat + 0.2); }
            else { x.sat = Math.min(1, x.sat + (GAIN[r.gain] ?? 0.15)); if (x.disp === 'resolving') x.frust += 1; }
            if (!x.retired && x.recent >= SAT_AT) x.sat = Math.min(1, x.sat + SAT_BUMP);
            await ripple(client, model, c.name, r.action, inSaga(W, saga), W);
        }
        part = (part + 1) % PARTS.length; if (part === 0) day += 1;
    }

    console.log(`\n${'═'.repeat(78)}\n判讀（每 saga 一個 runner）\n${'═'.repeat(78)}`);
    const bySaga = beats.reduce<Record<string, number>>((m, b) => { m[b.saga] = (m[b.saga] ?? 0) + 1; return m; }, {});
    console.log(`① 三線並行：${Object.entries(bySaga).map(([k, v]) => `${k}×${v}`).join('、')}　${Object.keys(bySaga).length >= 3 && Math.min(...Object.values(bySaga)) >= worldTicks * 0.5 ? '✓ 三 saga 都活、沒一條餓死' : '◑'}`);
    const tw = beats.filter((b) => b.saga === '戲園');
    const twWho = tw.reduce<Record<string, number>>((m, b) => { m[b.who] = (m[b.who] ?? 0) + 1; return m; }, {});
    console.log(`② 春雪社平行人生：${Object.entries(twWho).map(([k, v]) => `${k}×${v}`).join('、')}　${Object.keys(twWho).length >= 3 ? '✓ 田/沈/蘇等都有自己的戲' : '◑ 仍少數人壟斷'}`);
    console.log(`③ 跨 saga 寫入：${visits.length} 次　${visits.join('、') || '無'}　${visits.length > 0 ? '✓ 別 saga 角色被寫進別線' : '✗'}`);
    console.log(`了結 ${resolved.length}：${resolved.join('；') || '—'}　死亡 ${deaths.length}`);

    const judgeInput = SAGAS.map((s2) => `【${s2} 線】\n${lines[s2].join('\n')}`).join('\n\n');
    const SOUL = '下面是三條由不同 saga 各自的 runner 並行跑出來的故事線(戲園/商店街/詩社)。判斷各一句：(a)三條線是否各自活著、有自己的中心、非全擠成一條？(b)戲園這條裡，除了主角戀情，其他人(班主/新秀/老牌)有沒有自己的戲？(c)跨 saga 的角色(如白韻秋去戲園、詞人捧角)被寫進別線時自然嗎？(d)柳生春是女子(坤生)、那些愛是女人之間的，有沒有守住、沒漂成異性戀？(e)整體像不像幾個並行的世界各自生長又偶爾交織？輸出 JSON：{"parallelAlive":bool,"othersHaveStories":bool,"crossSagaNatural":bool,"queerConsistent":bool,"feelsLikeWorlds":bool,"comment":"一句"}。不要 markdown。';
    const jr = await chatRetry(client, { model, system: SOUL, messages: [{ role: 'user', content: judgeInput }], maxTokens: 260, temperature: 0.3 });
    const j = parseObj(jr.text) ?? {}; const tk = (b: unknown) => (b === true ? '✓' : '✗');
    console.log(`\n評審：三線並行=${tk(j.parallelAlive)} 他人有戲=${tk(j.othersHaveStories)} 跨saga自然=${tk(j.crossSagaNatural)} 柳是女子一致=${tk(j.queerConsistent)} 像並行世界=${tk(j.feelsLikeWorlds)}\n　— ${s(j.comment)}`);
    console.log(`\n看：① 三 saga 各自一個 runner 並行不塌 ② 春雪社其他人有平行戲 ③ 跨 saga 寫入自然 ④ 柳是女子守住 ⑤ 像幾個並行世界。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
