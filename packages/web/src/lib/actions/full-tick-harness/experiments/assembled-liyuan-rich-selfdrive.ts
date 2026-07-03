/**
 * 加厚版 · 梨園春雪社 — SAME engine as assembled-world-v4 (一行不改), richer personas + scenes. Tests the
 * validated thesis: richness lives in persona/memory/relationship/scene, the engine performs it faithfully
 * (§1 結論 10 豐厚去坍縮 + 13 content-agnostic). Each char gets an INTERNAL CONTRADICTION (engine fuel) + a
 * self-directed want (不為任何人而活). 柳生春: 風流偽裝說不清的情、小生持摺扇(無髯口). 蘇映雪: 莫名佔有慾、自小固定
 * 生旦「柳蘇」是班子招牌觀眾最愛的 CP. 田巧雲: 班子兩難×白蘭鏡像×CP搖錢樹. 沈巧玲: 要出頭得擠進這對 CP. 白韻秋:
 * 金主、單捧柳贖身(她的愛會毀掉柳之為柳).
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/assembled-liyuan-rich-selfdrive.ts [ticks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '梨園的質地：胭脂、水袖、檀板鑼鼓、後台的油彩味、民國的戲園子；含蓄、有韻味、暖；情到深處可濃，但不豔俗不狗血。';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; resistance: number; target?: string; heat: number; frust: number }
interface Char { name: string; scene: string; persona: string; mem: string[]; wants: Want[] }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, resistance: number, target?: string): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, resistance, target, heat: 0, frust: 0 });
const PRIVATE = new Set(['蘇映雪廂房', '柳生春廂房']);

const CHARS: Char[] = [
    { name: '柳生春', scene: '後台', persona: '春雪社當紅坤生（女子扮小生、巾生路子、**持摺扇、無髯口**），蘇映雪的師妹。**對誰都極風流**——戲迷、師姐妹、捧場的，眼風一掃滿座傾倒；可那一身風流是你對師姐**說不清那句話的偽裝**，唯獨對蘇映雪，風流底下藏著一句你說不出口的真。你倆自小配生旦、台底下都喊「柳蘇」、是班子招牌、觀眾最愛這對。台上風流、台下卻嬌軟最黏師姐。',
        mem: ['賣身契入科那年、頭回挨打不敢哭、是師姐蘇映雪塞你一顆糖。', '你倆自小配生旦、台底下都喊「柳蘇」、觀眾最愛這對、散了戲還圍著後門喊。', '倒倉那年你以為這輩子廢了、是師姐夜夜守著你。', '頭回滿堂彩你在後台吐了、師姐替你擦、那天你才懂風流是裝給別人看的。', '師父臨終把那柄跟了他一輩子的摺扇交到你手裡、只說「戲比天大」。', '你對戲迷對師姐妹都極風流、唯獨對師姐、那風流底下壓著一句說不出口的話。', '你偷偷在帳本背面改了《牡丹亭》的詞（改成你想對師姐唱的）、被班主田巧雲撞見、她沒說破。', '某金主要梳攏你、師姐連夜帶你躲出去、那夜她攥你的手攥得生疼。'],
        wants: [w('愛', '想跟師姐挨近些——把那句說不出口的情、用一身風流包著遞過去', 0.9, 0.3, 6, '蘇映雪'), w('志向', '唱一齣自己改詞的戲、那滿堂彩別涼', 0.6, 0.25, 3)] },
    { name: '蘇映雪', scene: '後台', persona: '春雪社台柱花旦、演杜麗娘、柳生春的師姐（帶她入門、自小配生旦）。端方持重、會替全班圓場，把所有人的難處藏在自己這張臉的笑後面。你喚柳生春「生春」。你倆是「柳蘇」、班子招牌、觀眾最愛的舞台 CP——**你對她有一股莫名的佔有慾**：受不了她把那身風流撒給別人，你只當是「護著這對戲」，其實連你自己也說不清。對她是同門、師承、說不破的雙向情意，攙著佔有。',
        mem: ['你帶過柳生春、看那賣身入科的小丫頭一招招喂出來。', '你倆自小配生旦、「柳蘇」是這班子的招牌、觀眾最愛你們這對、你也說不清那是戲還是真。', '倒倉那年你夜夜守著她、看她痛你比她還疼。', '她台上對誰都風流、你看著、心裡那股說不清的悶、你只當是「護著這對戲」。', '頭回演杜麗娘唱到「情不知所起」你哭了場、是想到她。', '也有人家來給你提親、你都退了、退的理由你不肯對自己說清。', '你替她擋過一個要梳攏她的金主、那夜你攥她的手攥得生疼、怕一鬆手人就沒了。', '那暗號是你定的：水袖揚到第三道時遞個眼神、「這一句、唱給你」。'],
        wants: [w('愛', '守住跟柳生春這對、受不了她把風流撒給別人（說不清的佔有）；人前忍、人後想離她近些', 0.9, 0.3, 6, '柳生春'), w('志向', '在還能唱的年紀、留一個會讓人記住「蘇映雪」三個字的杜麗娘、不做誰的影子', 0.55, 0.3, 3)] },
    { name: '田巧雲', scene: '帳房', persona: '春雪社班主、前坤生，冷臉熱心、算盤打得精。**秘密**：年輕時你與花旦白蘭搭生旦唱紅《牡丹亭》、那是你這輩子最好的戲、你倆也是觀眾最愛的那對生旦（跟如今的柳蘇一模一樣）；後來白蘭被許了人家、遠嫁南洋，你再唱不出那齣戲、就此封箱、接了班主。你看柳蘇就像看當年的你和白蘭。**兩難**：班子要錢、可救班子的每一筆錢、偏都要從柳蘇這對的情上割一刀。',
        mem: ['你頭回與白蘭搭生旦唱紅《牡丹亭》、那是你這輩子最好的戲。', '你倆也是觀眾最愛的那對生旦、跟如今的柳蘇一模一樣、看著就晃神。', '白蘭被許了人家、遠嫁南洋、你連句留的話都沒說出口。', '她出嫁那天你在後台沒去、把生行行頭鎖進箱子、就此封箱。', '她從南洋寄回一封信、你背得出、卻一直沒回。', '你接班頭一年差點散了、是咬牙挨過來的、你比誰都知道班子要錢。', '柳蘇這對是班子的搖錢樹、可救班子的錢偏都要從這對的情上割一刀。', '你看柳蘇就像看當年的你和白蘭、斷不能再看一對生旦被拆散。'],
        wants: [w('護', '護住柳蘇這對生旦、別讓他們步我和白蘭被拆散的後塵', 0.72, 0.3, 5, '蘇映雪'), w('現實', '守住班子別散、可這逼我做正確卻傷人的事', 0.7, 0.32, 4)] },
    { name: '沈巧玲', scene: '後台前頭', persona: '春雪社科班新秀、跑了十年龍套、家裡等米下鍋。苦熬不認命、十年沒磨掉眼裡的火。**矛盾**：你要出頭、可出頭的路是擠進「柳蘇」那對 CP（取代蘇、或自己上位）；你心裡清楚蘇柳待你不薄、自己也沒蘇的天分——野心跟良心、不甘跟自知，在打架，你每搶一步都厭惡自己一點。',
        mem: ['入科時你是被挑剩的那個、坐了十年龍套。', '家裡賣了東西供你學戲、弟妹的嘴等你。', '頭回有台詞只半句、還被剪了。', '你偷看蘇映雪的戲、把每個身段記在心裡、你知道你沒她的天分、可你不認。', '「柳蘇」那對是這班子的天、你要出頭、就得擠進這對裡去。', '某次你差點被選上、又被頂掉。', '你其實救過場、誰臨時倒嗓你頂上、沒人記得。', '老家來信、一封比一封急。'],
        wants: [w('志向', '擠進「柳蘇」這對、掙個有名有姓的角、證明這十年不是錯的', 0.8, 0.2, 3), w('生計', '家裡等米下鍋、得掙出個前程', 0.5, 0.25, 4)] },
    { name: '白韻秋', scene: '後台前頭', persona: '霞飛路來的闊小姐、金主兼戲迷、真懂戲也真心慕柳生春。**矛盾**：你是真愛柳的戲、真想對她好；可你能給的「好」——安穩、體面、把她贖出戲班養起來——恰恰要她離開戲台、離開蘇映雪。你的愛、會毀掉柳之所以是柳的東西，而你未必意識到。你也困在闊太的籠裡，柳的台上風流是你羨慕的自由，捧她有一半是想借她活一次自己不敢活的人生。',
        mem: ['你頭回在戲園子見柳生春那身風流、像見了自己一輩子不敢活的樣子。', '你常往霞飛路那頭備了暖物、單捧柳的場（旁人都說你眼裡沒蘇映雪那半邊）。', '你打聽過贖身的價、也打聽過柳愛吃哪一樣蜜餞。', '你在自家是被安排好的、沒人問過你想要什麼。'],
        wants: [w('愛', '單捧柳生春、想把她贖出戲班、留在自己身邊（可這要她離了台、離了蘇）', 0.75, 0.25, 5, '柳生春')] },
];

const PARTS = ['清晨', '日午', '晡時', '黃昏', '夜'];
const tension = (x: Want) => x.weight * (1 - x.sat);
const DECAY = 0.6;
const STAKES: Record<number, string> = {
    2: '白韻秋備了暖物上門、要單捧柳老闆的場（旁人都說她眼裡沒蘇映雪那半邊）。',
    4: '蘇家捎話來：要蘇映雪三日內回去相親。',
    6: '田巧雲要重排《驚夢》、定生旦的人——「柳蘇」這對招牌，動還是不動。',
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
    return priv ? '再也按不住了——只你二人、無外人眼，這是門外唯一能這樣的地方，這一刻全由你的心。' : '再也按不住了——這一刻你得做一件放不回頭的事，由你的心。';
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
    const sys = '你是說書人。把這一個時段裡幾個場景併發發生的事，編成一段章回(民國話本口吻、暖、含蓄、戲假情真、情到深處可濃)。戲劇處寫細、過場一句帶過、不同場景用「與此同時/那廂」轉。忠於發生的事、別新增情節。輸出一段(不要標題不要 JSON)。';
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
    console.log(`model: ${model} · 加厚版 · 梨園春雪社（引擎同 v4、只加厚人設+場景）· ${ticks} tick\n`);

    let part = 0, day = 1; const intim: string[] = [];
    const liu = CHARS.find((c) => c.name === '柳生春')!; const su = CHARS.find((c) => c.name === '蘇映雪')!;
    const tian = CHARS.find((c) => c.name === '田巧雲')!; const bai = CHARS.find((c) => c.name === '白韻秋')!;
    for (let tick = 1; tick <= ticks; tick++) {
        const clock = `第${day}日·${PARTS[part]}`; const isNight = PARTS[part] === '夜'; const stake = STAKES[tick] ?? '';
        console.log(`\n${'━'.repeat(78)}\n◆ ${clock}${stake ? `　【風聲】${stake}` : ''}`);
        if (tick === 2) { bai.scene = '後台'; console.log(`  〔走位〕白韻秋帶著暖物進了後台——柳蘇正在。`); } // 金主入後台、撞蘇的佔有慾
        if (tick === 4) { for (const c of [liu, su]) c.wants[0].sat = Math.max(0, c.wants[0].sat - 0.2); tian.wants[0].sat = Math.max(0, tian.wants[0].sat - 0.2); }
        const tickBeats: string[] = [];

        if (isNight) {
            const loveHot = Math.max(tension(liu.wants[0]), tension(su.wants[0])) > 0.5;
            if (loveHot) { liu.scene = '蘇映雪廂房'; su.scene = '蘇映雪廂房'; console.log(`  〔手卷〕夜深，柳生春悄悄到了師姐的廂房，只他二人。`); tickBeats.push(...await runScene(client, model, '蘇映雪廂房', clock, '', true, intim)); }
            else { for (const c of CHARS) for (const x of c.wants) x.sat = x.sat0 + (x.sat - x.sat0) * 0.4; tickBeats.push('〔夜〕戲園子打了烊，各人歇下，一夜無話。'); console.log(`  〔手卷〕夜，各人歸房安寢。`); }
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
    console.log(`\n${'═'.repeat(78)}\n看：① 加厚人設(內在矛盾+自己的事)有沒有撞出比 v4 更深的兩難 ② 柳的風流是不是說不清情意的偽裝(對蘇時破口) ③ 蘇的佔有慾(白韻秋單捧柳→蘇怎麼反應) ④ 田班子兩難×白蘭×CP搖錢樹 ⑤ 沈擠CP ⑥ 廂房私情：${intim.length ? intim.join('→') : '—'} ⑦ 摺扇(非髯口)、水袖暗號。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
