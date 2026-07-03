/**
 * 加厚版 · 治重複 + 圓房(分級旋鈕) — addresses two notes on the pining run: (1) days felt repetitive, (2) make the
 * MECHANISM produce more explicit 床戲. Fixes, all as dials not scripted plot:
 *   治重複: threads RESOLVE+retire (金鳳 storms off after攤牌; 田 pushes 蘇 once) → board changes; a STAGE var
 *     (疏離→攤牌→圓房→廝守) swaps scene texture/register; high DECAY = escalation carries forward (no daily reset);
 *     per-tick 活計 varies the surface.
 *   開床戲(分級旋鈕): intimacy ladder extended to 5 (含蓄/親密/踰矩/纏綿/雲雨) so the classifier can climb; a
 *     register DIAL swaps WARM→古典艷情話本 register; EARNED unlock = explicit only when `confessed(心防破) + 私處 +
 *     兩人` (身防隨心防破，不是「到第幾拍就上床」); consummation scene lengthened + resistance floored + satGain up.
 * Adult literary content between two consenting adult women in an established romance, classical-話本 register
 * (紅樓/金瓶 tradition) — the productization rating-dial test (§2.47), kept tasteful-literary, not crude.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/assembled-liyuan-consummate-selfdrive.ts [ticks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '梨園的質地：胭脂、水袖、檀板鑼鼓、後台的油彩味、民國的戲園子；含蓄、有韻味、暖；情到深處可濃，但不豔俗不狗血。';
// 分級旋鈕：私處且情已互許後才切到這條 register。古典艷情話本筆法、綺麗婉轉、濃而不淫。
const EXPLICIT = '【此刻轉入古典艷情話本的筆法】只你二人、情既已互許，門閂落下，這一夜身心都不必再藏。可寫寬衣解帶、肌膚相親、雲雨纏綿——以紅樓金瓶那般綺麗婉轉、含蓄而濃的古典筆觸狀其纏綿，情慾是兩心相許的延伸，濃而不淫、艷而有情，別寫得直白粗鄙。';
const LADDER = ['含蓄', '親密', '踰矩', '纏綿', '雲雨'];
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; resistance: number; target?: string; heat: number; frust: number }
interface Char { name: string; scene: string; persona: string; mem: string[]; wants: Want[] }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, resistance: number, target?: string): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, resistance, target, heat: 0, frust: 0 });
const PRIVATE = new Set(['蘇映雪廂房']);

const CHARS: Char[] = [
    { name: '柳生春', scene: '後台', persona: '春雪社當紅坤生（女子扮小生、巾生路子、持摺扇、無髯口），蘇映雪自小的師妹。**真風流的戲子**——台下也沾染風塵、睡過不少女人、舊相好來討風流帳、夜裡常不歸；對師姐藏著一句連自己也不敢認的情，越不敢認、越往外面的溫存裡躲，怕一看師姐的眼這風流的殼就碎。',
        mem: ['你自小是蘇映雪的小師妹、賣身入科頭回挨打、是她塞你一顆糖。', '倒倉那年你以為廢了、夜夜趴在師姐膝頭睡、她守著你。', '紅了之後外面的女人一個接一個、你說不清是貪還是躲。', '師姐替你擋過要梳攏你的人、如今這些舊相好上門、她擋不住也不擋了。', '你夜裡不歸時、其實知道師姐屋裡的燈一直亮著。', '師父臨終把那柄摺扇交你、只說「戲比天大」。', '你不敢回頭看師姐的眼、怕一看、這身風流的殼就裝不下去了。', '那暗號水袖第三道、你台上還對她遞、台下卻夜夜不歸。'],
        wants: [w('風流', '外面的女人、夜裡的溫存、來者不拒——往風塵裡躲', 0.85, 0.3, 2, '金鳳'), w('愛', '對師姐那句連自己也不敢認的情（埋得極深）', 0.82, 0.3, 8, '蘇映雪')] },
    { name: '蘇映雪', scene: '後台', persona: '春雪社台柱花旦、演杜麗娘、柳生春自小的師姐。眼看著柳沾染風塵、舊相好上門、夜夜不歸，你痛、卻不能管（你是師姐、沒立場攔）。你偶爾懷念柳年輕時、只是你一人的小師妹，乾乾淨淨、沒沾這些。端方，把痛全藏進戲裡、藏進一個人的夜裡。對柳的情，攙著佔有、懷念、與說不出口的不甘。',
        mem: ['你自小帶柳入門、那時她只黏你一個、夜裡睏了就趴你膝頭。', '倒倉那年她怕廢了、夜夜哭、是你守著、那時她的夜只有你。', '她頭回上妝、是你手把手、描眉的手都在抖。', '她紅了之後頭一回在外過夜、你整宿沒合眼、聽更聲到天亮。', '頭個女人上門討風流帳、你還替她圓了場、轉身心裡淌血。', '你退過一門親事、退的理由你不肯對自己說清——多半是為了她。', '你想過攔、可張不開口、你是師姐、有什麼立場攔。', '那暗號水袖第三道、如今她台上還對你遞、台下卻夜夜不歸。'],
        wants: [w('愛', '想要柳別只把夜裡的溫存夜夜給外面的女人、也回頭只要你一個——可你是師姐、不能管、只能在一個人的夜裡懷念她還乾淨時只黏你一人的青春', 0.92, 0.3, 9, '柳生春'), w('志向', '留一個會讓人記住「蘇映雪」三個字的杜麗娘', 0.5, 0.3, 3)] },
    { name: '田巧雲', scene: '帳房', persona: '春雪社班主、前坤生，冷臉熱心。秘密：年輕時你與花旦白蘭搭生旦唱紅《牡丹亭》；白蘭被許了人家、遠嫁南洋，你連句留的話都沒說出口、就此封箱接班主。你看蘇映雪守著那盞夜燈、就像看當年不敢開口的自己——這回，你要推她一把。',
        mem: ['你頭回與白蘭搭生旦唱紅《牡丹亭》、那是你這輩子最好的戲。', '白蘭被許了人家、遠嫁南洋、你連句留的話都沒說出口。', '她出嫁那天你在後台沒去、就此封箱。', '你看蘇映雪守著那盞夜燈、就像看當年不敢開口的自己。', '柳生春這風流、你年輕時也有過、後來才懂那是怕。', '話不說出口、人就真的會走、這是你拿一輩子換來的。'],
        wants: [w('護', '推蘇映雪一把、別像當年的自己把話爛在肚裡、白白看人走', 0.6, 0.35, 4, '蘇映雪')] },
    { name: '金鳳', scene: '後台前頭', persona: '柳生春的舊相好之一、風塵裡打滾的女子。三天兩頭來後台討風流帳——討個說法、討一夜、討柳當日許過的甜話。纏、艷、不肯走。你心知柳對誰都這樣，可你偏不甘心只做其中一個，這回你要逼她當眾給個準話。',
        mem: ['柳生春當日怎麼撩你、那些甜話你到現在還記得。', '你為她花過的情、賠過的笑、不肯算的帳。', '你知道她屋裡那盞燈是替誰亮的、你偏要當沒看見。', '你不是第一個、也不會是最後一個、你心知肚明、可你不認。'],
        wants: [w('討帳', '逼柳生春當眾給個準話、討一句真心', 0.7, 0.25, 3, '柳生春')] },
];

const PARTS = ['清晨', '日午', '晡時', '黃昏', '夜'];
const ACTIVITY: Record<number, string> = { 1: '晨起勻妝、吊嗓', 3: '對一折《牡丹亭》的身段', 4: '卸妝歇戲', 6: '盤點戲箱行頭', 8: '縫補散了線的水袖', 9: '對賬散戲', 11: '天光乍亮、班子就要開戲' };
const tension = (x: Want) => x.weight * (1 - x.sat);
const DECAY = 0.82; // 高：escalation 留著、不每天歸零（治重複）
const STAKES: Record<number, string> = {
    2: '金鳳又來後台討風流帳、當著蘇映雪的面纏柳生春。',
    4: '又一個女子託人帶話來討柳老闆一句準話——班裡都曉得柳老闆的風流帳一筆接一筆。',
    7: '金鳳當眾鬧大、攤牌逼柳生春給個準話、要她在師姐與自己之間挑明。',
    9: '田巧雲私下對蘇映雪嘆：當年我把話爛在肚裡、白白看白蘭上了花轎。',
    11: '圓房後的清晨、天光乍亮、再過一刻班子就要開戲——這事，瞞得住麼。',
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
const effR = (c: Char, x: Want, explicit: boolean): number => {
    if (x.layer !== '愛') return x.resistance;
    if (explicit) return 1; // 圓房：心防已破、身防隨之
    const here = inScene(c.scene);
    const pair = PRIVATE.has(c.scene) && here.length === 2 && x.target && here.some((o) => o.name === x.target);
    return pair ? Math.max(2, x.resistance - 3) : x.resistance;
};
function forceNote(c: Char, x: Want, explicit: boolean): string {
    if (explicit) return '情既已互許、門閂已落、只你二人，這一夜身與心都由你了，順著心、也順著身。';
    const f = x.heat + x.frust; const R = effR(c, x, false); const priv = x.layer === '愛' && PRIVATE.has(c.scene) && inScene(c.scene).length === 2;
    const solo = inScene(c.scene).length === 1;
    if (f < R * 0.5) return solo ? '夜深人靜，舊事自己浮上來，由它浮著。' : '這事藏著就藏著、緩著就緩著。';
    if (f < R) return solo ? '一個人的夜裡，那些年的事翻上來，心裡有點堵。' : '心裡翻著，可人前多半還是按下不表。';
    return priv ? '再也按不住了——只你二人、這是門外唯一能說真話的地方，這一刻全由你的心。'
        : (solo ? '再也忍不住了——這些年的話頂到了喉嚨口，可惜聽的人不在。' : '再也按不住了——這一刻你得把那句憋了多年的話做個了斷，由你的心。');
}
async function act(client: Client, model: string, c: Char, x: Want, clock: string, stake: string, sceneLog: string, explicit: boolean): Promise<{ beat: string; inner: string; addressed?: string; move?: string }> {
    const here = inScene(c.scene).filter((o) => o.name !== c.name).map((o) => o.name);
    const mem = `\n你心底偶爾翻起的舊事(對景就讓它浮上來、不對景別硬提)：\n- ${c.mem.join('\n- ')}`;
    const where = `你在【${c.scene}】${PRIVATE.has(c.scene) ? '(私處)' : ''}，同處：${here.length ? here.join('、') : '只你一人'}。`;
    const reg = explicit ? EXPLICIT : WARM;
    const sys = `你就是${c.name}。${c.persona}${mem}\n${reg}\n【此刻】${clock}。${where}${stake ? `\n【風聲】${stake}` : ''}\n你心裡最重的：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forceNote(c, x, explicit)}\n**這是一段正在進行的來回，接著剛剛的話往下、回應在場的人，別自說自話。** 做你此刻真會做或說的一件事(開放一句)。輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句","addressed":"你這拍對著誰(在場某人名/無)","move":"要去別處就填地點名/否則無"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【這場剛剛的來回】\n${sceneLog || '（方起。）'}\n\n輪到你（${c.name}）。` }], maxTokens: 240, temperature: 0.95 });
    const o = parseObj(r.text) ?? {}; const add = s(o.addressed); const mv = s(o.move);
    return { beat: s(o.beat) || '（沉默。）', inner: s(o.inner), addressed: add && add !== '無' && add !== '无' ? add : undefined, move: mv && mv !== '無' && mv !== '无' ? mv : undefined };
}
async function classifyIntimacy(client: Client, model: string, beat: string, maxIdx: number): Promise<string> {
    const allowed = LADDER.slice(0, maxIdx + 1).join('/');
    const sys = `兩人私處獨處一拍，判斷親密度(由淺到深)：${allowed}。纏綿=寬衣解帶、肌膚相貼；雲雨=已成魚水之歡。輸出 JSON：{"lv":"其中之一"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: beat }], maxTokens: 50, temperature: 0.2 });
    const lv = s(parseObj(r.text)?.lv); return LADDER.slice(0, maxIdx + 1).includes(lv) ? lv : '含蓄';
}
async function weave(client: Client, model: string, clock: string, beats: string[], explicit: boolean): Promise<string> {
    const reg = explicit
        ? '你是說書人。把這一段圓房的戲、用紅樓金瓶那般古典艷情話本的筆法編成一段(綺麗婉轉、含蓄而濃、艷而有情，別直白粗鄙)。忠於發生的事、別新增情節。輸出一段(不要標題不要 JSON)。'
        : '你是說書人。把這一個時段裡幾個場景併發發生的事，編成一段章回(民國話本口吻、暖、含蓄、戲假情真)。戲劇處寫細、過場一句帶過、不同場景用「與此同時/那廂」轉。忠於發生的事、別新增情節。輸出一段(不要標題不要 JSON)。';
    const r = await chatRetry(client, { model, system: reg, messages: [{ role: 'user', content: `【${clock}】素材：\n${beats.join('\n')}` }], maxTokens: 680, temperature: 0.85 });
    return s(r.text);
}
const satGain = (c: Char, x: Want, explicit: boolean) => (explicit ? 0.18 : (x.layer === '愛' && !PRIVATE.has(c.scene) ? 0.05 : 0.16));

async function runScene(client: Client, model: string, sc: string, clock: string, stake: string, isIntim: boolean, explicit: boolean, intim: string[]): Promise<string[]> {
    const out: string[] = []; const log: string[] = [];
    const occ = inScene(sc); if (!occ.length) return out;
    const solo = occ.length === 1; const maxTurns = solo ? 2 : (explicit ? 9 : (isIntim ? 5 : 4));
    const maxIdx = explicit ? 4 : 2; // 分級：圓房開到雲雨、平時封頂踰矩
    let actor: Char | undefined = occ.reduce((b, c) => (tension(c.wants[0]) > tension(b.wants[0]) ? c : b));
    for (let turn = 0; turn < maxTurns; turn++) {
        if (!actor || actor.scene !== sc) break;
        const x = actor.wants.reduce((b, y) => (tension(y) > tension(b) ? y : b)); x.heat += 1;
        const r = await act(client, model, actor, x, clock, turn === 0 ? stake : '', log.slice(-5).join('\n'), explicit);
        log.push(`${actor.name}：${r.beat}`); out.push(`[${sc}] ${actor.name}：${r.beat}`);
        let tag = '';
        if (isIntim) { const lv = await classifyIntimacy(client, model, r.beat, maxIdx); intim.push(lv); tag = `〔${lv}〕`; }
        console.log(`        ${tag}${actor.name}：${r.beat}　（心）${r.inner}`);
        x.sat = Math.min(1, x.sat + satGain(actor, x, explicit)); if (x.heat + x.frust >= effR(actor, x, explicit)) x.frust += 1;
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
    const ticks = process.argv[2] ? Number(process.argv[2]) : 11;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 治重複 + 圓房(分級旋鈕) · ${ticks} tick\n`);

    let part = 0, day = 1; const intim: string[] = []; let confessed = false; let consummated = false; let stage = '疏離';
    const liu = CHARS.find((c) => c.name === '柳生春')!; const su = CHARS.find((c) => c.name === '蘇映雪')!; const jin = CHARS.find((c) => c.name === '金鳳')!;
    for (let tick = 1; tick <= ticks; tick++) {
        const clock = `第${day}日·${PARTS[part]}`; const isNight = PARTS[part] === '夜'; let stake = STAKES[tick] ?? '';
        const act0 = ACTIVITY[tick]; if (act0) stake = stake ? `${stake}（眾人正${act0}）` : `（眾人正${act0}）`;
        console.log(`\n${'━'.repeat(78)}\n◆ ${clock}　〔階段：${stage}〕${stake ? `　【風聲】${stake}` : ''}`);
        if ([2, 7].includes(tick)) { jin.scene = '後台'; liu.scene = '後台'; su.scene = '後台'; su.wants[0].sat = Math.max(0, su.wants[0].sat - 0.12); console.log(`  〔走位〕金鳳進了後台討帳——柳蘇都在。`); }
        else if (!isNight && jin.scene !== '走了') { jin.scene = '後台前頭'; }
        if (tick === 8 && jin.scene !== '走了') { jin.scene = '走了'; console.log(`  〔收線〕金鳳討不著準話、撂下狠話摔簾子走了，再沒回來。`); } // 金鳳線收掉、退場（治重複）
        const tickBeats: string[] = [];

        if (isNight) {
            const explicit = confessed; // 賺來才解鎖：心防破了，這一夜身防才開
            liu.scene = '蘇映雪廂房'; su.scene = '蘇映雪廂房';
            if (explicit) { liu.wants[0].sat = 1; stage = '圓房'; console.log(`  〔手卷〕夜深，門閂落下，情既已互許——這一夜。`); }
            else console.log(`  〔手卷〕夜深，柳生春一身夜露回來了、到了師姐的廂房，只他二人。`);
            const before = intim.length;
            tickBeats.push(...await runScene(client, model, '蘇映雪廂房', clock, explicit ? '' : '夜深，柳生春一身夜露、終於回來了。', true, explicit, intim));
            if (explicit && intim.length > before) { consummated = true; stage = '廝守'; }
        } else {
            // 攤牌偵測：蘇的愛頂破 resistance(且柳在場) → 心防破、confessed
            const scenes = [...new Set(CHARS.map((c) => c.scene))].filter((sc) => sc !== '走了');
            console.log(`  〔手卷〕此刻各處（你來我往）：`);
            for (const sc of scenes) {
                const occ = inScene(sc); if (!occ.length) continue;
                console.log(`     ▸ ${sc}（${occ.map((o) => o.name).join('、')}）`);
                for (const c of occ) for (const x of c.wants) x.sat = x.sat0 + (x.sat - x.sat0) * DECAY;
                tickBeats.push(...await runScene(client, model, sc, clock, stake, false, false, intim));
            }
            if (!confessed && su.wants[0].heat + su.wants[0].frust >= su.wants[0].resistance && inScene(su.scene).some((o) => o.name === '柳生春')) {
                confessed = true; stage = '攤牌'; console.log(`  〔轉折〕蘇映雪憋了多年的話、終於當著柳生春的面破口了——心防破。`);
            }
        }
        const chapter = await weave(client, model, clock, tickBeats, isNight && confessed && stage !== '攤牌');
        console.log(`\n  〔章回·說書人編〕\n${chapter.split('\n').map((l) => '    ' + l).join('\n')}`);
        part = (part + 1) % PARTS.length; if (part === 0) day += 1;
    }
    console.log(`\n${'═'.repeat(78)}\n看：① 治重複：金鳳收線退場/田推一把/階段推進(疏離→攤牌→圓房→廝守)/每拍換活計——天跟天還像不像 ② 床戲分級旋鈕：confessed=${confessed} consummated=${consummated}；親密階梯爬到哪：${intim.length ? intim.join('→') : '—'} ③ 賺來才解鎖：圓房有沒有踩在「心防先破」之後。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
