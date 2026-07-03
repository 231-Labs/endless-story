/**
 * 加厚版 · 蘇映雪的單向煎熬 — SAME engine, 翻轉戲劇問題：柳生春是真風流戲子(台下睡過不少女人、舊相好來討風流帳、
 * 夜裡常不歸)，對蘇的情埋得極深(resistance 8、不敢認)。蘇映雪痛卻不能管(師姐、沒立場攔)，獨守時懷念柳還乾淨時
 * 只黏她一人的小師妹。測：① 蘇能不能從記憶反思出青春的懷念(夜不歸宿時) ② 累積壓力(夜不歸×N + 舊相好上門)能不能
 * 終於頂破 resistance、逼蘇說出口「別只抱外面的女人、也回來抱抱我」。confession 的『內容』是蘇的 want；forcing 只
 * 鬆開「不能管」的閘，怎麼說由引擎長。15 拍 = 3 天 3 夜。
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/assembled-liyuan-pining-selfdrive.ts [ticks]
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
    { name: '柳生春', scene: '後台', persona: '春雪社當紅坤生（女子扮小生、巾生路子、**持摺扇、無髯口**），蘇映雪自小的師妹。**真風流的戲子**——不只台上，台下也沾染風塵、睡過不少女人，三天兩頭有舊相好來後台討風流帳，夜裡常不歸。對送上門的來者不拒、甜言隨口就來。可這一身風流底下，對師姐蘇映雪藏著一句連自己也不敢認的情——**越不敢認，越往外面的溫存裡躲**，你不敢回頭看師姐的眼，怕一看就裝不下去了。台上風流、骨子裡比誰都怕。',
        mem: ['你自小是蘇映雪的小師妹、賣身入科頭回挨打、是她塞你一顆糖。', '倒倉那年你以為廢了、夜夜趴在師姐膝頭睡、她守著你。', '紅了之後外面的女人一個接一個、你也說不清是貪還是躲。', '師姐替你擋過要梳攏你的人、如今這些舊相好上門、她擋不住了、也不擋了。', '你夜裡不歸時、其實知道師姐屋裡的燈一直亮著。', '你對金鳳們的甜言、是真也是假、你自己都懶得分。', '師父臨終把那柄摺扇交你、只說「戲比天大」。', '你不敢回頭看師姐的眼、怕一看、這身風流的殼就裝不下去了。'],
        wants: [w('風流', '外面的女人、夜裡的溫存、來者不拒——往風塵裡躲', 0.85, 0.3, 2, '金鳳'), w('愛', '對師姐那句連自己也不敢認的情（埋得極深、不敢翻出來）', 0.82, 0.3, 8, '蘇映雪')] },
    { name: '蘇映雪', scene: '後台', persona: '春雪社台柱花旦、演杜麗娘、柳生春自小的師姐（帶她入門）。眼看著柳這些年沾染風塵、舊相好一個個來討風流帳、夜夜不歸，你**痛、卻不能管**——你是師姐，不是她的什麼人，沒立場攔。你偶爾懷念柳年輕時、只是你一人的小師妹，乾乾淨淨、沒沾這些風塵韻事，夜裡只往你身邊鑽。端方，把痛全藏進戲裡、藏進一個人的夜裡。對柳的情，攙著佔有、懷念、與說不出口的不甘。',
        mem: ['你自小帶柳入門、那時她只黏你一個、夜裡睏了就趴你膝頭。', '倒倉那年她怕廢了、夜夜哭、是你守著、那時她的夜只有你。', '她頭回上妝、是你手把手、描眉的手都在抖。', '她紅了之後頭一回在外過夜、你整宿沒合眼、聽更聲聽到天亮。', '頭個女人上門討風流帳、你還替她圓了場、轉身心裡淌血。', '你退過一門親事、退的理由你不肯對自己說清——多半是為了她。', '你想過攔、可張不開口、你是師姐、有什麼立場攔。', '那暗號水袖第三道、如今她台上還對你遞、台下卻夜夜不歸。'],
        wants: [w('愛', '想要柳別只把夜裡的溫存夜夜給外面的女人、也回頭抱抱你——可你是師姐、不能管、只能在一個人的夜裡懷念她還乾淨時、只黏你一人的青春', 0.92, 0.3, 8, '柳生春'), w('志向', '在還能唱的年紀、留一個會讓人記住「蘇映雪」三個字的杜麗娘', 0.5, 0.3, 3)] },
    { name: '田巧雲', scene: '帳房', persona: '春雪社班主、前坤生，冷臉熱心。**秘密**：年輕時你與花旦白蘭搭生旦唱紅《牡丹亭》、那是你這輩子最好的戲；白蘭被許了人家、遠嫁南洋，你再唱不出那齣、就此封箱接了班主。你看柳蘇——一個沾染風塵夜夜不歸、一個守著燈不肯說——就像看當年沒把話說出口的自己，心口發緊。',
        mem: ['你頭回與白蘭搭生旦唱紅《牡丹亭》、那是你這輩子最好的戲。', '白蘭被許了人家、遠嫁南洋、你連句留的話都沒說出口。', '她出嫁那天你在後台沒去、就此封箱。', '她從南洋寄回一封信、你背得出、卻一直沒回。', '你看蘇映雪守著那盞夜燈、就像看當年不敢開口的自己。', '柳生春這風流、你年輕時也有過、後來才懂那是怕。', '話不說出口、人就真的會走、這是你拿一輩子換來的。'],
        wants: [w('護', '想推蘇映雪一把、別像當年的自己把話爛在肚裡、白白看人走', 0.6, 0.35, 4, '蘇映雪'), w('現實', '守住班子別散', 0.55, 0.4, 4)] },
    { name: '金鳳', scene: '後台前頭', persona: '柳生春的舊相好之一、風塵裡打滾的女子、也是個戲迷。三天兩頭來後台討風流帳——討個說法、討一夜、討柳當日許過的甜話。纏、艷、不肯走。你心知柳對誰都這樣、你不是第一個也不會是最後一個，可你偏不甘心只做其中一個。',
        mem: ['柳生春當日怎麼撩你、那些甜話你到現在還記得。', '你為她花過的情、賠過的笑、不肯算的帳。', '你聽過她台上那一口風流、滿園子的人都瘋。', '你知道她屋裡那盞燈是替誰亮的、你偏要當沒看見。'],
        wants: [w('討帳', '從柳生春那兒討個說法、討一夜、討一句準話', 0.7, 0.25, 3, '柳生春')] },
];

const PARTS = ['清晨', '日午', '晡時', '黃昏', '夜'];
const tension = (x: Want) => x.weight * (1 - x.sat);
const DECAY = 0.6;
const STAKES: Record<number, string> = {
    2: '金鳳又來後台討風流帳、當著蘇映雪的面纏柳生春。',
    4: '又一個女子託人帶話來、討柳老闆一句準話——班裡都曉得柳老闆的風流帳一筆接一筆。',
    7: '金鳳哭鬧著要柳生春給個說法、鬧到了後台。',
    9: '柳老闆連著兩夜不歸、班裡都在嚼舌根。',
    12: '金鳳放話：柳生春再不給個準話、她就不走了。',
    14: '田巧雲私下對蘇映雪嘆：當年我把話爛在肚裡、白白看白蘭上了花轎。',
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
    const solo = inScene(c.scene).length === 1;
    if (f < R * 0.5) return solo ? '夜深人靜，舊事自己浮上來，由它浮著。' : '這事藏著就藏著、緩著就緩著。';
    if (f < R) return solo ? '一個人的夜裡，那些年的事翻上來，心裡有點堵。' : '心裡翻著，可人前多半還是按下不表。';
    return priv ? '再也按不住了——只你二人、這是門外唯一能說真話的地方，這一刻全由你的心。'
        : (solo ? '再也忍不住了——這些年的話頂到了喉嚨口，可惜聽的人不在。' : '再也按不住了——這一刻你得把那句憋了多年的話做個了斷，由你的心。');
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
    const sys = '你是說書人。把這一個時段裡幾個場景併發發生的事，編成一段章回(民國話本口吻、暖、含蓄、戲假情真、情到深處可濃)。一頭是外頭的風流、一頭是廂房的孤燈懷念，用「與此同時/那廂」對照著轉。戲劇處寫細、過場一句帶過。忠於發生的事、別新增情節。輸出一段(不要標題不要 JSON)。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【${clock}】素材：\n${beats.join('\n')}` }], maxTokens: 650, temperature: 0.85 });
    return s(r.text);
}
const satGain = (c: Char, x: Want) => (x.layer === '愛' && !PRIVATE.has(c.scene) ? 0.05 : 0.16);

async function runScene(client: Client, model: string, sc: string, clock: string, stake: string, isIntim: boolean, intim: string[]): Promise<string[]> {
    const out: string[] = []; const log: string[] = [];
    const occ = inScene(sc); if (!occ.length) return out;
    const solo = occ.length === 1; const maxTurns = solo ? 2 : (isIntim ? 6 : 4);
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
    const ticks = process.argv[2] ? Number(process.argv[2]) : 15;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 加厚版 · 蘇映雪的單向煎熬（柳風流夜不歸 / 蘇懷念逼說出口）· ${ticks} tick\n`);

    let part = 0, day = 1; const intim: string[] = []; let confessed = false;
    const liu = CHARS.find((c) => c.name === '柳生春')!; const su = CHARS.find((c) => c.name === '蘇映雪')!;
    const jin = CHARS.find((c) => c.name === '金鳳')!;
    for (let tick = 1; tick <= ticks; tick++) {
        const clock = `第${day}日·${PARTS[part]}`; const isNight = PARTS[part] === '夜'; const stake = STAKES[tick] ?? '';
        console.log(`\n${'━'.repeat(78)}\n◆ ${clock}${stake ? `　【風聲】${stake}` : ''}`);
        // 舊相好上門的日子：金鳳進後台、當蘇的面纏柳 → 蘇的痛(want sat 掉)
        if ([2, 7, 12].includes(tick)) { jin.scene = '後台'; liu.scene = '後台'; su.scene = '後台'; su.wants[0].sat = Math.max(0, su.wants[0].sat - 0.12); console.log(`  〔走位〕金鳳進了後台討帳——柳蘇都在。`); }
        else if (!isNight) { jin.scene = '後台前頭'; }
        const tickBeats: string[] = [];

        if (isNight) {
            const lastNight = tick + 5 > ticks; // 最後一夜：柳終於回來，給懺悔一個舞台
            const liuHome = lastNight || tension(liu.wants[1]) > tension(liu.wants[0]); // 風流被餵飽後、愛才浮過風流 → 回家
            if (!liuHome) {
                liu.scene = '金鳳處'; jin.scene = '金鳳處'; su.scene = '蘇映雪廂房';
                su.wants[0].sat = Math.max(0, su.wants[0].sat - 0.15); su.wants[0].frust += 2; // 又一夜不歸 → 懷念更深、壓力累積
                liu.wants[0].sat = Math.min(1, liu.wants[0].sat + 0.22); // 風流被餵
                console.log(`  〔手卷〕夜深，柳生春又跟金鳳出去了、一夜不歸；蘇映雪獨守廂房。`);
                console.log(`     ▸ 金鳳處（柳生春、金鳳）`);
                tickBeats.push(...await runScene(client, model, '金鳳處', clock, '', false, intim));
                console.log(`     ▸ 蘇映雪廂房（蘇映雪 · 獨自）`);
                tickBeats.push(...await runScene(client, model, '蘇映雪廂房', clock, '夜深了，柳又沒回來。你獨自守著這空廂房，那盞燈替誰亮著。', false, intim));
            } else {
                liu.scene = '蘇映雪廂房'; su.scene = '蘇映雪廂房';
                console.log(`  〔手卷〕夜深，柳生春終於回來了、到了師姐的廂房，只他二人。`);
                const before = intim.length;
                tickBeats.push(...await runScene(client, model, '蘇映雪廂房', clock, '夜深，柳生春一身夜露、終於回來了。', true, intim));
                if (intim.length > before) confessed = true;
            }
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
    console.log(`\n${'═'.repeat(78)}\n看：① 蘇獨守廂房時、有沒有從記憶反思出青春懷念(柳還只黏她一人時) ② 柳的風流是不是怕的偽裝(對金鳳甜、對蘇躲) ③ 累積壓力(夜不歸×N+舊相好上門)有沒有頂破蘇的 resistance ④ 蘇最後有沒有說出口「別只抱外面的、也抱抱我」(confessed=${confessed}) ⑤ 田巧雲白蘭鏡像推蘇 ⑥ 廂房：${intim.length ? intim.join('→') : '—(柳沒回來/沒到私情)'}。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
