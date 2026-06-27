/**
 * 組合跑 · 定稿框架整套 — assemble everything validated this line into one run, with the corrected personas
 * + seeded genesis memories the user asked for:
 *   · TICK = a time segment; each tick advances ALL live EVENTS (concurrent across scenes) by beats; the
 *     storyteller then weaves the tick's beats into a CHAPTER (章回). Output BOTH 手卷(live view) + 章回.
 *   · time is non-uniform: day ticks (清晨/日午/晡時/黃昏) are dense; one 夜 tick fast-forwards the night.
 *   · WANTS carry resistance (暗戀 high → 懸念, breaks only when earned); forcing removes-stall не writes-answer.
 *   · characters bound to SCENE not event; move when their want points elsewhere.
 * Personas corrected: 柳生春 = 蘇的師妹(蘇喚她「生春/師妹」非「哥」), 台上風流瀟灑小生(扮柳夢梅)、台下嬌軟最黏師姐;
 * 戲碼《驚夢》(柳=柳夢梅/蘇=杜麗娘). Seeded genesis memories give them a shared past + let memory echo.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/assembled-world-selfdrive.ts [ticks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '梨園的質地、含蓄、戲味、暖；張力來自愛、思慕、志氣、難言、家累、生計；不血腥狗血。';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; resistance: number; target?: string; heat: number; frust: number; retired?: boolean }
interface Char { name: string; scene: string; persona: string; mem: string[]; wants: Want[] }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, resistance: number, target?: string): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, resistance, target, heat: 0, frust: 0 });

const CHARS: Char[] = [
    { name: '柳生春', scene: '春雪社後台', persona: '春雪社當紅坤生(女子扮小生)、蘇映雪的師妹。台上是風流瀟灑的當紅小生(扮柳夢梅那等風流書生)，一個眼風勾倒滿堂看客、最享受台下的目光；一下台卻是另一個人——嬌軟、愛撒嬌、最黏師姐蘇映雪。對師姐是兩個女人說不破的雙向暗戀，唯有台上演柳夢梅對杜麗娘才被許可。',
        mem: ['七歲坐科那年，是師姐蘇映雪把躲在後台哭鼻子的你牽出來，一句一句教你「原來姹紫嫣紅開遍」。', '十六歲頭一回與師姐搭《驚夢》，你的柳夢梅對她的杜麗娘，散場滿堂彩，你到下台都分不清那聲「姐姐」是戲是真。', '師父臨終把那把舊摺扇塞進你手裡，只說「戲比天大」。'],
        wants: [w('愛', '跟師姐在台上演對手戲——唯一能光明正大愛她的地方', 0.9, 0.35, 6, '蘇映雪'), w('志向', '坐穩第一女小生、台下的目光別涼了', 0.6, 0.25, 3)] },
    { name: '蘇映雪', scene: '春雪社後台', persona: '春雪社台柱花旦、柳生春的師姐(當年帶她入門、搭了七八年生旦)。端莊明麗、會替全班圓場。演杜麗娘。**你喚柳生春「生春」或「師妹」——她台上扮小生，可她是你嬌軟愛黏你的師妹，斷不喚她「哥」。** 對師妹是說不破的暗戀。',
        mem: ['你帶柳生春入門，看著那個躲後台哭的小丫頭、一年年熬成滿堂彩的當紅小生。', '七八年的生旦，台上千百回的杜麗娘與柳夢梅，那份牽絆你不肯叫名字。'],
        wants: [w('愛', '守住跟柳生春只在台上的默契、別讓人分走她', 0.88, 0.32, 6, '柳生春')] },
    { name: '田巧雲', scene: '春雪社後台', persona: '春雪社班主當家，精明持重、算盤先於情分卻也疼人。', mem: ['你看著春雪社從幾個人的小班子，熬成雲錦台的當家。'], wants: [w('戲班', '保住春雪社不散、人心不亂', 0.78, 0.3, 4), w('事務', '平掉戲班七八年的虧空', 0.45, 0.2, 4)] },
    { name: '沈巧玲', scene: '春雪社後台', persona: '剛搭班的科班新秀花旦，家裡等米下鍋、急著出頭。', mem: ['你科班坐了十年，出來卻只配跑龍套，家裡的信一封比一封急。'], wants: [w('志向', '在春雪社掙個有名有姓的角兒、別跑龍套', 0.78, 0.2, 3), w('生計', '家裡等米下鍋、得掙錢養家', 0.5, 0.25, 4)] },
];

const PARTS = ['清晨', '日午', '晡時', '黃昏', '夜']; // 夜 = fast-forward tick
const tension = (x: Want) => x.weight * (1 - x.sat);
const GAIN: Record<string, number> = { 小: 0.15, 中: 0.32, 大: 0.55 };
const DECAY = 0.6;

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g); if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown; for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } } throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const inScene = (sc: string) => CHARS.filter((c) => c.scene === sc);

function forceNote(x: Want): string {
    const f = x.heat + x.frust;
    if (f < x.resistance * 0.5) return '這事藏著就藏著、或緩著就緩著，日子還長。';
    if (f < x.resistance) return '心裡翻著，可多半還是按下不表。';
    return '再也按不住了——這一刻你得做一件放不回頭的事；做什麼、要不要、怎麼做，全由你的心。';
}
async function act(client: Client, model: string, c: Char, x: Want, clock: string): Promise<{ beat: string; inner: string; move?: string }> {
    const here = inScene(c.scene).filter((o) => o.name !== c.name).map((o) => o.name);
    const mem = c.mem.length ? `\n你心底偶爾翻起的舊事(可化進此刻、不必硬提)：\n- ${c.mem.join('\n- ')}` : '';
    const sys = `你就是${c.name}。${c.persona}${mem}\n${WARM}\n【此刻】${clock}，你在【${c.scene}】，同場：${here.length ? here.join('、') : '只你一人'}。\n你心裡最重的：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forceNote(x)}\n做你此刻真會做的一件事(開放一句)。要去別處找人就填 move。輸出 JSON：{"beat":"客觀一句","inner":"心裡一句","move":"要去的場景名或省略"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '你這一拍？' }], maxTokens: 220, temperature: 0.92 });
    const o = parseObj(r.text) ?? {}; return { beat: s(o.beat) || '（沉默。）', inner: s(o.inner), move: s(o.move) || undefined };
}
async function weave(client: Client, model: string, clock: string, beats: string[]): Promise<string> {
    const sys = '你是說書人。把這一個時段裡、幾個場景併發發生的事，編織成一段章回(梨園話本口吻、暖、含蓄)。戲劇處寫細、過場一句帶過、不同場景用「與此同時/那廂」轉。忠於發生的事、別新增情節。輸出一段章回(不要標題不要 JSON)。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【${clock}】這段時間的素材：\n${beats.join('\n')}` }], maxTokens: 550, temperature: 0.85 });
    return s(r.text);
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const ticks = process.argv[2] ? Number(process.argv[2]) : 7;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 組合跑 · 定稿框架整套 · ${ticks} tick\n人設已修(柳=蘇師妹、台上風流台下黏師姐)、灌了 genesis 記憶、want 帶 resistance、tick 內併發 event、夜快轉、說書人編章回\n`);

    let part = 0, day = 1;
    for (let tick = 1; tick <= ticks; tick++) {
        const clock = `第${day}日·${PARTS[part]}`;
        const isNight = PARTS[part] === '夜';
        const tickBeats: string[] = [];
        console.log(`\n${'━'.repeat(78)}\n◆ ${clock}  ${isNight ? '（夜·快轉）' : ''}`);

        if (isNight) {
            // fast-forward: one long "rest" beat; state recovers (fatigue/sat drift back), no detailed events.
            for (const c of CHARS) for (const x of c.wants) if (!x.retired) x.sat = x.sat0 + (x.sat - x.sat0) * 0.4;
            tickBeats.push('〔夜〕後台燈一盞盞滅了，眾人各自歇下，這一夜無話。');
            console.log(`  〔手卷〕雲錦台靜了，各人歸房安寢。`);
        } else {
            // each live SCENE advances ONE beat this tick (concurrent events).
            const scenes = [...new Set(CHARS.map((c) => c.scene))];
            console.log(`  〔手卷〕此刻各場：`);
            for (const sc of scenes) {
                const pool = inScene(sc).flatMap((c) => c.wants.filter((x) => !x.retired).map((x) => ({ c, x })));
                if (!pool.length) continue;
                for (const { x } of pool) x.sat = x.sat0 + (x.sat - x.sat0) * DECAY;
                const pick = pool.reduce((b, cur) => (tension(cur.x) > tension(b.x) ? cur : b));
                const { c, x } = pick; x.heat += 1;
                const occ = inScene(sc).map((o) => o.name).join('、');
                console.log(`     ▸ ${sc}（${occ}）：${c.name} 正為「${x.desc.slice(0, 14)}」`);
                const r = await act(client, model, c, x, clock);
                tickBeats.push(`[${sc}] ${c.name}：${r.beat}`);
                console.log(`        ${c.name}：${r.beat}　（心）${r.inner}`);
                if (r.move && r.move !== c.scene && scenes.includes(r.move)) { console.log(`        → ${c.name} 動身去 ${r.move}`); c.scene = r.move; }
                // resistance: forcing only when heat+frust >= resistance; resolve if the LLM clearly broke (heuristic: 了結 not tracked here, keep it open)
                x.sat = Math.min(1, x.sat + GAIN['小']);
                if (x.heat + x.frust >= x.resistance) x.frust += 1;
                // a fresh memory from this beat
                if (c.mem.length < 6) c.mem.push(`方才你${r.beat}`.slice(0, 40));
            }
        }

        // storyteller weaves the tick → chapter
        const chapter = await weave(client, model, clock, tickBeats);
        console.log(`\n  〔章回·說書人編〕\n${chapter.split('\n').map((l) => '    ' + l).join('\n')}`);

        part = (part + 1) % PARTS.length; if (part === 0) day += 1;
    }

    console.log(`\n${'═'.repeat(78)}\n看：① 一個 tick 內併發多場 event 各推一拍(手卷)→ 末尾說書人編成一章回 ② 夜 tick 快轉(時間不等速) ③ want 帶 resistance(暗戀平常懸念)④ 人設對不對(柳台上風流台下黏師姐、蘇喚她師妹非哥)⑤ genesis 記憶有沒有回聲。整套組起來像不像那個會自己流的世界。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
