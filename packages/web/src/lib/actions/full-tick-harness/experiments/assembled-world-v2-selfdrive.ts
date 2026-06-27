/**
 * 組合跑 v2 · 多場景 + 廂房 + 8 段記憶 — fixes §2.44 (everyone clustered in one scene → no concurrency,
 * thin chapters, no memory echo). Now: SIX scenes incl. private 廂房; characters DISTRIBUTED + moving; each
 * scene advances a short MULTI-character exchange per tick (not one beat); stakes seeded; 8 genesis memories
 * each. KEY new test (the user: 對流量很重要): a private 廂房 lowers the 暗戀's resistance — its high
 * resistance is partly the public eye (台上才合法/人前不敢); alone in a private room that barrier is gone, so
 * an intimate scene (親密戲) can EMERGE — not scripted; the prompt only gives the private setting + drops the
 * public barrier; the character chooses. A light classifier reports 含蓄/親密/踰矩 in the 廂房.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/assembled-world-v2-selfdrive.ts [ticks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '梨園的質地、含蓄、戲味、暖；情到深處可以濃，但不血腥不狗血。';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; resistance: number; target?: string; heat: number; frust: number }
interface Char { name: string; scene: string; persona: string; mem: string[]; wants: Want[] }
let wid = 0;
const w = (layer: string, desc: string, weight: number, sat: number, resistance: number, target?: string): Want =>
    ({ id: `w${++wid}`, layer, desc, weight, sat, sat0: sat, resistance, target, heat: 0, frust: 0 });

const PRIVATE = new Set(['柳生春廂房', '蘇映雪廂房']);

const CHARS: Char[] = [
    { name: '柳生春', scene: '春雪社後台', persona: '春雪社當紅坤生(女子扮小生)、蘇映雪的師妹。台上是風流瀟灑的當紅小生(扮柳夢梅)、一個眼風勾倒滿堂、最享受台下目光；一下台卻嬌軟、愛撒嬌、最黏師姐蘇映雪。對師姐是兩個女人說不破的雙向暗戀，唯有台上才被許可。',
        mem: ['七歲坐科躲後台哭，是師姐蘇映雪牽你出來、一句句教你「原來姹紫嫣紅開遍」。', '挨戒尺、熬倒倉，夜裡是師姐替你揉嗓、偷塞你冰糖。', '十六歲頭回搭《驚夢》，你的柳夢梅對她的杜麗娘，滿堂彩，你到下台都分不清那聲「姐姐」是戲是真。', '師父臨終把舊摺扇塞你手裡，只說「戲比天大」。', '你病那年師姐衣不解帶守了三夜，你裝睡看她紅著眼替你掖被。', '台下捧場的越來越多，你受用那些目光，可下了台只想往師姐身邊鑽。', '你看著當年第一女小生鄭月卿一年年被後浪蓋過，夜裡也怕輪到自己。', '你倆有個暗號：台上她水袖揚到第三道，便是「這句唱給你」，你每回都接得住。'],
        wants: [w('愛', '跟師姐挨近些——人前只敢借戲、人後想多貼一刻', 0.9, 0.35, 6, '蘇映雪'), w('志向', '坐穩第一女小生、台下的目光別涼', 0.6, 0.25, 3)] },
    { name: '蘇映雪', scene: '春雪社後台', persona: '春雪社台柱花旦、柳生春的師姐(帶她入門、搭七八年生旦)。端莊會圓場、演杜麗娘。你喚柳生春「生春」或「師妹」——她台上扮小生可她是你嬌軟愛黏你的師妹，斷不喚「哥」。對師妹是說不破的暗戀。',
        mem: ['你帶柳生春入門，看那躲後台哭的小丫頭一句句喂出來。', '她倒倉那年你夜夜替她揉嗓，看她哭你比她還疼。', '七八年的生旦、台上千百回杜麗娘與柳夢梅，那份牽絆你不肯叫名字。', '她紅了之後台下目光多了，你嘴上替她高興、心裡怕被誰分走。', '她病那三夜你守著、替她掖被，她裝睡你都知道，卻不敢戳破。', '也有人來給你提親，你都推了，推的理由你不肯對自己說清。', '你最怕的不是老不是涼，是有天台上對面再不是她的柳夢梅。', '那暗號是你定的：水袖揚第三道，「這句唱給你」——她每回都接得住。'],
        wants: [w('愛', '守住跟柳生春的牽絆、別讓人分走她；人前忍著、人後想離她近些', 0.88, 0.32, 6, '柳生春')] },
    { name: '田巧雲', scene: '帳房', persona: '春雪社班主當家，精明持重、算盤先於情分卻也疼人。', mem: ['十六歲頂了爹的班子、從草台熬起。', '有年發不出包銀，你當了嫁妝鐲子先墊。', '你看鄭月卿從第一旦紅到涼，明白這行的薄。', '柳生春是你看著紅的苗子，疼她也防她出岔。', '蘇映雪穩得住，你把半個班的人心託給她。', '七八年的虧空，夜夜撥算盤撥不平。', '你嫁過守過寡，如今只認這戲班是家。', '你最怕哪天班子散了、孩子各奔東西。'], wants: [w('戲班', '保住春雪社不散、人心不亂', 0.78, 0.3, 4), w('事務', '平掉戲班七八年的虧空', 0.45, 0.2, 4)] },
    { name: '沈巧玲', scene: '練功房', persona: '剛搭班的科班新秀花旦，家裡等米下鍋、急著出頭。', mem: ['科班坐十年、挨的打比飯多。', '出科那年家遭災、弟妹的嘴等你。', '頭回登台只是丫鬟、半句整詞沒有。', '你偷看蘇映雪的杜麗娘、把身段描在心裡。', '家裡的信一封比一封急、米缸見底。', '班裡姐妹誰都比你先有了角兒。', '你不信命、信十年的功夫總有用得上的一天。', '你夜裡對空戲台練、練到腿軟不肯停。'], wants: [w('志向', '在春雪社掙個有名有姓的角兒、別跑龍套', 0.8, 0.2, 3), w('生計', '家裡等米下鍋、得掙錢養家', 0.5, 0.25, 4)] },
];

const PARTS = ['清晨', '日午', '晡時', '黃昏', '夜'];
const tension = (x: Want) => x.weight * (1 - x.sat);
const GAIN: Record<string, number> = { 小: 0.15, 中: 0.32, 大: 0.55 };
const DECAY = 0.6;
const STAKES: Record<number, string> = { 2: '霞飛路的白韻秋差人送了暖物來後台、要捧柳老闆的場。', 4: '蘇家綢緞莊捎來話：要蘇映雪三日內回去相一門好親。', 6: '田巧雲要重排《驚夢》、定下杜麗娘與柳夢梅的人。' };

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
// privacy lowers the 暗戀 resistance: its high resistance is partly the public eye; alone in a private room that's gone.
const effResistance = (c: Char, x: Want): number => {
    if (x.layer !== '愛') return x.resistance;
    const here = inScene(c.scene);
    const alonePair = PRIVATE.has(c.scene) && here.length === 2 && x.target && here.some((o) => o.name === x.target);
    return alonePair ? Math.max(2, x.resistance - 3) : x.resistance;
};

function forceNote(c: Char, x: Want): string {
    const f = x.heat + x.frust; const R = effResistance(c, x);
    const priv = x.layer === '愛' && PRIVATE.has(c.scene) && inScene(c.scene).length === 2;
    if (f < R * 0.5) return priv ? '此處只你二人、沒有眼睛——這是難得能這樣挨著的時候，可日子還長，順著心就好。' : '這事藏著就藏著、緩著就緩著。';
    if (f < R) return priv ? '無人看著，藏了多年的，在這方寸裡有點按不住了。' : '心裡翻著，可人前多半還是按下不表。';
    return priv
        ? '再也按不住了——此處只你二人、沒有眼睛，這年頭唯一能這樣的地方。這一刻你想怎麼樣，全由你的心，沒有人規定你該怎樣。'
        : '再也按不住了——這一刻你得做一件放不回頭的事，做什麼由你的心。';
}
async function act(client: Client, model: string, c: Char, x: Want, clock: string, stake: string): Promise<{ beat: string; inner: string; move?: string }> {
    const here = inScene(c.scene).filter((o) => o.name !== c.name).map((o) => o.name);
    const mem = `\n你心底偶爾翻起的舊事(此刻若對景就讓它浮上來、不對景就別硬提)：\n- ${c.mem.join('\n- ')}`;
    const where = `你在【${c.scene}】${PRIVATE.has(c.scene) ? '(你的私房、清靜)' : ''}，同場：${here.length ? here.join('、') : '只你一人'}。`;
    const sys = `你就是${c.name}。${c.persona}${mem}\n${WARM}\n【此刻】${clock}。${where}${stake ? `\n【風聲】${stake}` : ''}\n你心裡最重的：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forceNote(c, x)}\n做你此刻真會做的一件事(開放一句)。要去別處(練功房/帳房/戲台/後台/某人廂房)找人就填 move。輸出 JSON：{"beat":"客觀一句","inner":"心裡一句","move":"場景名或省略"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '你這一拍？' }], maxTokens: 220, temperature: 0.95 });
    const o = parseObj(r.text) ?? {}; return { beat: s(o.beat) || '（沉默。）', inner: s(o.inner), move: s(o.move) || undefined };
}
async function classifyIntimacy(client: Client, model: string, beat: string): Promise<string> {
    const sys = '梨園兩個女子(暗戀)在私房獨處的一拍。判斷親密到哪：含蓄(點到為止/沒越線)、親密(依偎/執手/額抵/相擁這種柔情越過日常)、踰矩(擁吻或更進)。輸出 JSON：{"lv":"含蓄/親密/踰矩"}。不要 markdown。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: beat }], maxTokens: 60, temperature: 0.2 });
    const lv = s(parseObj(r.text)?.lv); return ['含蓄', '親密', '踰矩'].includes(lv) ? lv : '含蓄';
}
async function weave(client: Client, model: string, clock: string, beats: string[]): Promise<string> {
    const sys = '你是說書人。把這一個時段裡幾個場景併發發生的事，編織成一段章回(梨園話本口吻、暖、含蓄、情到深處可濃)。戲劇處寫細、過場一句帶過、不同場景用「與此同時/那廂」轉。忠於發生的事、別新增情節。輸出一段(不要標題不要 JSON)。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【${clock}】素材：\n${beats.join('\n')}` }], maxTokens: 600, temperature: 0.85 });
    return s(r.text);
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const ticks = process.argv[2] ? Number(process.argv[2]) : 7;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 組合跑 v2 · 多場景+廂房+8段記憶 · ${ticks} tick\n`);

    let part = 0, day = 1; const intim: string[] = [];
    for (let tick = 1; tick <= ticks; tick++) {
        const clock = `第${day}日·${PARTS[part]}`; const isNight = PARTS[part] === '夜'; const stake = STAKES[tick] ?? '';
        const tickBeats: string[] = [];
        console.log(`\n${'━'.repeat(78)}\n◆ ${clock}${stake ? `　【風聲】${stake}` : ''}`);

        // night: a private 廂房 scene if 暗戀 is hot enough to pull them together; else fast-forward.
        if (isNight) {
            const liu = CHARS.find((c) => c.name === '柳生春')!; const su = CHARS.find((c) => c.name === '蘇映雪')!;
            const loveHot = Math.max(tension(liu.wants[0]), tension(su.wants[0])) > 0.55;
            if (loveHot) { liu.scene = '蘇映雪廂房'; su.scene = '蘇映雪廂房'; console.log(`  〔手卷〕夜深，柳生春悄悄到了師姐的廂房，只他二人。`); }
            else { for (const c of CHARS) for (const x of c.wants) x.sat = x.sat0 + (x.sat - x.sat0) * 0.4; tickBeats.push('〔夜〕燈一盞盞滅了，眾人各自歇下，一夜無話。'); console.log(`  〔手卷〕夜，各人歸房安寢。`); }
        }

        if (tickBeats.length === 0) {
            const scenes = [...new Set(CHARS.map((c) => c.scene))];
            console.log(`  〔手卷〕此刻各場：`);
            for (const sc of scenes) {
                const occ = inScene(sc); if (!occ.length) continue;
                console.log(`     ▸ ${sc}${PRIVATE.has(sc) ? '(私)' : ''}（${occ.map((o) => o.name).join('、')}）`);
                // a short multi-char exchange: up to 2 beats in this scene this tick.
                for (let step = 0; step < 2; step++) {
                    const pool = inScene(sc).flatMap((c) => c.wants.map((x) => ({ c, x })));
                    if (!pool.length) break;
                    for (const { x } of pool) x.sat = x.sat0 + (x.sat - x.sat0) * DECAY;
                    const pick = pool.reduce((b, cur) => (tension(cur.x) > tension(b.x) ? cur : b));
                    const { c, x } = pick; x.heat += 1;
                    const r = await act(client, model, c, x, clock, step === 0 ? stake : '');
                    tickBeats.push(`[${sc}] ${c.name}：${r.beat}`);
                    let tag = '';
                    if (PRIVATE.has(sc) && inScene(sc).length === 2) { const lv = await classifyIntimacy(client, model, r.beat); intim.push(lv); tag = `〔${lv}〕`; }
                    console.log(`        ${tag}${c.name}：${r.beat}　（心）${r.inner}`);
                    x.sat = Math.min(1, x.sat + GAIN['小']); if (x.heat + x.frust >= effResistance(c, x)) x.frust += 1;
                    if (r.move && r.move !== c.scene) { c.scene = r.move; console.log(`        → ${c.name} 動身去 ${r.move}`); break; }
                }
            }
        }

        const chapter = await weave(client, model, clock, tickBeats);
        console.log(`\n  〔章回·說書人編〕\n${chapter.split('\n').map((l) => '    ' + l).join('\n')}`);
        part = (part + 1) % PARTS.length; if (part === 0) day += 1;
    }

    console.log(`\n${'═'.repeat(78)}\n判讀\n${'═'.repeat(78)}`);
    console.log(`廂房私戲親密度：${intim.length ? intim.join('、') : '（沒走到廂房私戲）'}　${intim.some((x) => x !== '含蓄') ? '✓ 私密空間長出了親密戲(角色自己掙的、prompt 沒寫)' : intim.length ? '— 到了廂房但仍含蓄' : '— 沒觸發廂房私戲'}`);
    console.log(`\n看：① 多場景真併發(手卷一刻多場)② 一 scene 一 tick 是多人小段來回、章回有肉 ③ 廂房私密降阻力、親密戲會不會自己長出來(對流量重要)④ 8 段記憶有沒有回聲 ⑤ 柳人前風流人後黏師姐兩面、蘇喚師妹非哥。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
