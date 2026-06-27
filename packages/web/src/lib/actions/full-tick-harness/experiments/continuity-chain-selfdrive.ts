/**
 * 連貫性 · 懸念線鏈(threads) + 班主入局 + 跑到落幕 — events chain into a STORY via threads: each
 * resolution plants OPEN THREADS; the 編場 germinates the ripest into the next event; the chain runs
 * until the central conflict 落幕 (the 編場 detects it). 柳生春 is movable (not hardcoded to refuse);
 * the 班主 田巧雲 carries economic pressure (needs a patron / an unfilled schedule) and is staged in
 * when the troupe's livelihood is at stake — so 個人意願 vs 資源靠山 (§2.20) plays out live, to a finish.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/continuity-chain-selfdrive.ts [maxEvents]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
type Char = { name: string; persona: string; state: string };
const ROSTER: Char[] = [
    { name: '柳生春', persona: '春雪社當紅女小生（坤生），台上風流台下嬌軟、最黏師姐蘇映雪；志向第一女小生（暗流）。', state: '不愛應酬權貴、只想守著師姐過日子；可戲班的生計、檔期、靠山不全是你一個人能不顧的，真到了班子為難的關口，你未必拗得過——心裡會掙扎，不是鐵板一塊。' },
    { name: '蘇映雪', persona: '春雪社台柱花旦，懂分寸會圓場；秘密：把師妹柳生春當小郎君，不肯讓糖。', state: '護著生春，見不得別人來分；可她也明白戲班要吃飯，硬擋未必擋得住。' },
    { name: '白韻秋', persona: '霞飛路綢緞大莊獨養千金，嬌養任性、精明、迷柳生春的風流小生，出手極闊綽、社交圈廣、慣於用錢與勢拿到想要的。', state: '被當面回絕後咽不下這口氣，又捨不得放手，開始動用白家的錢與勢。' },
    { name: '白家管家', persona: '白公館老管家，盡責規矩、不諳風月，只認小姐吩咐。', state: '替小姐跑腿傳話、遞銀子。' },
    { name: '田巧雲', persona: '春雪社班主、當家的，精明持重，一雙眼專看進項、靠山與全班生計；最懂全班死活，算盤先於情分，卻也疼底下人。', state: '下一本戲碼還沒落定、正缺一筆撐場面的進項；白家是塊闊靠山，她捨不得推，會權衡著勸柳生春。' },
];

interface Decision { beat: string; close: 'none' | 'leave' | 'resolve' | 'stall'; closeReason: string }
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

async function takeBeat(client: Client, model: string, c: Char, transcriptStr: string, closing?: string): Promise<Decision | null> {
    const rule = closing ?? '能自然收場就收(resolve/leave/stall)；但若還有人該回應你、或沒表態，先別一拍收死。';
    const system = `你就是${c.name}。${c.persona}（${c.state}）\n這是進行中的戲，下面【客觀經過】是在場人都看得見聽得見的。**輪到你，回應剛剛發生的**，別自說自話。${rule}\n輸出 JSON：{"beat":"客觀一句","inner":"心裡一句","addressed":"對誰","close":"none/leave/resolve/stall","closeReason":"若收場為何"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system, messages: [{ role: 'user', content: `【客觀經過】\n${transcriptStr}\n\n輪到你（${c.name}）。輸出 JSON。` }], maxTokens: 220, temperature: 0.9 });
    const o = parseObj(r.text);
    if (!o || !s(o.beat)) return null;
    const close = s(o.close) as Decision['close'];
    return { beat: s(o.beat), close: ['leave', 'resolve', 'stall'].includes(close) ? close : 'none', closeReason: s(o.closeReason) };
}

async function runEvent(client: Client, model: string, setup: string, cast: Char[], maxTurns: number): Promise<string[]> {
    const transcript = [setup];
    const lastSpoke = new Map<string, number>(cast.map((c) => [c.name, -1]));
    let next = cast[0].name;
    let turn = 0;
    while (turn < maxTurns) {
        turn++;
        const c = cast.find((x) => x.name === next)!;
        const d = await takeBeat(client, model, c, transcript.join('\n'));
        if (!d) break;
        transcript.push(`${c.name}：${d.beat}`);
        lastSpoke.set(c.name, turn);
        console.log(`   [${turn}] ${c.name}　${d.beat}`);
        if (d.close !== 'none') {
            const note = `（場子要收了：${c.name} 決定收場「${d.closeReason}」。這是你最後一拍——回應/圓場/退場，別起新話題。close 填 leave 或 none。）`;
            for (const o of cast.filter((x) => x.name !== c.name)) {
                if (turn >= maxTurns) break;
                turn++;
                const od = await takeBeat(client, model, o, transcript.join('\n'), note);
                if (!od) continue;
                transcript.push(`${o.name}：${od.beat}`);
                console.log(`   [${turn}] ${o.name}（收場拍）　${od.beat}`);
            }
            break;
        }
        const addr = cast.find((x) => x.name !== c.name && d.beat.includes(x.name));
        next = addr ? addr.name : [...cast].sort((a, b) => lastSpoke.get(a.name)! - lastSpoke.get(b.name)!)[0].name;
    }
    return transcript.slice(1);
}

async function resolve(client: Client, model: string, transcript: string): Promise<{ outcome: string; memories: string[]; threads: string[] }> {
    const sys = '你是世界的結算員。一場戲收場了，讀【客觀經過】，抽結構化結果。**openThreads = 這場留下的開放懸念/壓力/漏洞（會在日後發酵）**，每條一句、點出牽涉誰、何時引爆；**若某條主線在這場已了結，就別再列它**。\n輸出 JSON：{"outcome":"客觀結局(一句)","memories":["角色名：留在他記憶裡的一句"],"openThreads":["懸念(牽涉誰／何時引爆)"]}。不要 markdown。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【客觀經過】\n${transcript}\n\n抽出 outcome / memories / openThreads。` }], maxTokens: 500, temperature: 0.4 });
    const o = parseObj(r.text) ?? {};
    return { outcome: s(o.outcome), memories: arr(o.memories), threads: arr(o.openThreads) };
}

type Seed = { ended: true; why: string } | { ended: false; setup: string; cast: string[]; driver: string };
async function seedEvent(client: Client, model: string, threads: string[], log: string[]): Promise<Seed | null> {
    const sys = `你是這個世界的「編場」——你不寫角色該做什麼，只從【開放懸念】裡挑一條此刻最該發生、最 ripe 的，把下一場戲的局擺好，讓角色自己去演。\n**先判斷：若【開放懸念】裡的核心衝突已經塵埃落定、沒有還在燃燒的張力了（事情已落幕），就回 {"ended":true,"why":"主線為何落幕(一句)"}。** 否則挑一條最 ripe 的擺局。\n注意：若懸念牽涉戲班的生計、靠山、檔期、全班去留，**班主田巧雲**通常該在場（她當家、管進項與人心、會權衡著施壓或圓場）。\n生成：在哪、誰在場(從這些人選：${ROSTER.map((r) => r.name).join('、')})、為什麼這幾個人這時候湊在一起。**只擺局(人事時地物)，不寫對話、不寫結果、不替角色決定。**\n輸出 JSON：{"ended":false,"driver":"germinate哪條懸念","setup":"【場】…(客觀擺局)","cast":["在場角色名"]}  或  {"ended":true,"why":"…"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【開放懸念】\n${threads.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n【近來發生】\n${log.join('\n')}\n\n先判斷是否落幕；否則挑最 ripe 的擺下一場局。` }], maxTokens: 400, temperature: 0.7 });
    const o = parseObj(r.text);
    if (!o) return null;
    if (o.ended === true) return { ended: true, why: s(o.why) };
    if (!s(o.setup)) return null;
    return { ended: false, setup: s(o.setup), cast: arr(o.cast), driver: s(o.driver) };
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const maxEvents = process.argv[2] ? Number(process.argv[2]) : 6;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 連貫弧(班主入局·跑到落幕) · 最多 ${maxEvents} 事件\n`);

    const threadPool: string[] = [
        '白韻秋迷柳生春的風流小生、下帖請她去洋樓作陪（牽涉柳生春/白韻秋；白韻秋動用錢勢時引爆）',
        '春雪社下一本戲碼未定、正缺一筆撐場面的進項，班主田巧雲盼一門闊靠山（牽涉田巧雲/全班；白家肯出錢時引爆，班主可能權衡著逼柳生春順著）',
        '春雪社第一女小生之位，柳生春靠日積月累在逼近（牽涉柳生春/鄭月卿；聲望追上時引爆）',
    ];
    const worldLog: string[] = [];
    let setup = '【場】散戲後的後台妝閣。柳生春剛卸了一半妝，蘇映雪正替她解扣，挨得近。白家管家捧著燙金帖子進來討一句準話：白韻秋請柳老闆去洋樓作陪。三人都在。';
    let cast = ['柳生春', '蘇映雪', '白家管家'];
    let ended: { why: string } | null = null;

    for (let ev = 1; ev <= maxEvents; ev++) {
        console.log(`\n${'═'.repeat(80)}\n事件 ${ev}${ev > 1 ? '（從上一個事件的懸念種出來）' : ''}\n${'═'.repeat(80)}`);
        console.log(`〔局〕${setup}\n〔在場〕${cast.join('、')}\n`);
        const castChars = cast.map((n) => ROSTER.find((r) => r.name === n)).filter((c): c is Char => !!c);
        if (castChars.length < 2) { console.log('（在場不足兩人，停）'); break; }
        const transcript = await runEvent(client, model, setup, castChars, 4);
        const res = await resolve(client, model, [setup, ...transcript].join('\n'));
        console.log(`\n  ⟐ 結局：${res.outcome}`);
        console.log(`  記憶：${res.memories.map((m) => `\n    · ${m}`).join('')}`);
        console.log(`  新懸念：${res.threads.map((t) => `\n    ▶ ${t}`).join('')}`);
        worldLog.push(`事件${ev}：${res.outcome}`);
        threadPool.push(...res.threads);

        if (ev < maxEvents) {
            const seed = await seedEvent(client, model, threadPool, worldLog);
            if (!seed) { console.log('\n（編場 seed 失敗，停）'); break; }
            if (seed.ended) { ended = { why: seed.why }; console.log(`\n  ══════ 事情落幕 ══════\n  ${seed.why}`); break; }
            console.log(`\n  ── 編場 germinate：「${seed.driver}」→ 種出下一場 ──`);
            setup = seed.setup;
            cast = seed.cast.length >= 2 ? seed.cast : cast;
        }
    }

    console.log(`\n${'═'.repeat(80)}`);
    console.log(ended ? `本弧落幕：${ended.why}` : `（跑滿 ${maxEvents} 事件，主線尚未落幕——弧更長，或編場沒判到收）`);
    console.log('看:① 班主田巧雲是否被編場拉進場、把「戲班生計 vs 柳生春意願」的張力放進來;② 沒做死的柳生春在錢勢+班主壓力下怎麼選;③ 整條弧是否一路承接、自己走到一個落幕。');
}

main().catch((e) => { console.error(e); process.exit(1); });
