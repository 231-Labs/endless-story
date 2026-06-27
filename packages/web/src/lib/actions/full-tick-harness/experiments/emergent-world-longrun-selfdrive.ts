/**
 * 長整合驗證 — does the world play itself out? PURELY EMERGENT, NO directing. The ONLY manual levers are
 * BIRTH (a new character appears with persona+wants; I do NOT script what they do) and DEATH (species
 * mortality: aging → death → distill essence → vacancy). Everything else — relationships forming/breaking,
 * who chooses what, how the troupe refills — emerges from the validated want engine (§2.37):
 *   tension=weight×(1−sat) salience · forcing on resolving · saturation · resolved→cool related standing ·
 *   ripple MUTATES existing wants (not the §2.37 restate-spawn bug) · aftermath spawns genuinely-new wants.
 *
 * Watch: ① cross-tick auto-regeneration (no director) ② a born character stirs relations on its own
 * ③ a death's vacancy refills on its own, world continues ④ five properties hold (focus/breadth/converge/
 * 懸念-not-forced/no-drift) ⑤ reads like a world that grows itself, not a plot I staged.
 * (蒸餾/忘川/轉生 on-chain judging deferred — here distill = log the deepest unresolved standing want.)
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/emergent-world-longrun-selfdrive.ts [ticks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '底色暖、有情：張力來自愛、思慕、志氣、難言、不得不的選擇；不要血腥狗血。';
type Disp = 'resolving' | 'standing';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; disp: Disp; target?: string; heat: number; frust: number; recent: number; retired?: boolean }
interface Char { name: string; persona: string; rel: string[]; wants: Want[]; age: number; lifespan: number; alive: boolean; bornTick: number }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, disp: Disp, target?: string): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, disp, target, heat: 0, frust: 0, recent: 0 });
const mkChar = (name: string, persona: string, rel: string[], wants: Want[], age: number, lifespan: number, bornTick = 0): Char =>
    ({ name, persona, rel, wants, age, lifespan, alive: true, bornTick });

// initial world. lifespan in tick-units (compressed: one run ≈ a stretch of lives), so a death or two lands.
const WORLD: Char[] = [
    mkChar('柳生春', '春雪社當紅女小生(坤生)，戲痴、台上風流台下嬌軟、師父臨終「戲比天大」。', ['對蘇映雪：雙向暗戀、不敢說破、台上才是唯一合法宣洩。', '對白韻秋：真心待你、你說了再想想的好人。'], [
        w('愛', '跟師姐在台上演對手戲——那是唯一能光明正大愛她的地方', 0.9, 0.35, 'standing', '蘇映雪'),
        w('志向', '熬成春雪社第一女小生', 0.62, 0.25, 'standing'),
    ], 0, 33),
    mkChar('蘇映雪', '春雪社台柱花旦，端莊會圓場，和柳生春搭七八年生旦。', ['對柳生春：雙向暗戀、不敢說破、台上才敢。'], [
        w('愛', '守住跟柳生春只在台上的默契', 0.88, 0.32, 'standing', '柳生春'),
    ], 0, 31),
    mkChar('白韻秋', '霞飛路綢緞莊獨養千金、柳生春的迷妹，真心、體面不仗勢、被婉拒不糾纏。', ['對柳生春：放在心尖上、說了「我養您」的人。'], [
        w('恩客', '找個不逾矩的方式長久留在柳生春身邊', 0.9, 0.2, 'standing', '柳生春'),
    ], 0, 35),
    mkChar('田巧雲', '春雪社班主當家，精明持重、算盤先於情分卻也疼底下人。', ['對全班：戲班的飯轍都在我這。'], [
        w('戲班', '保住春雪社不散、人心不亂', 0.78, 0.3, 'standing'),
        w('事務', '平掉戲班七八年的虧空', 0.45, 0.2, 'standing'),
    ], 0, 20),
    mkChar('鄭月卿', '春雪社老牌花旦、當年的第一旦，這幾年眼看被後浪蓋過。', ['對蘇映雪：來勢洶洶的後輩，戲是真好。'], [
        w('志向', '別被後浪蓋過、守住自己僅剩的戲份', 0.8, 0.25, 'standing', '蘇映雪'),
    ], 0, 11), // dies ~tick 11 → exercises death + distill + vacancy
];

// BIRTH pool — injected at a tick. ONLY persona + wants given; NOTHING about what they do (no directing).
interface Birth { tick: number; make: () => Char }
const BIRTHS: Birth[] = [
    { tick: 6, make: () => mkChar('顧懷之', '霞飛路綢緞行少東家，斯文票友，迷春雪社的戲；新近常來捧場。', ['對春雪社：台上的角兒都好，尤其想結識真懂戲的人。'], [
        w('傾慕', '結識台上那個讓我看戲看到失魂的角兒、走近一點', 0.82, 0.2, 'resolving', undefined),
    ], 0, 34, 6) },
    { tick: 14, make: () => mkChar('沈巧玲', '剛搭班的科班新秀花旦，年輕、功夫扎實、急著出頭。', ['對春雪社：總在跑龍套，我要爭一個露臉的位子。'], [
        w('志向', '在春雪社掙個出頭、別一直跑龍套', 0.8, 0.18, 'resolving'),
    ], 0, 36, 14) },
];

const tension = (x: Want) => x.weight * (1 - x.sat);
const GAIN: Record<string, number> = { 小: 0.15, 中: 0.32, 大: 0.55 };
const DECAY = 0.6, FORCE_THRESHOLD = 3, SATURATE_AT = 3, SAT_BUMP = 0.26, AGING = 1;

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g); if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown; for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } } throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const livingChars = (world: Char[]) => world.filter((c) => c.alive);

function forcingNote(x: Want): string {
    if (x.disp === 'standing') return '這是你心裡長久的懸念，不必今天了結，能進一寸是一寸。';
    const f = x.heat + x.frust;
    if (f < 2) return '這事還能緩，但懸著不是辦法。';
    if (f < FORCE_THRESHOLD) return '日子推著你了，這事不能總這麼懸。';
    return `不能再懸了。這一下你**必須給「${x.desc}」一個放不回頭的答案**，可以疼可以不捨但要真，不准再推半寸。`;
}
async function act(client: Client, model: string, c: Char, x: Want, transcript: string): Promise<{ action: string; inner: string; gain: string; resolved: boolean }> {
    const sys = `你就是${c.name}。${c.persona}\n${c.rel.join('\n')}\n${WARM}\n你此刻心裡最重的一件事：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forcingNote(x)}\n看著剛剛的世界經過，做出你此刻真會做的一件事（開放的一句動作或話，不是選項；可以針對任何在場的人）。\n輸出 JSON：{"action":"一句","inner":"心裡一句","gain":"小/中/大","resolved":true/false}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【近來世界】\n${transcript}\n\n輪到你（${c.name}）。` }], maxTokens: 230, temperature: 0.92 });
    const o = parseObj(r.text) ?? {};
    return { action: s(o.action) || '（沉默。）', inner: s(o.inner), gain: ['小', '中', '大'].includes(s(o.gain)) ? s(o.gain) : '小', resolved: o.resolved === true };
}
// ripple MUTATES (fix §2.37): tighten/loosen adjust an existing want; newThread spawns ONLY a genuinely new short want.
async function ripple(client: Client, model: string, actor: string, action: string, world: Char[]): Promise<void> {
    const roster = livingChars(world).filter((c) => c.name !== actor).map((c) => `${c.name}：${c.wants.filter((y) => !y.retired).map((y) => y.desc).join('；') || '（暫無）'}`).join('\n');
    if (!roster) return;
    const sys = `${actor} 剛做了：「${action}」。判斷牽動了誰：讓誰心事更緊(tighten)/更鬆(loosen)，或替誰牽出**一件全新、簡短**的心事(newThread，≤18字，且不是把舊心事換句話說)。只報真被牽動的(0~3 人)。\n各人心事：\n${roster}\n輸出 JSON：{"ripples":[{"name":"誰","shift":"tighten/loosen/none","newThread":"≤18字新心事或省略","layer":"層","disp":"resolving/standing"}]}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '報。' }], maxTokens: 220, temperature: 0.5 });
    const o = parseObj(r.text); const arr = Array.isArray(o?.ripples) ? o!.ripples : [];
    for (const raw of arr) {
        const e = raw as Record<string, unknown>; const tc = livingChars(world).find((c) => c.name === s(e.name)); if (!tc) continue;
        const live = tc.wants.filter((y) => !y.retired); if (!live.length && !s(e.newThread)) continue;
        if (s(e.shift) === 'tighten' && live.length) { live.sort((a, b) => tension(b) - tension(a))[0].sat = Math.max(0, live.sort((a, b) => tension(b) - tension(a))[0].sat - 0.18); }
        else if (s(e.shift) === 'loosen' && live.length) { live.sort((a, b) => tension(b) - tension(a))[0].sat = Math.min(1, live.sort((a, b) => tension(b) - tension(a))[0].sat + 0.15); }
        const nt = s(e.newThread);
        if (nt && nt.length <= 22 && !tc.wants.some((y) => y.desc.includes(nt) || nt.includes(y.desc.slice(0, 8)))) {
            tc.wants.push(w(s(e.layer) || '其他', nt, 0.7, 0.2, s(e.disp) === 'resolving' ? 'resolving' : 'standing'));
        }
    }
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const ticks = process.argv[2] ? Number(process.argv[2]) : 24;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 長整合驗證 · 純湧現 · 唯一手動＝出生+死亡 · ${ticks} tick\n初始：柳/蘇/白/田/鄭。出生：t6 顧懷之、t14 沈巧玲。鄭月卿壽限短(自然先走)。\n`);

    const world = [...WORLD];
    const transcript: string[] = [];
    const actedLayers: string[] = []; const deaths: string[] = []; const resolved: string[] = []; const bornNames: string[] = [];

    for (let tick = 1; tick <= ticks; tick++) {
        // BIRTH (manual lever #1)
        for (const b of BIRTHS) if (b.tick === tick) { const nc = b.make(); world.push(nc); bornNames.push(nc.name); transcript.push(`【世界】${nc.name}登場了。`); console.log(`\n— t${tick} ☉ 出生：${nc.name}（${nc.persona.split('，')[0]}）—`); }
        // DEATH (manual lever #2): species mortality. aging → death → distill essence → vacancy.
        for (const c of livingChars(world)) { c.age += AGING; if (c.age >= c.lifespan) {
            c.alive = false;
            const regret = c.wants.filter((y) => !y.retired && y.disp === 'standing').sort((a, b) => b.weight - a.weight)[0];
            const essence = regret ? `${regret.desc}（此生未了）` : '（了無牽掛）';
            deaths.push(`${c.name}：${essence}`); transcript.push(`【世界】${c.name}年壽到了，去了。`);
            console.log(`\n— t${tick} ✝ 死亡：${c.name} —　蒸餾遺憾＝「${essence}」`);
        } }
        const pool = livingChars(world).flatMap((c) => c.wants.filter((x) => !x.retired).map((x) => ({ c, x })));
        if (!pool.length) break;
        for (const { x } of pool) { x.sat = x.sat0 + (x.sat - x.sat0) * DECAY; x.recent = Math.max(0, x.recent - 0.5); }
        const pick = pool.reduce((best, cur) => (tension(cur.x) > tension(best.x) ? cur : best));
        const { c, x } = pick;
        if (x.disp === 'resolving') x.heat += 1;
        const r = await act(client, model, c, x, transcript.slice(-10).join('\n') || '（戲還沒開場。）');
        actedLayers.push(x.layer); x.recent += 1; transcript.push(`${c.name}：${r.action}`);
        const forced = x.disp === 'resolving' && x.heat + x.frust >= FORCE_THRESHOLD;
        console.log(`t${tick} 〔${x.layer}/${x.disp === 'resolving' ? 'R' : 'S'}〕${c.name}（張${tension(x).toFixed(2)}${forced ? '·逼' : ''}）：${r.action}`);
        if (r.inner) console.log(`        （心）${r.inner}`);
        if (r.resolved) { x.retired = true; resolved.push(`${c.name}「${x.desc.slice(0, 20)}」`); console.log(`        ⟐ 了結退役`);
            for (const y of c.wants) if (!y.retired && y.disp === 'standing') y.sat = Math.min(1, y.sat + 0.2); // resolved → cool related standing (跨時間廣度)
        } else { x.sat = Math.min(1, x.sat + (GAIN[r.gain] ?? 0.15)); if (x.disp === 'resolving') x.frust += 1; }
        if (!x.retired && x.recent >= SATURATE_AT) x.sat = Math.min(1, x.sat + SAT_BUMP);
        await ripple(client, model, c.name, r.action, world);
    }

    console.log(`\n${'═'.repeat(78)}\n判讀（純湧現，不導演）\n${'═'.repeat(78)}`);
    const counts = actedLayers.reduce<Record<string, number>>((m, k) => { m[k] = (m[k] ?? 0) + 1; return m; }, {});
    console.log(`行動層分佈：${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join('、')}`);
    console.log(`出生：${bornNames.join('、') || '無'}　死亡：${deaths.length}　了結：${resolved.length}`);
    console.log(`存活：${livingChars(world).map((c) => c.name).join('、')}`);
    if (deaths.length) console.log(`蒸餾的遺憾：\n${deaths.map((d) => '  ✝ ' + d).join('\n')}`);
    const debt = (counts['事務'] ?? 0);
    console.log(`機械虧空被行動 ${debt} 次　${debt === 0 ? '✓ 沉底' : '◑'}`);

    const SOUL = '下面是一個沒有導演、只放了「出生」和「死亡」、其餘全由角色心事驅動的世界跑了一段。判斷六件事各一句：(a)戲自己演下去了嗎(跨段落不斷有新戲、非停滯)？(b)出生的新角色有沒有自然攪動關係？(c)死亡有沒有留下漣漪、世界繼續？(d)有焦點嗎？(e)有收斂也有保留的懸念嗎(有事了結、也有事該開著就開著)？(f)讀起來像一個會自己長的世界、還是像有人在排戲？輸出 JSON：{"selfPlaying":bool,"birthStirs":bool,"deathRipples":bool,"focus":bool,"convergeAndOpen":bool,"feelsEmergent":bool,"comment":"一句"}。不要 markdown。';
    const jr = await chatRetry(client, { model, system: SOUL, messages: [{ role: 'user', content: transcript.filter((t) => !t.startsWith('【世界】')).join('\n') }], maxTokens: 260, temperature: 0.3 });
    const j = parseObj(jr.text) ?? {};
    const tick = (b: unknown) => (b === true ? '✓' : '✗');
    console.log(`\n評審：戲自演=${tick(j.selfPlaying)} 出生攪動=${tick(j.birthStirs)} 死亡漣漪=${tick(j.deathRipples)} 焦點=${tick(j.focus)} 收斂且留懸念=${tick(j.convergeAndOpen)} 像會自長的世界=${tick(j.feelsEmergent)}\n　— ${s(j.comment)}`);
    console.log(`\n看：① 跨 tick 自動再生(不靠導演) ② 出生攪動關係 ③ 死亡漣漪+世界繼續 ④ 五性質 ⑤ 像會自己長的世界。我只放了出生+死亡，其餘全自發。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
