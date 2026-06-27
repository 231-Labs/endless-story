/**
 * 組合跑 v4 · 補回每場戲的互動 loop — v2/v3 cut each scene to 1–2 beats (cost), so the rich back-and-forth
 * dialogue (the §2.31 interaction loop) was lost and chapters thinned. v4 restores it: each tick, EACH live
 * scene runs a real interaction loop (co-present characters take turns, responding to whoever's addressed,
 * to a natural pause), MULTIPLE scenes run concurrently, and the storyteller weaves the tick into a chapter.
 * Output shows BOTH the 手卷 (raw back-and-forth per scene) + 章回 (woven). Keeps v3: 柳=蘇師妹 / 田巧雲白蘭
 * 鏡像 / 8 段記憶 / resistance / 廂房私戲 / 水袖暗號 / stakes.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/assembled-world-v4-selfdrive.ts [ticks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '梨園的質地、含蓄、戲味、暖；情到深處可濃，但不血腥不狗血。';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; resistance: number; target?: string; heat: number; frust: number }
interface Char { name: string; scene: string; persona: string; mem: string[]; wants: Want[] }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, resistance: number, target?: string): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, resistance, target, heat: 0, frust: 0 });
const PRIVATE = new Set(['蘇映雪廂房', '柳生春廂房']);

const CHARS: Char[] = [
    { name: '柳生春', scene: '春雪社後台', persona: '當紅坤生(女子扮小生)、蘇映雪的師妹。台上風流瀟灑、最享受台下目光；一下台嬌軟、愛撒嬌、最黏師姐。對師姐是兩個女人說不破的雙向暗戀，唯有台上才被許可。',
        mem: ['七歲坐科躲後台哭，是師姐牽你出來、教你「原來姹紫嫣紅開遍」。', '熬倒倉那年夜裡師姐替你揉嗓、偷塞冰糖。', '十六歲頭回搭《驚夢》滿堂彩，你到下台都分不清那聲「姐姐」是戲是真。', '師父臨終把舊摺扇塞你手裡只說「戲比天大」。', '你病那年師姐守三夜，你裝睡看她紅著眼替你掖被。', '台下捧場越多你越受用，可下了台只想往師姐身邊鑽。', '你看鄭月卿被後浪蓋過，夜裡也怕輪到自己。', '你倆暗號：她水袖揚到第三道，便是「這句唱給你」。'],
        wants: [w('愛', '跟師姐挨近些——人前只敢借戲、人後想多貼一刻', 0.9, 0.3, 6, '蘇映雪'), w('志向', '坐穩第一女小生、台下目光別涼', 0.6, 0.25, 3)] },
    { name: '蘇映雪', scene: '春雪社後台', persona: '台柱花旦、柳生春的師姐(帶她入門搭七八年)、演杜麗娘。你喚柳生春「生春」或「師妹」——她台上扮小生可她是你嬌軟愛黏你的師妹，斷不喚「哥」。對師妹是說不破的暗戀。',
        mem: ['你帶柳生春入門，看那躲後台哭的小丫頭一句句喂出來。', '她倒倉那年你夜夜替她揉嗓，看她哭你比她還疼。', '七八年生旦、千百回杜麗娘與柳夢梅，那份牽絆你不肯叫名字。', '她紅了之後你嘴上替她高興、心裡怕被分走。', '她病那三夜你守著替她掖被，她裝睡你都知道卻不敢戳破。', '也有人提親你都推了，推的理由你不肯對自己說清。', '你最怕有天台上對面再不是她的柳夢梅。', '那暗號是你定的：水袖揚第三道「這句唱給你」。'],
        wants: [w('愛', '守住跟柳生春的牽絆、別讓人分走她；人前忍、人後想離她近些', 0.88, 0.3, 6, '柳生春')] },
    { name: '田巧雲', scene: '帳房', persona: '春雪社班主當家，精明也疼人。**秘密**：年輕時你自己是當紅坤生、與花旦白蘭搭生旦唱紅《牡丹亭》；白蘭遠嫁南洋後你再唱不出那齣戲、就此封箱當班主。看柳生春黏蘇映雪就像看當年的你與白蘭，你斷不能再眼睜睜看一對生旦被拆散。',
        mem: ['你頭回與白蘭搭戲，她的杜麗娘對你的柳夢梅，台下叫好幾乎掀頂。', '你倆唱紅《牡丹亭》，散戲常一道吃熱餛飩到天亮。', '白蘭笑起來左頰有梨渦，你說那是你唱戲偷看的甜頭。', '她家許了南洋富商要她遠嫁，你連句留她的話都沒說出口。', '她上船那日你沒去送，躲後台把那身柳夢梅行頭摸了一夜。', '白蘭走後你再唱牡丹亭，唱到「則為你如花美眷」就開不了口、從此封箱。', '你接班子當班主，把那身行頭鎖進箱底再沒打開。', '如今看柳生春黏蘇映雪，你心口就抽一下——那是當年的你。'],
        wants: [w('護生旦', '護住柳生春與蘇映雪這對生旦、別讓他們步我與白蘭被拆散的後塵', 0.72, 0.3, 5, '蘇映雪'), w('戲班', '保住春雪社不散、人心不亂', 0.7, 0.32, 4)] },
    { name: '沈巧玲', scene: '練功房', persona: '剛搭班的科班新秀花旦，家裡等米下鍋、急著出頭。', mem: ['科班坐十年挨的打比飯多。', '出科那年家遭災弟妹的嘴等你。', '頭回登台只是丫鬟半句整詞沒有。', '你偷看蘇映雪的杜麗娘把身段描在心裡。', '家裡的信一封比一封急米缸見底。', '班裡姐妹誰都比你先有了角兒。', '你不信命信十年功夫總有用得上一天。', '你夜裡對空戲台練、練到腿軟不肯停。'], wants: [w('志向', '在春雪社掙個有名有姓的角兒、別跑龍套', 0.8, 0.2, 3), w('生計', '家裡等米下鍋、得掙錢養家', 0.5, 0.25, 4)] },
];

const PARTS = ['清晨', '日午', '晡時', '黃昏', '夜'];
const tension = (x: Want) => x.weight * (1 - x.sat);
const DECAY = 0.6;
const STAKES: Record<number, string> = { 2: '霞飛路的白韻秋差人送暖物來後台、要捧柳老闆的場。', 4: '蘇家綢緞莊捎來話：要蘇映雪三日內回去相一門好親。', 6: '田巧雲要重排《驚夢》、定杜麗娘與柳夢梅的人。' };

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
const effR = (c: Char, x: Want): number => {
    if (x.layer !== '愛') return x.resistance;
    const here = inScene(c.scene);
    const pair = PRIVATE.has(c.scene) && here.length === 2 && x.target && here.some((o) => o.name === x.target);
    return pair ? Math.max(2, x.resistance - 3) : x.resistance;
};
function forceNote(c: Char, x: Want): string {
    const f = x.heat + x.frust; const R = effR(c, x); const priv = x.layer === '愛' && PRIVATE.has(c.scene) && inScene(c.scene).length === 2;
    if (f < R * 0.5) return priv ? '此處只你二人、沒有眼睛，這是難得能這樣挨著的時候，順著心。' : '這事藏著就藏著、緩著就緩著。';
    if (f < R) return priv ? '無人看著，藏了多年的，在這方寸裡有點按不住了。' : '心裡翻著，可人前多半還是按下不表。';
    return priv ? '再也按不住了——只你二人、沒有眼睛，這年頭唯一能這樣的地方，這一刻全由你的心。' : '再也按不住了——這一刻你得做一件放不回頭的事，由你的心。';
}
async function act(client: Client, model: string, c: Char, x: Want, clock: string, stake: string, sceneLog: string): Promise<{ beat: string; inner: string; addressed?: string; move?: string }> {
    const here = inScene(c.scene).filter((o) => o.name !== c.name).map((o) => o.name);
    const mem = `\n你心底偶爾翻起的舊事(對景就讓它浮上來、不對景別硬提)：\n- ${c.mem.join('\n- ')}`;
    const where = `你在【${c.scene}】${PRIVATE.has(c.scene) ? '(私房)' : ''}，同場：${here.length ? here.join('、') : '只你一人'}。`;
    const sys = `你就是${c.name}。${c.persona}${mem}\n${WARM}\n【此刻】${clock}。${where}${stake ? `\n【風聲】${stake}` : ''}\n你心裡最重的：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forceNote(c, x)}\n**這是一段正在進行的來回，接著剛剛的話往下、回應在場的人，別自說自話。** 做你此刻真會做或說的一件事(開放一句)。輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句","addressed":"你這拍對著誰(在場某人名/無)","move":"要去別處就填場景名/否則無"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【這場戲剛剛的來回】\n${sceneLog || '（戲方起。）'}\n\n輪到你（${c.name}）。` }], maxTokens: 230, temperature: 0.95 });
    const o = parseObj(r.text) ?? {}; const add = s(o.addressed); const mv = s(o.move);
    return { beat: s(o.beat) || '（沉默。）', inner: s(o.inner), addressed: add && add !== '無' ? add : undefined, move: mv && mv !== '無' ? mv : undefined };
}
async function classifyIntimacy(client: Client, model: string, beat: string): Promise<string> {
    const sys = '兩女子私房獨處一拍，判斷親密度：含蓄/親密(依偎執手額抵相擁)/踰矩(擁吻肌膚相觸)。輸出 JSON：{"lv":"含蓄/親密/踰矩"}。不要 markdown。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: beat }], maxTokens: 50, temperature: 0.2 });
    const lv = s(parseObj(r.text)?.lv); return ['含蓄', '親密', '踰矩'].includes(lv) ? lv : '含蓄';
}
async function weave(client: Client, model: string, clock: string, beats: string[]): Promise<string> {
    const sys = '你是說書人。把這一個時段裡幾個場景併發發生的事，編成一段章回(梨園話本口吻、暖、含蓄、情到深處可濃)。戲劇處寫細、過場一句帶過、不同場景用「與此同時/那廂」轉。忠於發生的事、別新增情節。輸出一段(不要標題不要 JSON)。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【${clock}】素材：\n${beats.join('\n')}` }], maxTokens: 650, temperature: 0.85 });
    return s(r.text);
}
const satGain = (c: Char, x: Want) => (x.layer === '愛' && !PRIVATE.has(c.scene) ? 0.05 : 0.16);

// run ONE scene's interaction loop this tick: co-present characters take turns, responding to whoever's addressed.
async function runScene(client: Client, model: string, sc: string, clock: string, stake: string, isIntim: boolean, intim: string[]): Promise<string[]> {
    const out: string[] = []; const log: string[] = [];
    const occ = inScene(sc); if (!occ.length) return out;
    const solo = occ.length === 1; const maxTurns = solo ? 2 : (isIntim ? 5 : 4);
    let actor: Char | undefined = occ.reduce((b, c) => (tension(c.wants[0]) > tension(b.wants[0]) ? c : b));
    for (let turn = 0; turn < maxTurns; turn++) {
        if (!actor || actor.scene !== sc) break;
        const x = actor.wants.reduce((b, y) => (tension(y) > tension(b) ? y : b)); x.heat += 1;
        const r = await act(client, model, actor, x, clock, turn === 0 ? stake : '', log.slice(-5).join('\n'));
        log.push(`${actor.name}：${r.beat}`); out.push(`[${sc}] ${actor.name}：${r.beat}`);
        let tag = '';
        if (isIntim) { const lv = await classifyIntimacy(client, model, r.beat); intim.push(lv); tag = `〔${lv}〕`; }
        console.log(`        ${tag}${actor.name}：${r.beat}　（心）${r.inner}`);
        x.sat = Math.min(1, x.sat + satGain(actor, x)); if (x.heat + x.frust >= effR(actor, x)) x.frust += 1;
        if (r.move && r.move !== actor.scene) { console.log(`        → ${actor.name} 動身去 ${r.move}`); actor.scene = r.move; break; }
        if (solo) break;
        // route: addressed co-present char, else the other-most-tense co-present who isn't the actor.
        const curName: string = actor.name;
        const present: Char[] = inScene(sc).filter((o) => o.name !== curName);
        const addrName = r.addressed;
        const addr: Char | undefined = addrName ? present.find((o) => o.name === addrName || addrName.includes(o.name)) : undefined;
        actor = addr ?? present.sort((a, b) => tension(b.wants[0]) - tension(a.wants[0]))[0];
    }
    return out;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const ticks = process.argv[2] ? Number(process.argv[2]) : 6;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 組合跑 v4 · 每場跑互動 loop(你來我往) · ${ticks} tick\n`);

    let part = 0, day = 1; const intim: string[] = [];
    const liu = CHARS.find((c) => c.name === '柳生春')!; const su = CHARS.find((c) => c.name === '蘇映雪')!; const tian = CHARS.find((c) => c.name === '田巧雲')!;
    for (let tick = 1; tick <= ticks; tick++) {
        const clock = `第${day}日·${PARTS[part]}`; const isNight = PARTS[part] === '夜'; const stake = STAKES[tick] ?? '';
        console.log(`\n${'━'.repeat(78)}\n◆ ${clock}${stake ? `　【風聲】${stake}` : ''}`);
        if (tick === 4) { for (const c of [liu, su]) c.wants[0].sat = Math.max(0, c.wants[0].sat - 0.2); tian.wants[0].sat = Math.max(0, tian.wants[0].sat - 0.2); }
        const tickBeats: string[] = [];

        if (isNight) {
            const loveHot = Math.max(tension(liu.wants[0]), tension(su.wants[0])) > 0.5;
            if (loveHot) { liu.scene = '蘇映雪廂房'; su.scene = '蘇映雪廂房'; console.log(`  〔手卷〕夜深，柳生春悄悄到了師姐的廂房，只他二人。`); tickBeats.push(...await runScene(client, model, '蘇映雪廂房', clock, '', true, intim)); }
            else { for (const c of CHARS) for (const x of c.wants) x.sat = x.sat0 + (x.sat - x.sat0) * 0.4; tickBeats.push('〔夜〕燈一盞盞滅了，眾人各自歇下，一夜無話。'); console.log(`  〔手卷〕夜，各人歸房安寢。`); }
        } else {
            const scenes = [...new Set(CHARS.map((c) => c.scene))];
            console.log(`  〔手卷〕此刻各場（你來我往）：`);
            for (const sc of scenes) {
                const occ = inScene(sc); if (!occ.length) continue;
                console.log(`     ▸ ${sc}（${occ.map((o) => o.name).join('、')}）`);
                for (const c of occ) for (const x of c.wants) x.sat = x.sat0 + (x.sat - x.sat0) * DECAY;
                tickBeats.push(...await runScene(client, model, sc, clock, stake, false, intim));
            }
        }
        const chapter = await weave(client, model, clock, tickBeats);
        console.log(`\n  〔章回·說書人編〕\n${chapter.split('\n').map((l) => '    ' + l).join('\n')}`);
        part = (part + 1) % PARTS.length; if (part === 0) day += 1;
    }
    console.log(`\n${'═'.repeat(78)}\n看：① 每場是真的你來我往(對話有肉)② 多場併發 ③ 末尾章回把這 tick 各場編成一段 ④ 廂房私戲：${intim.length ? intim.join('→') : '—'} ⑤ 田白蘭/記憶/人設照舊。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
