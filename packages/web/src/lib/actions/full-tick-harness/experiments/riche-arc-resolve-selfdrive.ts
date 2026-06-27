/**
 * 這條線怎麼收 — the rich-character dilemma (柳生春 said「讓我再想想」to good 白韻秋's offer) run through
 * the fully-emergent engine (no 編場; events from collision; frustration→escalation forces convergence)
 * until it 落幕s, then a full 柳生春 POV of the closing moment so we SEE the prose of how it ends.
 * Rich柳生春 (戲痴/頭牌志向/怕老/師父「戲比天大」), ambiguous 柳↔蘇 bond, good 白韻秋, 班主田巧雲 who can't
 * bear to lose her 台柱苗子. The question: with her whole world in play, does she go or stay, and at what cost?
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/riche-arc-resolve-selfdrive.ts [maxTicks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

type Client = ReturnType<typeof llmText.createTextClient>;
type Char = { name: string; persona: string; location: string; pressure: string; memories: string[] };
const LOCS = '春雪社後台 / 春雪社帳房 / 白公館 / 戲園前街';
const WORLD: Char[] = [
    { name: '柳生春', persona: '春雪社當紅女小生（坤生），七歲坐科熬到今天，對這門戲痴到骨頭、暗想熬成第一女小生、怕老怕被後浪蓋過；師父臨終給她摺扇只說「戲比天大」。台上風流台下嬌軟。她是個有自己一整個世界的人，不為任何人而活。', location: '春雪社後台', pressure: '白韻秋的邀約頭一回叫我真動搖了——一邊是我愛到骨頭的戲、熬頭牌的志向、跟師姐那份說不清的牽絆，一邊是不必再怕老怕被蓋過的安穩。我說了再想想，可這主意，終究得我自己拿。', memories: [] },
    { name: '蘇映雪', persona: '春雪社台柱花旦，和柳生春搭了七八年生旦；那份牽絆介於姊妹、知己、老搭檔、戲假情真之間，近乎情愛卻不點破。她方才面對白韻秋的真心，讓開了道。', location: '春雪社後台', pressure: '我讓開了道，可我捨不得生春走——那份我自己都不肯叫出名字的牽絆，我該不該挽留她、又能不能。', memories: [] },
    { name: '白韻秋', persona: '霞飛路綢緞大莊獨養千金，嬌憨心細、闊綽卻體面不仗勢；真心疼柳生春、看懂台下那個累壞的她，絕不逼人、被拒不糾纏。', location: '白公館', pressure: '我把真心給了，她說再想想；我不逼她、只盼著等著她的回音，可這等待最煎熬，我又怕逼緊了反倒嚇跑了她。', memories: [] },
    { name: '田巧雲', persona: '春雪社班主、當家的，精明持重，眼看進項靠山與全班生計，算盤先於情分卻也疼底下人。', location: '春雪社帳房', pressure: '柳生春是戲班的台柱苗子，白家要把她接走，我捨不得這棵搖錢樹、也疼這孩子，得想法子留住她，又不能真害了她。', memories: [] },
];
const isResolved = (p: string) => !p || p === '無' || p === '無。';

interface D { beat: string; close: 'none' | 'leave' | 'resolve' | 'stall'; closeReason: string }
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
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

async function decide(client: Client, model: string, c: Char, rumors: string[], frust: number): Promise<{ act: string; goto: string; seek: string; forcing: boolean; pressure: string } | null> {
    const heat = frust >= 4 ? '（你為這件事反覆碰壁太多次，再也拖不下去了——這一拍你必須做個不可逆的了結：拿定主意、攤牌、認了、或抽身。絕不准再重複老動作。forcing 必須 true。）' : frust >= 2 ? '（你開始撐不住懸著了，老套路沒用，這一拍得往前一步、逼近一個了斷。）' : '（你還能再緩緩、再想想。）';
    const sys = `你就是${c.name}。${c.persona}\n你此刻在【${c.location}】。**你心裡放不下、要解決的事**：${c.pressure}\n你記得：${c.memories.slice(-3).join('；') || '（暫無）'}\n近來風聲：${rumors.slice(-3).join('；') || '（暫無）'}\n${heat}\n\n沒人指揮你——照你這個人、為你心裡那件事，自己決定這一拍：去哪、找誰、逼一個了斷、還是再緩緩。別重複上一拍。場景：${LOCS}。\n輸出 JSON：{"act":"客觀一句","goto":"場景","seek":"找誰(無就無)","forcing":true/false,"pressure":"還放不下的(真了結就填無)"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '輪到你。這一拍?輸出 JSON。' }], maxTokens: 200, temperature: 0.92 });
    const o = parseObj(r.text);
    if (!o || !s(o.act)) return null;
    return { act: s(o.act), goto: s(o.goto) || c.location, seek: s(o.seek), forcing: o.forcing === true, pressure: s(o.pressure) || c.pressure };
}
async function takeBeat(client: Client, model: string, c: Char, transcript: string, closing?: string): Promise<D | null> {
    const rule = closing ?? '能自然收場就收(resolve/leave/stall)；別一拍收死。**若你心裡那件事這場能逼出個了斷，就逼。**';
    const sys = `你就是${c.name}。${c.persona}（心裡放不下：${c.pressure}）\n進行中的戲，下面【客觀經過】是在場人看得見聽得見的。**輪到你，回應剛剛發生的**，別自說自話。${rule}\n輸出 JSON：{"beat":"客觀一句","inner":"心裡一句","addressed":"對誰","close":"none/leave/resolve/stall","closeReason":"若收場為何"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【客觀經過】\n${transcript}\n\n輪到你（${c.name}）。輸出 JSON。` }], maxTokens: 220, temperature: 0.9 });
    const o = parseObj(r.text);
    if (!o || !s(o.beat)) return null;
    const close = s(o.close) as D['close'];
    return { beat: s(o.beat), close: ['leave', 'resolve', 'stall'].includes(close) ? close : 'none', closeReason: s(o.closeReason) };
}
async function runEvent(client: Client, model: string, setup: string, cast: Char[], maxTurns: number): Promise<string[]> {
    const transcript = [setup];
    const last = new Map<string, number>(cast.map((c) => [c.name, -1]));
    let next = cast[0].name, turn = 0;
    while (turn < maxTurns) {
        turn++;
        const c = cast.find((x) => x.name === next)!;
        const d = await takeBeat(client, model, c, transcript.join('\n'));
        if (!d) break;
        transcript.push(`${c.name}：${d.beat}`); last.set(c.name, turn);
        console.log(`     [${turn}] ${c.name}　${d.beat}`);
        if (d.close !== 'none') {
            const note = `（場子要收了：${c.name} 收場「${d.closeReason}」。你最後一拍——回應/退場，別起新話題。close 填 leave/none。）`;
            for (const o of cast.filter((x) => x.name !== c.name)) { if (turn >= maxTurns) break; turn++; const od = await takeBeat(client, model, o, transcript.join('\n'), note); if (!od) continue; transcript.push(`${o.name}：${od.beat}`); console.log(`     [${turn}] ${o.name}（收場拍）　${od.beat}`); }
            break;
        }
        const a = cast.find((x) => x.name !== c.name && d.beat.includes(x.name));
        next = a ? a.name : [...cast].sort((x, y) => last.get(x.name)! - last.get(y.name)!)[0].name;
    }
    return transcript.slice(1);
}
async function resolve(client: Client, model: string, transcript: string, names: string[]): Promise<{ outcome: string; perChar: { name: string; pressure: string }[] }> {
    const sys = `你是世界的結算員。讀【經過】，抽結果。對每個在場角色判斷這場之後他「還放不下的那件事(pressure)」變成什麼——若這場讓他的心事真有了不可逆的了結或他放下了就填『無』，否則填新的。**若有人做了不可逆的決定/攤了牌/走了，相關的人壓力該真的了結或決定性變掉，別讓它原地打轉。** 在場：${names.join('、')}。\n輸出 JSON：{"outcome":"客觀結局(一句)","perChar":[{"name":"","pressure":"還放不下的(解決填無)"}]}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【經過】\n${transcript}\n\n抽 outcome + 每個在場角色的新 pressure。` }], maxTokens: 400, temperature: 0.4 });
    const o = parseObj(r.text) ?? {};
    const per = Array.isArray(o.perChar) ? (o.perChar as Record<string, unknown>[]).map((x) => ({ name: s(x.name), pressure: s(x.pressure) })).filter((x) => x.name) : [];
    return { outcome: s(o.outcome), perChar: per };
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const maxTicks = process.argv[2] ? Number(process.argv[2]) : 8;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 這條線怎麼收（豐厚角色 × 全湧現 × 跑到落幕）· 最多 ${maxTicks} tick\n`);
    const rumors: string[] = [];
    const frust = new Map<string, number>(WORLD.map((c) => [c.name, 0]));
    let lastTranscript: string[] = [], lastCast: string[] = [];

    for (let tick = 1; tick <= maxTicks; tick++) {
        const active = WORLD.filter((c) => !isResolved(c.pressure));
        if (active.length === 0) { console.log(`\n══════ 全員心事都了了 → 落幕（tick ${tick - 1}）══════`); break; }
        console.log(`\n${'═'.repeat(80)}\nTICK ${tick}　${active.map((c) => `${c.name}@${c.location}`).join('、')}\n${'═'.repeat(80)}`);
        const seeks: { who: Char; target: string; forcing: boolean }[] = [];
        for (const c of active) {
            const d = await decide(client, model, c, rumors, frust.get(c.name) ?? 0);
            if (!d) continue;
            console.log(`  · ${c.name}${(frust.get(c.name) ?? 0) >= 4 ? '〔再拖不下去〕' : ''}：${d.act}${d.seek && d.seek !== '無' ? `（找 ${d.seek}）` : ''}${d.forcing ? '〔逼了斷〕' : ''}`);
            c.location = d.goto; c.pressure = d.pressure; c.memories.push(d.act);
            if ((d.seek && d.seek !== '無') || d.forcing) seeks.push({ who: c, target: d.seek, forcing: d.forcing });
        }
        for (const so of seeks) { const t = WORLD.find((x) => x.name === so.target); if (t) so.who.location = t.location; }
        const byLoc = new Map<string, Char[]>();
        for (const c of WORLD) { const l = byLoc.get(c.location) ?? []; l.push(c); byLoc.set(c.location, l); }
        for (const [loc, present] of byLoc) {
            if (present.length < 2) continue;
            const crossing = seeks.some((so) => present.includes(so.who) && (so.forcing || present.some((p) => p.name === so.target)));
            if (!crossing) continue;
            console.log(`\n  ▶ 事件 @${loc}：${present.map((p) => p.name).join('、')}`);
            const boiling = present.filter((p) => (frust.get(p.name) ?? 0) >= 4).map((p) => p.name);
            const setup = `【場】${loc}。${present.map((p) => p.name).join('、')}撞在一處。${boiling.length ? `（${boiling.join('、')}已忍到極處，這場非有個了斷不可。）` : ''}`;
            const transcript = await runEvent(client, model, setup, present, 4);
            const res = await resolve(client, model, [setup, ...transcript].join('\n'), present.map((p) => p.name));
            console.log(`     ⟐ 結局：${res.outcome}`);
            rumors.push(res.outcome);
            lastTranscript = [setup, ...transcript]; lastCast = present.map((p) => p.name);
            for (const pc of res.perChar) { const ch = WORLD.find((x) => x.name === pc.name); if (ch) { ch.pressure = pc.pressure; console.log(`       · ${pc.name} → ${pc.pressure}`); } }
        }
        for (const c of WORLD) { if (isResolved(c.pressure)) frust.set(c.name, 0); else if (active.includes(c)) frust.set(c.name, (frust.get(c.name) ?? 0) + 1); }
    }

    // full POV of the closing moment, from 柳生春 if she was in the last event
    if (lastCast.includes('柳生春') && lastTranscript.length) {
        const SOUL: characterWorker.SagaSoul = { toneRegister: '梨園後台的質地：身段、調門、妝面、台下目光、行頭冷暖；含蓄、戲味。', emotionalStance: 'tender' };
        const snap: characterWorker.CharacterSnapshot = { id: '0xliu', name: '柳生春', role: '小生', gender: '女', ageYears: 24, sagaName: '春雪社', sceneName: '收場', physicalFacts: '春雪社當紅女小生（坤生），瘦高帥美，台上風流台下嬌軟，痴戲、暗想頭牌、怕老。', attributes: { appearance: 88, constitution: 70, acuity: 82, disposition: 76 } };
        const sys = characterWorker.buildPovSystemPrompt(SOUL, 'pov');
        const user = characterWorker.buildPovUserPrompt({ character: snap, triggerNarrative: '這條線到了收場的這一刻——你終於拿了主意。', recentMemorySnippets: ['師父臨終把摺扇給你，只說「戲比天大」。', '你跟師姐搭了七八年生旦，那牽絆說不清。', '白韻秋是真心待你、看懂你辛苦的好人。'], relationshipHints: ['對蘇映雪：說不清的生旦牽絆。', '對白韻秋：真心待你的好人。'], sceneBeats: lastTranscript.slice(1), state: { hunger: 0.3, fatigue: 0.6, mood: 0, note: '這條線收場了，你拿了主意。' }, closing: true });
        const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: user }], maxTokens: 1500, temperature: 0.84 });
        console.log(`\n${'─'.repeat(80)}\n━━━━ 收場 · 柳生春 POV（完整正文）━━━━\n${r.text.trim()}\n`);
    }
    const left = WORLD.filter((c) => !isResolved(c.pressure));
    console.log(`${'═'.repeat(80)}\n${left.length === 0 ? '本線落幕：心事都了了。' : `（跑滿，仍懸：${left.map((c) => `${c.name}「${c.pressure}」`).join('；')}）`}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
