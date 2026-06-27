/**
 * 全湧現弧 · 無編場 — events FORM from characters autonomously acting on their own carried
 * pressures and COLLIDING, not from an external 編場 picking threads + staging scenes (that was a
 * director by another name). Each tick: every character with a live pressure decides where to go /
 * whom to seek / whether to force a reckoning — on their own. When their moves co-locate them with
 * crossing intents, an event self-forms (the interaction loop runs); its resolution updates EACH
 * participant's pressure. The arc 落幕s emergently when every pressure is resolved (someone made the
 * irreversible move), not when a director forces a climax.
 *
 * threads → per-character pressures; 編場 → autonomous move + collision; forced climax → a character
 * pushed by their own escalating pressure into an irreversible act.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/emergent-arc-selfdrive.ts [maxTicks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
type Char = { name: string; persona: string; location: string; pressure: string; memories: string[] };
const LOCS = '春雪社後台 / 春雪社帳房 / 白公館 / 戲園 / 街上';
const WORLD: Char[] = [
    { name: '柳生春', persona: '春雪社當紅女小生（坤生），台上風流台下嬌軟、最黏師姐蘇映雪；不愛應酬權貴，但戲班為難的關口未必拗得過，會掙扎。', location: '春雪社後台', pressure: '躲開白家千金的糾纏，只想守著師姐過日子。', memories: [] },
    { name: '蘇映雪', persona: '春雪社台柱花旦，懂分寸會圓場；秘密把師妹柳生春當小郎君，不肯讓糖。', location: '春雪社後台', pressure: '護著柳生春，別讓白家把她分走。', memories: [] },
    { name: '白韻秋', persona: '霞飛路綢緞大莊獨養千金，嬌養任性、精明、迷柳生春的風流小生，出手極闊綽、慣於用錢與勢拿到想要的；被回絕咽不下這口氣。', location: '白公館', pressure: '一定要把柳生春弄到我跟前，不容她這麼回絕我。', memories: [] },
    { name: '白家管家', persona: '白公館老管家，盡責規矩、不諳風月，只認小姐吩咐、替小姐跑腿遞銀子。', location: '白公館', pressure: '無', memories: [] },
    { name: '田巧雲', persona: '春雪社班主、當家的，精明持重，眼看進項靠山與全班生計，算盤先於情分卻也疼底下人。', location: '春雪社帳房', pressure: '戲班缺進項缺靠山，白家是塊闊靠山，想攬住、未必不會勸柳生春順著。', memories: [] },
];

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
const isResolved = (p: string) => !p || p === '無' || p === '無。';

// one character autonomously decides their move this tick (no director).
// `frust` = how many ticks this pressure has stalled without resolving → forces escalation, so the
// world can't sit in a repeating standoff (drama = change; a sustainable status quo must be made
// UNsustainable by mounting character frustration, NOT by a director).
async function decide(client: Client, model: string, c: Char, rumors: string[], frust: number): Promise<{ act: string; goto: string; seek: string; forcing: boolean; pressure: string } | null> {
    const heat =
        frust >= 4
            ? '（**你為這件事已經反覆碰壁太多次，再也忍不住了——這一拍你必須做個不可逆的了結：攤牌、砸下代價、翻臉、認了、或乾脆抽身走人。絕不准再重複之前那套被擋回去的老動作。** forcing 必須 true。）'
            : frust >= 2
              ? '（你開始不耐了，老套路顯然沒用，這一拍得更進一步、加碼施壓，別再原地打轉。）'
              : '（你還有耐性，可以從容試探、迂迴。）';
    const sys = `你就是${c.name}。${c.persona}\n你此刻在【${c.location}】。**你心裡放不下、想解決的事**：${c.pressure}\n你記得：${c.memories.slice(-3).join('；') || '（暫無）'}\n近來風聲：${rumors.slice(-3).join('；') || '（暫無）'}\n${heat}\n\n新的一刻，輪到你動。**沒人從上面指揮你——照你這個人、為了你心裡那件事，自己決定這一拍做什麼**：去哪、找誰、逼一個了結、還是就留著等。**別重複你上一拍做過的同一件事。** 場景可選：${LOCS}。\n輸出 JSON：{"act":"你做的事(客觀一句)","goto":"你去/留的場景","seek":"你要找/逼/見的人(無就填無)","forcing":true/false（你是不是要逼一個不可逆的了結、不再拖）,"pressure":"你此刻還放不下的那件事(真解決或放下了就填『無』)"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '輪到你。你這一拍做什麼？輸出 JSON。' }], maxTokens: 200, temperature: 0.92 });
    const o = parseObj(r.text);
    if (!o || !s(o.act)) return null;
    return { act: s(o.act), goto: s(o.goto) || c.location, seek: s(o.seek), forcing: o.forcing === true, pressure: s(o.pressure) || c.pressure };
}

interface Decision { beat: string; close: 'none' | 'leave' | 'resolve' | 'stall'; closeReason: string }
async function takeBeat(client: Client, model: string, c: Char, transcriptStr: string, closing?: string): Promise<Decision | null> {
    const rule = closing ?? '能自然收場就收(resolve/leave/stall)；但別一拍收死。**若你心裡那件事這場能逼出個不可逆的了結，就逼。**';
    const sys = `你就是${c.name}。${c.persona}（心裡放不下：${c.pressure}）\n進行中的戲，下面【客觀經過】是在場人都看得見聽得見的。**輪到你，回應剛剛發生的**，別自說自話。${rule}\n輸出 JSON：{"beat":"客觀一句","inner":"心裡一句","addressed":"對誰","close":"none/leave/resolve/stall","closeReason":"若收場為何"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【客觀經過】\n${transcriptStr}\n\n輪到你（${c.name}）。輸出 JSON。` }], maxTokens: 220, temperature: 0.9 });
    const o = parseObj(r.text);
    if (!o || !s(o.beat)) return null;
    const close = s(o.close) as Decision['close'];
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
        transcript.push(`${c.name}：${d.beat}`);
        last.set(c.name, turn);
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

async function resolve(client: Client, model: string, transcript: string, names: string[]): Promise<{ outcome: string; perChar: { name: string; pressure: string; memory: string }[] }> {
    const sys = `你是世界的結算員。讀這場戲【經過】，抽結果。**對每個在場角色，判斷這場之後他心裡『還放不下、想解決的那件事(pressure)』變成什麼** —— 若這場讓他的心事真有了不可逆的了結或他放下了，就填『無』；否則填他現在放不下的(可能變了、升級了)。\n**重要：若這場有人做了不可逆的決定／付了代價／攤了牌／翻了臉／走了人，相關的人壓力就該真的了結(填無)或決定性地變成新東西，別再用『暫壓未解／僵局』讓它原地打轉。** 戲要往前走。\n輸出 JSON：{"outcome":"客觀結局(一句)","perChar":[{"name":"","pressure":"他現在還放不下的(解決就填無)","memory":"留在他記憶裡的一句"}]}。在場角色：${names.join('、')}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【經過】\n${transcript}\n\n抽 outcome + 每個在場角色的新 pressure。` }], maxTokens: 500, temperature: 0.4 });
    const o = parseObj(r.text) ?? {};
    const per = Array.isArray(o.perChar) ? (o.perChar as Record<string, unknown>[]).map((x) => ({ name: s(x.name), pressure: s(x.pressure), memory: s(x.memory) })).filter((x) => x.name) : [];
    return { outcome: s(o.outcome), perChar: per };
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const maxTicks = process.argv[2] ? Number(process.argv[2]) : 8;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 全湧現弧（無編場）· 最多 ${maxTicks} tick\n`);
    const rumors: string[] = [];
    const frust = new Map<string, number>(WORLD.map((c) => [c.name, 0]));
    let eventCount = 0;

    for (let tick = 1; tick <= maxTicks; tick++) {
        const active = WORLD.filter((c) => !isResolved(c.pressure));
        if (active.length === 0) { console.log(`\n══════ 全員壓力都消了 → 弧自然落幕（tick ${tick - 1}）══════`); break; }
        console.log(`\n${'═'.repeat(80)}\nTICK ${tick}　活著的壓力：${active.map((c) => `${c.name}@${c.location}`).join('、')}\n${'═'.repeat(80)}`);

        // 1) every character with a live pressure decides autonomously (no director)
        const seeks: { who: Char; target: string; forcing: boolean }[] = [];
        for (const c of active) {
            const d = await decide(client, model, c, rumors, frust.get(c.name) ?? 0);
            if (!d) continue;
            const fl = (frust.get(c.name) ?? 0) >= 4 ? '〔忍無可忍〕' : '';
            console.log(`  · ${c.name}${fl}：${d.act}${d.seek && d.seek !== '無' ? `（找 ${d.seek}）` : ''}${d.forcing ? '〔逼了結〕' : ''}`);
            c.location = d.goto;
            c.pressure = d.pressure;
            c.memories.push(d.act);
            if ((d.seek && d.seek !== '無') || d.forcing) seeks.push({ who: c, target: d.seek, forcing: d.forcing });
        }
        // 2) seeking someone = going to them (collisions form)
        for (const sObj of seeks) { const t = WORLD.find((x) => x.name === sObj.target); if (t) sObj.who.location = t.location; }

        // 3) events self-form where ≥2 are co-located with a crossing intent
        const byLoc = new Map<string, Char[]>();
        for (const c of WORLD) { const l = byLoc.get(c.location) ?? []; l.push(c); byLoc.set(c.location, l); }
        let hadEvent = false;
        for (const [loc, present] of byLoc) {
            if (present.length < 2) continue;
            const crossing = seeks.some((sObj) => present.includes(sObj.who) && (sObj.forcing || present.some((p) => p.name === sObj.target)));
            if (!crossing) continue;
            hadEvent = true; eventCount++;
            console.log(`\n  ▶ 事件自形成 @${loc}：${present.map((p) => p.name).join('、')}`);
            const boiling = present.filter((p) => (frust.get(p.name) ?? 0) >= 4).map((p) => p.name);
            const setup = `【場】${loc}。${present.map((p) => p.name).join('、')}因各自的心事撞在一處。${boiling.length ? `（${boiling.join('、')}已忍到極處，這場非逼出個不可逆的了結不可，舊套路再使不出來了。）` : ''}`;
            const transcript = await runEvent(client, model, setup, present, 4);
            const res = await resolve(client, model, [setup, ...transcript].join('\n'), present.map((p) => p.name));
            console.log(`     ⟐ 結局：${res.outcome}`);
            rumors.push(res.outcome);
            for (const pc of res.perChar) { const ch = WORLD.find((x) => x.name === pc.name); if (ch) { ch.pressure = pc.pressure; if (pc.memory) ch.memories.push(pc.memory); console.log(`       · ${pc.name} → 壓力：${pc.pressure}`); } }
        }
        if (!hadEvent) console.log('  （這一 tick 沒人撞上、無事件）');
        // frustration mounts each tick a pressure stays live, resets when it resolves
        for (const c of WORLD) {
            if (isResolved(c.pressure)) frust.set(c.name, 0);
            else if (active.includes(c)) frust.set(c.name, (frust.get(c.name) ?? 0) + 1);
        }
    }

    console.log(`\n${'═'.repeat(80)}`);
    const left = WORLD.filter((c) => !isResolved(c.pressure));
    console.log(left.length === 0 ? `本弧落幕：所有人的壓力都解了。共 ${eventCount} 場戲。` : `（跑滿 tick，仍有未解壓力：${left.map((c) => `${c.name}「${c.pressure}」`).join('；')}；共 ${eventCount} 場戲）`);
    console.log('看:① 事件是否全由角色自主 move+碰撞形成(無編場);② 弧是否一路連貫;③ 某角色是否被自己越積越高的壓力逼到不可逆一步、讓壓力消、弧自然落幕。');
}

main().catch((e) => { console.error(e); process.exit(1); });
