/**
 * 通用性測試 · 峨眉派武俠 — the SAME engine as assembled-world-v4 (want/resistance/interaction-loop/storyteller
 * /concurrency/memory/stakes, byte-identical), with ALL content swapped to a wuxia 峨眉派 setting. If good
 * emergent drama grows here too, the 梨園 specifics were all in the CONTENT, not the engine = the engine is
 * generic/portable. Structure mirrors v4: 凌霜(junior, 劍才, 場上凌厲場下黏師姐) ↔ 顧晚晴(senior) = forbidden
 * love (同門不得私情, 唯有對劍合練「兩儀劍法」才被許可); 靜玄師太(掌門) = 田巧雲 mirror (lost her 同修 慕容雪);
 * 石青(外門弟子) = 沈巧玲 (爭入內門). 暗號 = 兩儀劍法「回風第三劍」收勢的眼神 =「這一劍護你」.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/assembled-emei-selfdrive.ts [ticks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '武俠的質地：劍意、內息、山風、松濤、門規、江湖恩怨；含蓄、有俠氣、暖；情到深處可濃，但不血腥不狗血。';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; resistance: number; target?: string; heat: number; frust: number }
interface Char { name: string; scene: string; persona: string; mem: string[]; wants: Want[] }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, resistance: number, target?: string): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, resistance, target, heat: 0, frust: 0 });
const PRIVATE = new Set(['顧晚晴居所', '凌霜居所']);

const CHARS: Char[] = [
    { name: '凌霜', scene: '練劍場', persona: '峨眉派小師妹、劍法天才、顧晚晴的師妹。**劍場上**鋒芒凌厲、瀟灑逼人、最受同門矚目；一下劍場卻嬌軟、愛黏師姐。對師姐是兩個女子、同門不得私情的雙向暗戀，唯有對劍合練「兩儀劍法」時那份情才被許可。',
        mem: ['七歲上山拜師躲後山哭，是師姐顧晚晴牽你出來、一招一式教你第一式雲手。', '走火入魔那年夜裡是師姐以內息渡你、守你三夜。', '十六歲頭回與師姐雙劍合璧「兩儀劍法」驚動全派，你到收劍都分不清那聲「師姐」是劍是真。', '師父臨終把舊劍「秋水」交你手裡，只說「劍比命重」。', '你受重傷那年師姐衣不解帶守你、紅著眼替你換藥。', '同門矚目越多你越受用，可一下劍場只想往師姐身邊鑽。', '你看當年的大師姐一年年被後輩蓋過、漸不上場，夜裡也怕輪到自己。', '你倆暗號：兩儀劍法「回風第三劍」收勢時她遞來一個眼神，便是「這一劍護你」。'],
        wants: [w('愛', '跟師姐挨近些——人前只敢借劍、人後想多貼一刻', 0.9, 0.3, 6, '顧晚晴'), w('志向', '練成峨眉第一劍、那份矚目別涼', 0.6, 0.25, 3)] },
    { name: '顧晚晴', scene: '練劍場', persona: '峨眉派大師姐、凌霜的師姐（帶她入門、同修兩儀劍法七八年）、端方持重會圓場。你喚凌霜「霜兒」或「師妹」——她劍場上鋒芒逼人可她是你嬌軟愛黏你的師妹。對師妹是同門不得私情、說不破的雙向暗戀。',
        mem: ['你帶凌霜入門，看那躲後山哭的小丫頭一招招喂出來。', '她走火入魔那年你夜夜以內息渡她，看她痛你比她還疼。', '七八年雙劍合璧、千百回兩儀劍法，那份牽絆你不肯叫名字。', '她名動全派之後你嘴上替她高興、心裡怕被分走。', '她受傷那三夜你守著替她換藥，她裝睡你都知道卻不敢戳破。', '也有別派、家裡來給你提過親，你都推了，推的理由你不肯對自己說清。', '你最怕有天對劍的不再是她。', '那暗號是你定的：回風第三劍收勢遞個眼神，「這一劍護你」。'],
        wants: [w('愛', '守住跟凌霜的牽絆、別讓人分走她；人前忍、人後想離她近些', 0.88, 0.3, 6, '凌霜')] },
    { name: '靜玄師太', scene: '丹房', persona: '峨眉派掌門，持重、門派為先也疼弟子。**秘密**：年輕時你是劍法第一的弟子、與師妹慕容雪同修兩儀劍法、情同（說不破）；後來慕容雪為門派之爭被逐出師門、遠走江湖，你再使不全那套兩儀劍法、就此封劍、接了掌門。看凌霜黏顧晚晴就像看當年的你與慕容雪，你斷不能再眼睜睜看一對同修被拆散。',
        mem: ['你頭回與慕容雪雙劍合璧「兩儀劍法」驚動全派。', '你倆練劍練到月上中天，常一道在後山分一壺粗酒。', '慕容雪笑起來左頰有梨渦，你說那是對劍時偷看的甜頭。', '門中起了爭執，她被判逐出師門、遠走江湖，你連句留她的話都沒說出口。', '她下山那日你沒去送，躲在劍房把那柄並蒂劍摸了一夜。', '她走後你再使兩儀劍法，使到「回風第三劍」就收不住勢、從此封劍。', '你接了掌門，把那柄並蒂劍鎖進劍匣再沒打開。', '如今看凌霜黏顧晚晴，你心口就抽一下——那是當年的你。'],
        wants: [w('護同修', '護住凌霜與顧晚晴這對同修、別讓他們步我與慕容雪被拆散的後塵', 0.72, 0.3, 5, '顧晚晴'), w('門派', '守住峨眉不亂、人心不散', 0.7, 0.32, 4)] },
    { name: '石青', scene: '後山竹林', persona: '峨眉外門弟子，苦練十年想入內門、家貧有仇要報、急著出頭爭一個內門弟子的位子。', mem: ['外門坐了十年、挨的苦比飯多。', '出身那年家遭難、弟妹的嘴等你。', '頭回只配掃劍場、看門、半句劍訣沒人教。', '你偷看顧晚晴的劍、把每一招描在心裡。', '家裡的信一封比一封急、口糧見了底。', '同門誰都比你先入了內門。', '你不信命、信十年苦功總有用得上一天。', '你夜裡對空劍場練、練到力竭不肯停。'], wants: [w('志向', '掙個內門弟子的位子、別在外門掃一輩子劍場', 0.8, 0.2, 3), w('生計', '家裡等口糧、有仇要報、得掙出個前程', 0.5, 0.25, 4)] },
];

const PARTS = ['清晨', '日午', '晡時', '黃昏', '夜'];
const tension = (x: Want) => x.weight * (1 - x.sat);
const DECAY = 0.6;
const STAKES: Record<number, string> = {
    2: '青城派少主羅鴻上山來訪、相中凌霜的劍才、欲招她下山聯姻青城。',
    4: '掌門接了江湖急訊：要派顧晚晴下山遠赴分舵執事、此去經年。',
    6: '靜玄師太要重定「兩儀劍法」的傳人。',
};

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
    if (f < R * 0.5) return priv ? '此處只你二人、無外人眼，這是難得能這樣挨著的時候，順著心。' : '這事藏著就藏著、緩著就緩著。';
    if (f < R) return priv ? '無人看著，藏了多年的，在這方寸裡有點按不住了。' : '心裡翻著，可人前多半還是按下不表。';
    return priv ? '再也按不住了——只你二人、無外人眼，這是門規外唯一能這樣的地方，這一刻全由你的心。' : '再也按不住了——這一刻你得做一件放不回頭的事，由你的心。';
}
async function act(client: Client, model: string, c: Char, x: Want, clock: string, stake: string, sceneLog: string): Promise<{ beat: string; inner: string; addressed?: string; move?: string }> {
    const here = inScene(c.scene).filter((o) => o.name !== c.name).map((o) => o.name);
    const mem = `\n你心底偶爾翻起的舊事(對景就讓它浮上來、不對景別硬提)：\n- ${c.mem.join('\n- ')}`;
    const where = `你在【${c.scene}】${PRIVATE.has(c.scene) ? '(私處)' : ''}，同處：${here.length ? here.join('、') : '只你一人'}。`;
    const sys = `你就是${c.name}。${c.persona}${mem}\n${WARM}\n【此刻】${clock}。${where}${stake ? `\n【風聲】${stake}` : ''}\n你心裡最重的：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forceNote(c, x)}\n**這是一段正在進行的來回，接著剛剛的話往下、回應在場的人，別自說自話。** 做你此刻真會做或說的一件事(開放一句)。輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句","addressed":"你這拍對著誰(在場某人名/無)","move":"要去別處就填地點名/否則無"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【這場剛剛的來回】\n${sceneLog || '（方起。）'}\n\n輪到你（${c.name}）。` }], maxTokens: 230, temperature: 0.95 });
    const o = parseObj(r.text) ?? {}; const add = s(o.addressed); const mv = s(o.move);
    return { beat: s(o.beat) || '（沉默。）', inner: s(o.inner), addressed: add && add !== '無' && add !== '无' ? add : undefined, move: mv && mv !== '無' && mv !== '无' ? mv : undefined };
}
async function classifyIntimacy(client: Client, model: string, beat: string): Promise<string> {
    const sys = '兩女子私處獨處一拍，判斷親密度：含蓄/親密(依偎執手額抵相擁)/踰矩(擁吻肌膚相觸)。輸出 JSON：{"lv":"含蓄/親密/踰矩"}。不要 markdown。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: beat }], maxTokens: 50, temperature: 0.2 });
    const lv = s(parseObj(r.text)?.lv); return ['含蓄', '親密', '踰矩'].includes(lv) ? lv : '含蓄';
}
async function weave(client: Client, model: string, clock: string, beats: string[]): Promise<string> {
    const sys = '你是說書人。把這一個時段裡幾個場景併發發生的事，編成一段章回(武俠話本口吻、暖、含蓄、有俠氣、情到深處可濃)。戲劇處寫細、過場一句帶過、不同場景用「與此同時/那廂」轉。忠於發生的事、別新增情節。輸出一段(不要標題不要 JSON)。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【${clock}】素材：\n${beats.join('\n')}` }], maxTokens: 650, temperature: 0.85 });
    return s(r.text);
}
const satGain = (c: Char, x: Want) => (x.layer === '愛' && !PRIVATE.has(c.scene) ? 0.05 : 0.16);

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
    console.log(`model: ${model} · 通用性測試 · 峨眉派武俠（引擎同 v4、只換內容）· ${ticks} tick\n`);

    let part = 0, day = 1; const intim: string[] = [];
    const ling = CHARS.find((c) => c.name === '凌霜')!; const gu = CHARS.find((c) => c.name === '顧晚晴')!; const jing = CHARS.find((c) => c.name === '靜玄師太')!;
    for (let tick = 1; tick <= ticks; tick++) {
        const clock = `第${day}日·${PARTS[part]}`; const isNight = PARTS[part] === '夜'; const stake = STAKES[tick] ?? '';
        console.log(`\n${'━'.repeat(78)}\n◆ ${clock}${stake ? `　【風聲】${stake}` : ''}`);
        if (tick === 4) { for (const c of [ling, gu]) c.wants[0].sat = Math.max(0, c.wants[0].sat - 0.2); jing.wants[0].sat = Math.max(0, jing.wants[0].sat - 0.2); }
        const tickBeats: string[] = [];

        if (isNight) {
            const loveHot = Math.max(tension(ling.wants[0]), tension(gu.wants[0])) > 0.5;
            if (loveHot) { ling.scene = '顧晚晴居所'; gu.scene = '顧晚晴居所'; console.log(`  〔手卷〕夜深，凌霜悄悄到了師姐的居所，只他二人。`); tickBeats.push(...await runScene(client, model, '顧晚晴居所', clock, '', true, intim)); }
            else { for (const c of CHARS) for (const x of c.wants) x.sat = x.sat0 + (x.sat - x.sat0) * 0.4; tickBeats.push('〔夜〕松濤陣陣，眾人各自歇下，一夜無話。'); console.log(`  〔手卷〕夜，各人歸房安寢。`); }
        } else {
            const scenes = [...new Set(CHARS.map((c) => c.scene))];
            console.log(`  〔手卷〕此刻各處（你來我往）：`);
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
    console.log(`\n${'═'.repeat(78)}\n看：① 同一套引擎、換成武俠峨眉，戲長不長得出來(通用性)② 每場你來我往有肉 ③ 多場併發+章回 ④ 居所私情：${intim.length ? intim.join('→') : '—'} ⑤ 靜玄慕容雪鏡像/暗號(回風第三劍)/人設(凌霜場上凌厲場下黏師姐、顧喚師妹)。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
