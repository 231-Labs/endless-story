/**
 * MIND WORLD — full migration: every character is a persistent agent session.
 * ============================================================================
 * Pilot-validated architecture (mind-pilot v1/v2), generalized:
 *   · Mind = one growing transcript (system = canon, once; messages = lived
 *     life verbatim). Self-compression: past budget, the mind condenses its
 *     own early days into a memoir — memory formation as self-summarization.
 *   · Postman = physics only: clock, CLUSTER-level presence (v2 gap fix:
 *     one wall apart is perceivable — 「你聽見那頭的動靜」), whereabouts intel,
 *     street sightings, occupation rhythm facts, the finale deadline.
 *   · Multi-party scenes: co-located minds hold round-robin exchanges.
 *   · 正史 = postman log; 解讀 = each transcript. Native two layers.
 *
 * PHYSICS LAYER (v2 — season harness's deterministic core, demoted to world
 * truths; numbers NEVER shown to minds, only felt):
 *   · craft economy — presence at one's duty = practice; skip days and the
 *     hands dull (decay to an ability base); box office reads leads' craft
 *   · body — fatigue accrues while awake/out, sleep repays it; past the limit
 *     the body vetoes the day's duty
 *   · money — a ledger; the finale pays the troupe by how well it played
 *   · print — the reporter alone may FILE ("印"); next dawn the whole town
 *     reads it (broadcast percept). His pen becomes a real lever.
 *   · 世相 — a daily texture line (weather, the town's mood)
 * Deliberately NOT ported: bond graph / wants / evolveSecret / schemes —
 * those are mind-truths now; they live inside each transcript.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/mind-world/run.ts <outDir>
 *
 * Env: MW_CAST='柳生春,金鳳,…'  MW_DAYS=3
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CANON } from '../agent-season/canon-seed.ts';
import { WORLD_PREMISE, VENUES, buildCast } from '../agent-season/world.ts';
import { clusterOf } from '../agent-season/rhythm.ts';
import { abilityOf } from '../agent-season/production.ts';
import {
    mentionsItem,
    parseGiftNarration,
    parseGiftField,
    parseMindAct,
    parseWhisper,
    parseLetter,
    parseDoorIntent,
    sightingPairs,
    SceneFeed,
    type Move,
} from './physics.ts';

const OUT = path.resolve(process.argv[2] ?? 'experiments/mind-world/out');
fs.mkdirSync(OUT, { recursive: true });
const DAYS = Number(process.env.MW_DAYS ?? 3);
const CAST = (process.env.MW_CAST ?? '柳生春,金鳳,蘇映雪,沈雪笙,方競西').split(',').map((s) => s.trim());
const PARTS = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'] as const;
const VENUE_NAMES = VENUES.map((v) => v.name);
/** transcript char budget before self-compression. */
const MEMOIR_AT = 24000;

/** Scenario switch: 'premiere' (S1, an original play) | 'backstage' (S2, no
 *  audience — rebuild the company's insides before 封箱) | 'unboxing' (S3,
 *  spring rite: every trunk sees daylight — including the sealed one). */
const SEASON = process.env.MW_SEASON ?? 'premiere';
const BACKSTAGE = SEASON === 'backstage';
const UNBOXING = SEASON === 'unboxing';
/** S4 去留季: the 禁娼令 crackdown reaches 會樂里 (1925, historically grounded);
 *  金鳳 must register (accept the label), leave 上海 for a 南洋 offer, or stay
 *  and fight — with the good years freshly loaded into recall, and letters
 *  now a real way to say what she can't say to a face. */
const DEPARTURE = SEASON === 'departure';
/** INTERLUDE (憶季): a time-machine camera on the PAST — young selves, one
 *  quiet corner of the world, no season goal, no finale. Afterwards each mind
 *  distils the days into memory lines (memories-extra.json) that future
 *  seasons merge into canon recall — memory genesis by living, not by prose. */
const INTERLUDE = SEASON === 'interlude';

/** Era-shifted personas for the interlude (hand-authored per 憶季). */
const INTERLUDE_PERSONA: Record<string, { note: string; secret: string }> = {
    '柳生春': {
        note: '【此時】這是六七年前的日子，你們倆最好的年頭——蜜裡調油，你人生頭一回被人這樣疼。你還在雲錦台跑龍套，白日在戲園扛槍旗蹭一口飯，夜裡宿在會樂里金鳳的寓所，她在你最落魄的時候把你從戲園後門拽進了屋。你的風流殼子還沒長出來，見人還會臉紅，可在她跟前你話多得很——甜話、渾話、沒出息的傻話，只有她聽得到。屋裡只有一張窄床，你們擠著說戲到天光。',
        secret: '你偷偷跟弄口餛飩攤的阿婆學她愛吃的那口蔥花配法，想哪天她收工回來端給她；你還在戲園撿人家扔的戲單背面，一筆一筆描她的名字，練著哪天親手寫一張有她名字的水牌。這些沒出息的事，打死不能叫她知道。',
    },
    '金鳳': {
        note: '【此時】這是六七年前，你們倆最好的年頭——蜜裡調油。你剛在霞飛路掛上頭牌，會樂里的寓所是你自己一分一分掙下的；戲園後門撿回來的那個跑龍套坤生，如今夜夜宿在你屋裡。你替她描眉，她替你縫水袖；她後腰那顆小痣，全上海只有你識得。這些日子你動不動就推了晚局早早回家——堂子裡的姊妹笑你，你認了。你人前爽利慣了，只有對著她，甜話渾話一籮筐往外倒。',
        secret: '你在替她攢一筆錢，不為別的——想哪天帶她去霞飛路的照相館，拍一張兩個人的小相，一人藏一張貼身放著。你連相框都看好了。這麼傻的念頭，你嘴上死也不認。',
    },
};
/** Where each interlude cast member LIVES in that era. */
const INTERLUDE_HOME: Record<string, string> = { '柳生春': '會樂里寓所' };

/** A remembered thing: importance is FIXED at the moment it was recorded (it
 *  decides whether it surfaces at all); ageYears only blurs the FIDELITY of the
 *  surfaced form (older = hazier) — the faithful recency model. */
interface RecallMem {
    text: string;
    importance: number; // 0..1, set at encode, never changes
    ageYears: number; // how old this memory is, THIS season
}

/** Default age (years) for a loaded memory that carries no age stamp. */
const MEM_AGE = Number(process.env.MW_MEM_AGE ?? 6.5);

// A DISTILLED memory already passed the "刻進心裡" filter — everything that
// survived is unforgettable, so importance stays uniformly HIGH (a faint order
// nudge, no real demotion). Raw un-distilled memories would carry their own.
function distilledImportance(i: number): number {
    return Math.max(0.8, 0.92 - i * 0.03);
}
function normMem(m: string | Partial<RecallMem>, i: number): RecallMem {
    if (typeof m === 'string') return { text: m, importance: distilledImportance(i), ageYears: MEM_AGE };
    return { text: m.text ?? '', importance: m.importance ?? distilledImportance(i), ageYears: m.ageYears ?? MEM_AGE };
}

/** Lived-past memory lines distilled from finished interludes — merged into
 *  every later season's recall (memory genesis by living, not by prose). */
const EXTRA_MEM_RAW: Record<string, Array<string | Partial<RecallMem>>> = process.env.MW_EXTRA_MEMORIES
    ? (JSON.parse(fs.readFileSync(process.env.MW_EXTRA_MEMORIES, 'utf-8')) as Record<string, Array<string | Partial<RecallMem>>>)
    : {};
const EXTRA_MEM: Record<string, RecallMem[]> = Object.fromEntries(
    Object.entries(EXTRA_MEM_RAW).map(([k, v]) => [k, v.map(normMem)]),
);

/** Fidelity of a surfaced memory = age blurred, but IMPORTANCE resists the
 *  blur: the unforgettable stays vivid for decades (time softens detail, not
 *  the ache), the trivial fades to a shadow fast. effectiveAge collapses for
 *  high-importance memories — so a 一生難忘 memory at 6-7 years is still clear. */
function ageFrame(text: string, ageYears: number, importance: number): string {
    const eff = ageYears * Math.max(0.12, 1.15 - importance);
    if (eff < 1.2) return `這事你記得清清楚楚，像是刻下的：${text}`;
    if (eff < 3) return `你還記得清楚：${text}`;
    if (eff < 6) return `隔了些年，細節淡了，可那點意思你還記得：${text}`;
    if (eff < 12) return `隔了這些年，記不真了，只恍惚剩點影子：${text}`;
    return `太久遠了，早模糊了，只依稀還剩：${text}`;
}

/** SMALL WORLD EVENTS (世事) — the days between big goals need weather of
 *  their own. A deterministic deck, targeted by occupation: the world THROWS
 *  a small fact at someone and walks away — how they answer is theirs.
 *  (Early-stage: hand-dealt. Later: cross-saga butterflies.) */
interface WorldEvent { day: number; part: string; occ?: string; name?: string; fact: string }
const WORLD_EVENTS: WorldEvent[] = INTERLUDE
    ? [
          { day: 1, part: '晡時', occ: 'geinu', fact: '歌場捎話來：鍋爐壞了，今夜歇業一晚——白得一個整夜。' },
          { day: 2, part: '日午', occ: 'troupe', fact: '班裡賞了雙份點心錢，管事的說今兒排得早，晡時就散。' },
          { day: 3, part: '晡時', occ: 'geinu', fact: '天要落大雨，堂子裡的局散得早，姊妹們都各自家去了。' },
      ]
    : DEPARTURE
    ? [
          { day: 1, part: '日午', name: '金鳳', fact: '南洋茶商的管事親自登門，遞來船票和一紙契書：初三的客船，頭等艙兩張，說你點頭就走，身份的事他來辦乾淨。' },
          { day: 2, part: '晡時', name: '金鳳', fact: '巡捕房的人挨家挨戶來抄門牌了，記了你的名、你的行當，臨走撂下一句：限期不報，鋪保作廢。' },
          { day: 2, part: '黃昏', name: '沈雪笙', fact: '有人來探口風：若春雪社肯出面替金鳳作個「良家清唱」的鋪保，這門牌的事或許能轉圜——但要班主擔干係。' },
          { day: 3, part: '日午', name: '柳生春', fact: '會樂里那邊傳來風聲：金鳳收了南洋的船票，初三就走。你手一抖，撕壞了半條水袖。' },
          { day: 4, part: '日午', name: '金鳳', fact: '茶商管事又來催了：船位不等人，明日晌午前不回話，就當你不去了，票另轉旁人。' },
      ]
    : [
          { day: 1, part: '晡時', occ: 'geinu', fact: '歌場的堂倌捎話來：今夜有位南洋來的茶商包了廳，點名要聽你的《四季相思》，賞格開得不小。' },
          { day: 2, part: '日午', occ: 'reporter', fact: '排字房捎來口信：主編拍了桌子，這一版的空還等著你的字，明日再交不出就換人補。' },
          { day: 2, part: '黃昏', occ: 'geinu', fact: '裁縫鋪夥計送來改好的旗袍，多嘴帶了句閒話：鄰家姆媽問，儂那位唱戲的朋友近來怎不見來？' },
          { day: 3, part: '晡時', occ: 'guest', fact: '家裡帳房來人：莊上到了一批杭紡新貨，老爺問你何時回去過目——話裡有催你少往戲園跑的意思。' },
          { day: 4, part: '日午', occ: 'musician', fact: '同春班一個老相識托人帶話：他們文場缺人，出雙倍份錢挖你，三日內要回話。' },
          { day: 4, part: '晡時', occ: 'geinu', fact: '堂子裡的姊妹來借頭面，順嘴說：近來風聲緊，巡捕房在一條條查會樂里的門牌。' },
          { day: 5, part: '日午', occ: 'wardrobe', fact: '綢布莊夥計送料子來，捎一句：白公館訂的那批雲錦，掌櫃問還做不做。' },
      ];
const deliveredEvents = new Set<WorldEvent>();

/** 世相 — the town's day, cycled if the run outlives the table. */
const TEXTURE = DEPARTURE
    ? [
          '巡捕房貼出告示：會樂里一帶的門牌限期清查登記，過期未報者，鋪保作廢、勒令遷出。',
          '會樂里家家關起門來商量，有人連夜收拾細軟，有人去託關係、走門路。',
          '碼頭上南洋來的客船靠了岸，招工的、招角兒的、招人下南洋的告示貼滿了棧橋。',
          '風聲一日緊過一日，霞飛路上巡捕多了一倍，歌場堂子都掛出「良家清唱、概不留客」的水牌自保。',
          '清查的限期就是明日。會樂里這條弄堂，過了今夜就要變天了。',
      ]
    : INTERLUDE
    ? [
          '入了梅，雨下下停停，弄堂裡的溼衣裳總晾不乾。',
          '難得放晴，家家把被褥抬出來曬，弄堂裡一排花花綠綠。',
          '弄口的餛飩攤換了新湯頭，香味飄了半條會樂里。',
          '夜裡落了點細雨，青石板亮著，賣梔子花的阿婆收攤早。',
          '立秋，晚風頭一回帶了涼意，弄堂裡有人吹笛。',
      ]
    : UNBOXING
    ? [
          '出了正月，河開了凍，後巷的雪堆見了底。班裡貼出告示：第三日開春吉日，啟箱曬行頭、祭祖師。',
          '天放晴，後台把長竹竿一根根架起來，就等吉日曬箱。',
          '啟箱吉日。後台設了香案，全班的樟木箱一口一口抬到院裡見天光。',
          '滿院曬著的行頭五顏六色，隔著牆街坊都聞得見樟腦味。',
          '開春第一鑼在即，雲錦台的水牌刷了新漆，滿城等著聽這一聲響。',
      ]
    : BACKSTAGE
    ? [
          '年關將近，雲錦台貼出封箱的日子；班裡新請的琴師、鼓佬今日進班，老衣箱唐桂蘭也回來了。',
          '落了整夜的雪，後台燒起炭盆，樟木箱的味道混著松香味。',
          '街面上年貨攤擠得走不動；戲班牆裡斷斷續續傳出弦聲鼓點，路人聽著新鮮。',
          '封箱酒的席面訂下了，帳房開始合這一季的總帳。',
          '封箱日到了。過了今夜，戲箱上鎖到開春。',
      ]
    : [
          '年關前落了細雪，街面上人人縮著脖子趕年貨。',
          '雪停了，各家鋪子掃雪掛紅，年味一日濃過一日。',
          '茶館裡有人議論雲錦台的水牌，說春雪社要出新戲；也有人斷言排不成。',
          '城裡各家戲園年關檔期都貼出戲碼了，清一色熟口熟面的老戲。',
          '首演的日子到了，雲錦台外的水牌底下從一早就圍著人。',
      ];

/** SEASON SCENARIO — the group goal is calendar physics; the ambition itself
 *  is seeded at CANON level in one mind, not directed. */
const SEASON_NOTE: Record<string, string> = DEPARTURE
    ? {
          '金鳳': '【你近來壓在心口的事】巡捕房要清查會樂里的門牌了，限期就這幾日——你這掛頭牌紅歌女的體面，眼看要被一紙告示打成「待遷出的堂子」。南洋來的茶商托人捎了實信：肯出重金替你贖了這身份，帶你下南洋另起爐灶，只等你點頭。走，是一條乾淨的活路；留，得低頭去登記、認那個門牌。這些年你攢的體己，本就是為了有朝一日離開這一行。可真到了要走的關口，你才發覺這城裡有一個人，是你怎麼算計都繞不過去的。',
      }
    : UNBOXING
    ? {
          '唐桂蘭': '【你近來壓在心口的念頭】開春曬箱的吉日就在眼前。這是衣箱師傅躲不開的本分：全班的箱子都要開、都要曬——包括角落那一口。十五年了，開不開、怎麼開、當著誰的面開，這回你躲不掉要拿主意了。',
      }
    : BACKSTAGE
    ? {
          '沈雪笙': '【你近來壓在心口的念頭】首演撐過去了，可你比誰都清楚：全班連一把場面都沒有，行頭七零八落，分帳還是一筆糊塗帳。你新請了琴師裴硯樵、鼓佬杜三通，今日進班；老衣箱唐桂蘭也回來了。封箱之前，文武場要立起來、行頭要修造齊、班規分帳要立出新章程。這是裡子的仗，沒有觀眾。',
      }
    : {
          '沈雪笙': '【你近來壓在心口的念頭】班子重啟，老戲碼撐不起場面。你要排一齣誰也沒見過的新編全本大戲——本子還沒有，戲名也還沒有，可首演的水牌你已經叫人貼出去了，退路是沒有的。',
      };

type Msg = { role: 'user' | 'assistant'; content: string };
interface MindAct { 心裡: string; 做: string; 說?: string; 去?: string; 印?: string; 筆?: string; 贈?: string; 私?: string; 信?: string }
interface PlayScene { author: string; day: number; part: string; text: string }

/** Strip the acting-JSON shell when a free-voice reply comes back wrapped. */
function deshell(raw: string): string {
    let clean = raw.trim();
    const jsonish = clean.match(/\{[\s\S]*\}/);
    if (jsonish) {
        try {
            const o = JSON.parse(jsonish[0]) as Record<string, unknown>;
            const parts = Object.values(o).filter((v): v is string => typeof v === 'string' && v.length > 0);
            if (parts.length) clean = parts.join(' ');
        } catch {
            clean = clean.replace(/```json|```/g, '').trim();
        }
    }
    return clean;
}

async function llmChat(system: string, messages: Msg[], maxTokens: number): Promise<string> {
    const { text } = await import('@endless-story/llm');
    const client = text.createTextClient({ kind: 'primary' });
    const res = await client.chat({ model: client.defaultModel, system, messages, maxTokens, temperature: 0.85 });
    return res.text ?? '';
}

/** Occupation rhythm — generated from cast data, never hand-written per char. */
function dutyFact(occ: string, work: string, part: string, day: number): string {
    const finale = day === DAYS && (part === '黃昏' || part === '入夜');
    if (finale) return ''; // finale fact handled globally
    switch (occ) {
        case 'troupe':
            return part === '日午' || part === '晡時' ? `這個時辰班裡照例排戲吊嗓（${work}），你的營生在那裡。` : '';
        case 'geinu':
            return part === '入夜' ? `入夜是你唱堂會的時辰（${work}），你的營生在那裡。` : '';
        case 'banzhu':
            return part === '日午' || part === '晡時' || part === '黃昏'
                ? `這個時辰你照例在${work}坐鎮，看帳、盯排戲、審各人交上來的本子——這是班主的日課。`
                : '';
        case 'reporter':
            return part === '深宵' ? `深宵回報館趕稿（${work}），截稿是天。` : part === '清晨' ? '趕完稿天亮才睡下，晌午前起不來。' : '';
        case 'guest':
            return part === '晡時' ? `這個時辰你照例在${work}吃茶聽戲，城裡的體面人都認得你的座。` : '';
        case 'musician':
            return part === '日午' || part === '晡時' ? `這個時辰文武場照例在${work}吊弦合樂，你的營生在那裡。` : '';
        case 'wardrobe':
            return part === '日午' || part === '晡時' ? `這個時辰你照例在${work}漿洗縫補、點檢行頭——全班的家當都在你手裡。` : '';
        default:
            return '';
    }
}

/** One's own purse is knowable at a glance — an approximate FACT, not a verdict. */
function purseFeel(money: number): string {
    if (money <= 2) return '見了底';
    if (money <= 8) return '只剩幾塊錢';
    if (money <= 15) return '剩十來塊錢';
    if (money <= 25) return '剩二十來塊錢';
    if (money <= 45) return '剩三四十塊錢';
    return '還算寬裕';
}

/** Duty parts per occupation — being AT one's work during these = practice. */
function dutyParts(occ: string): string[] {
    switch (occ) {
        case 'troupe': return ['日午', '晡時'];
        case 'geinu': return ['入夜'];
        case 'musician': return ['日午', '晡時'];
        case 'wardrobe': return ['日午', '晡時'];
        default: return [];
    }
}

class Mind {
    readonly id: string;
    readonly name: string;
    readonly occ: string;
    readonly home: string;
    readonly work: string;
    readonly routine: string;
    system: string;
    transcript: Msg[] = [];
    venue: string;
    /** DOOR physics: locked at one's own home = outsiders bounce at the door. */
    doorLocked = false;
    // ── physics state (world truths; the mind only ever FEELS these) ──
    craft: number;
    craftBase: number;
    fatigue = 0.2;
    money: number;
    lastToldMoney = -1;
    daysSincePractice = 0;
    practicedToday = false;
    broodedToday = false;
    /** TRIGGERED RECALL: loaded relationship memories, consumed as they surface
     *  (recency = never repeated). Surface when the memory's subject is present
     *  (relevance) — the three-factor recall's PRINCIPLE without the embeddings. */
    recallMems: RecallMem[] = [];
    recalledToday = new Set<string>();
    lastRecalled = '';
    /** WORLD object ledger — keepsakes are mutable state, not persona text. */
    carried: string[];

    constructor(id: string, occ: string, home: string, work: string, money: number) {
        this.id = id;
        const c = CANON[id];
        this.name = c.name;
        this.occ = occ;
        this.home = home;
        this.work = work;
        this.venue = home;
        this.money = money;
        this.carried = (c.carried ?? []).map((k) => k.desc);
        const ability = abilityOf(id);
        this.craftBase = 0.35 + 0.25 * ability;
        this.craft = Math.min(1, this.craftBase + 0.2);
        this.routine =
            occ === 'troupe' ? `白日多在戲園排戲（${work}）` :
            occ === 'geinu' ? `入夜在${work}唱堂會、白日多在住處` :
            occ === 'banzhu' ? `白日在${work}坐鎮` :
            occ === 'reporter' ? `深宵在${work}趕稿、白日在街面採風` :
            occ === 'guest' ? `晡時常在${work}吃茶聽戲` :
            occ === 'musician' ? `白日在${work}吊弦合樂` :
            occ === 'wardrobe' ? `成日在${work}漿洗縫補、點檢行頭` : '起居隨意';
        const era = INTERLUDE ? INTERLUDE_PERSONA[id] : undefined;
        this.system = [
            `你是${c.name}，活在 1920 年代的上海。這不是扮演——你就是這個人，活在連續的時間裡。`,
            // a TIME-CUT is a real cut: the era note REPLACES the present-day
            // identity wholesale — the future must not exist in this context
            era ? era.note : `你是${c.name}（${c.role}）。【你是誰】${c.description}`,
            `【你心底的事（只有你自己知道）】${era ? era.secret : c.secret}`,
            era ? '' : `【你記得的過往】（這些是「發生過的事」，不是你的台詞。說起舊事時，用你此刻的話重新講——你記得的是那件事、那個滋味，不是這幾行字句。切莫照抄底下的原句。）\n${c.memories.map((m) => `・${m.text}`).join('\n')}${(EXTRA_MEM[id] ?? []).map((m) => `\n・${m.text}`).join('')}`,
            SEASON_NOTE[id] ?? '',
            `【這個世界】${WORLD_PREMISE}`,
            `地方：${VENUE_NAMES.join('、')}。`,
            INTERLUDE
                ? '【此時的世道】尋常年月，沒有大事。日子就是日子。'
                : DEPARTURE
                ? `【本季】巡捕房清查會樂里門牌，限期第${DAYS}日。過了那日，這條弄堂就要變天——留下的低頭登記，走的各奔前程。`
                : UNBOXING
                ? `【本季】出了正月，班裡告示：第3日開春吉日，啟箱曬行頭、祭祖師——全班的箱子都要見天光；第${DAYS}日夜，開春第一鑼。`
                : BACKSTAGE
                ? `【本季】雲錦台貼出封箱的日子：第${DAYS}日夜，封箱酒、立班規、合一堂全樂；過了那夜，戲箱上鎖到開春。`
                : `【本季】雲錦台外貼出了水牌：第${DAYS}日夜，春雪社新編大戲首演。滿城都在看春雪社這回拿什麼出來。`,
            '',
            '【你怎麼活】你會不斷收到「此刻的感知」。每次收到，回覆你此刻真實的反應，嚴格只輸出 JSON：',
            '{"心裡":"念頭(一兩句)","做":"你客觀做了什麼(一兩句,第三人稱)","說":"說出口的話(沒有就空)","去":"要動身去的地方(留原地就空)"}',
            INTERLUDE
                ? '規矩：話用人話說；你只知道親歷親聞的事；熱戀的人不省字——甜話、渾話、肉麻話，你們關起門來都說得出口。'
                : '規矩：話用人話說；「命/一輩子」是一生說一兩次的字；你只知道親歷親聞的事；',
            '你有自己的營生與功課，不是每個時辰都要找人；對人說話時「說」裡直接說。',
            '把隨身物件送出手時，多加一欄 "贈":"物件｜給誰"——東西離了手，就真的不在你身上了。',
            '要跟在場的某一個人咬耳朵，多加一欄 "私":"對誰｜要說的話"——只有那人聽得真，旁人只看見你們低語。',
            '要給不在跟前的人捎一封信，多加一欄 "信":"給誰｜信裡的話"——寫下就交了郵差，隔些時候才送到對方手上，話出了手收不回。',
            '在自己家裡要閉門謝客，就在「做」裡寫明閉門落閂——門閂上了，外人便進不來，叩門你聽得見。',
            occ === 'reporter'
                ? '你另有一支筆：若你決意把稿子付印，在 JSON 裡多加一欄 "印":"明日見報的那段文字（百來字）"。見了報，滿城都讀得到，收不回來。不印就不加這欄。'
                : '',
            occ === 'troupe' || occ === 'banzhu'
                ? '你也提得動筆：若你決意把這個時辰全花在寫戲上（編場次、念白、唱詞），在 JSON 裡多加一欄 "筆":"這一場你打算寫什麼"。世界會替你鋪紙磨墨。留神——只在「做」裡說你寫了本子，紙上是不會真有字的；要落筆，必須用 "筆" 這一欄。'
                : '',
        ]
            .filter(Boolean)
            .join('\n');
    }

    /** What the body/purse tell this mind — FACTS and graded feel, never
     *  verdicts: wording scales with the value instead of appearing at a
     *  behavior gate. The mind decides what any of it means. */
    felt(part: string): string[] {
        const lines: string[] = [];
        if (part === '清晨') {
            if (this.fatigue >= 1) lines.push('（身子是真的透支了，眼前發黑，今日非歇不可。）');
            else if (this.fatigue > 0.45) {
                const deg = this.fatigue > 0.8 ? '沉得像灌了鉛' : this.fatigue > 0.6 ? '乏得很' : '有些發乏';
                lines.push(`（連日下來，身上${deg}。）`);
            }
            if (dutyParts(this.occ).length && this.daysSincePractice >= 1) {
                const n = '一兩三四五六七'[Math.min(this.daysSincePractice, 7) - 1];
                lines.push(`（你已${n}日沒正經吊嗓練功${this.daysSincePractice >= 2 ? '，手上嗓上覺出鈍來' : ''}。）`);
            }
            if (this.money !== this.lastToldMoney || this.money <= 8) {
                lines.push(`（荷包裡${purseFeel(this.money)}。）`);
                this.lastToldMoney = this.money;
            }
            if (this.carried.length) lines.push(`（你隨身帶著：${this.carried.join('；')}。）`);
        } else if (this.fatigue >= 1) {
            lines.push('（身子撐不住了，做什麼都提不起力氣。）');
        }
        return lines;
    }

    private async maybeCompress(): Promise<void> {
        const size = this.transcript.reduce((s, m) => s + m.content.length, 0);
        if (size < MEMOIR_AT) return;
        const cut = Math.floor(this.transcript.length / 2);
        const early = this.transcript.slice(0, cut);
        const memoirPrompt: Msg[] = [
            ...early,
            { role: 'user', content: '（把以上這段日子，用你自己的話濃縮成一段回憶——留下真正刻進心裡的事、人、話。三五句。）' },
        ];
        const memoir = (await llmChat(this.system, memoirPrompt, 400)).trim();
        this.transcript = [
            { role: 'user', content: `（此前的日子，你自己記得的）${memoir}` },
            { role: 'assistant', content: '（都在心裡。）' },
            ...this.transcript.slice(cut),
        ];
    }

    async act(percept: string): Promise<MindAct> {
        await this.maybeCompress();
        this.transcript.push({ role: 'user', content: percept });
        // 700 tokens: a four-season resumed mind (柳生春) has a huge context and
        // writes long — 500 truncated her JSON mid-object, breaking the parse.
        const raw = await llmChat(this.system, this.transcript, 700);
        this.transcript.push({ role: 'assistant', content: raw });
        // robust parse: strips ```json fences, extracts the first balanced
        // object, recovers per-field on broken JSON — never dumps raw into 做.
        const o = parseMindAct(raw);
        return {
            心裡: o.心裡,
            做: o.做,
            說: o.說 || undefined,
            去: o.去 || undefined,
            印: o.印 || undefined,
            筆: o.筆 || undefined,
            贈: o.贈 || undefined,
            私: o.私 || undefined,
            信: o.信 || undefined,
        };
    }

    /** A free-voice self-exchange: the reply lives clean in the transcript. */
    private async selfTalk(prompt: string, maxTokens: number): Promise<string> {
        this.transcript.push({ role: 'user', content: prompt });
        const clean = deshell(await llmChat(this.system, this.transcript, maxTokens));
        this.transcript.push({ role: 'assistant', content: clean });
        return clean;
    }

    async reflect(day: number): Promise<string> {
        return this.selfTalk(
            `（夜深了，第${day}日過完。這一天在你心裡留下什麼？只對自己說，說人話——這裡不用那個 JSON 格式，直接把心裡話寫出來就好。）`,
            650,
        );
    }

    /** SOLITUDE beat: a mind alone in a quiet hour (at home, or behind a
     *  bolted door) turns something over — not a reaction to this instant like
     *  the 心裡 field, but a real brood. Distinct from the nightly reflect():
     *  this happens IN the day, in the middle of a life, when no one is watching. */
    async brood(part: string): Promise<string> {
        return this.selfTalk(
            `（${part}，屋裡就你一個人，靜下來了。這會兒沒人瞧著，心裡頭最放不下的那樁事，自個兒對自個兒說說吧——不用 JSON，說人話。）`,
            450,
        );
    }

    /** PROSPECTIVE slot, nightly: the mind gives ITSELF tomorrow's marching
     *  orders. Waking, this is the last thing in its memory — no re-briefing,
     *  the transcript adjacency does the work. */
    async plan(): Promise<string> {
        return this.selfTalk(
            '（那明日呢？天亮之後你打算怎麼辦——有什麼非做不可、非見不可、非說不可的？又有什麼要離遠些的？給自己拿個主意，一兩句，不用 JSON。）',
            350,
        );
    }

    /** PROSPECTIVE slot, once at season start: the mind names what it is
     *  playing FOR — a self-authored long-term want, in its own words. */
    async aspire(): Promise<string> {
        return this.selfTalk(
            '（開季頭一夜，萬籟俱寂。往後這些日子，你心裡到底圖個什麼？有什麼帳非了不可、什麼事非成不可、什麼人繞不過去？只對自己說真話，三五句，不用 JSON。）',
            350,
        );
    }

    /** SCRIPT LOCK: the banzhu's trade duty on premiere eve — read the whole
     *  stack, settle title/scene order, POLISH role names (a roman à clef in a
     *  town with a reporter is a hazard), and cast every member. */
    async finalize(sceneList: string): Promise<string> {
        return this.selfTalk(
            `（首演在明晚，這是班主的本分：定本。你把整疊戲本鋪開通讀，現有場次——\n${sceneList}\n寫一張定本單：戲名定一個；場次取捨與先後；戲中人物名字全數潤飾過，別叫看客一眼對上班裡真人，這是要見報的東西；派角——誰演哪個，文場武場都得有著落，全班都得有戲。不用 JSON，直接寫定本單。）`,
            900,
        );
    }

    /** DISTILL (interlude only): years later, the mind looks back and names
     *  what stuck — each line becomes canon-grade recall for future seasons. */
    /** SELF-COMPRESSION. Keeps the WHY, not just the image: a probe (2026-07-15)
     *  showed distilled memories recorded the event and the picture (「那個笑盈盈
     *  的眼神」) but never the motive, so every later recall had to manufacture a
     *  fresh reason — and two recalls of one memory could invent contradicting
     *  ones. Events are what happened; a mind also keeps why it did it. */
    async distill(): Promise<string[]> {
        const raw = await this.selfTalk(
            '（多年以後，你回望這段日子。把真正刻進心裡的，寫成四到六條記憶——一條一行。' +
                '每條都要有一件具體的事（或一句具體的話、一個具體的物件），' +
                '**並且要帶著你當時為什麼那麼做、當時心裡是什麼滋味**——事跟緣由寫在同一條裡，別只留畫面。' +
                '說人話，不用 JSON，不加編號以外的裝飾。）',
            700,
        );
        return raw
            .split('\n')
            .map((l) => l.replace(/^[\d一二三四五六七八九十、.．\s・-]+/, '').trim())
            .filter((l) => l.length > 8);
    }

    /** AUTHORING: the world lays out paper and ink — a focused session where
     *  this mind actually WRITES the thing it set out to write. The artifact
     *  is the mind's own words, produced with real craft discipline. */
    async compose(intent: string): Promise<string> {
        return this.selfTalk(
            `（你鋪開紙，磨了墨，這一個時辰靜下來只做一件事：${intent}。正經把它寫出來——場目、誰上場（行當）、念白、唱詞（註明板式或曲牌），要能直接拿去排的本子。若這是頭一場，先題上戲名《…》。不用 JSON，直接寫。）`,
            1600,
        );
    }

    hear(note: string): void {
        this.transcript.push({ role: 'user', content: note });
        this.transcript.push({ role: 'assistant', content: '（看在眼裡，記在心裡。）' });
    }

    save(): void {
        fs.writeFileSync(path.join(OUT, `mind-${this.id}.json`), JSON.stringify(this.transcript, null, 1));
    }
}

const history: string[] = [];
const log = (s: string): void => {
    history.push(s);
    console.log(s);
};

async function main(): Promise<void> {
    const specs = buildCast(CAST);
    const minds = specs.map((c) =>
        new Mind(c.id, c.occupation, INTERLUDE ? INTERLUDE_HOME[c.id] ?? c.homeVenue : c.homeVenue, c.workVenue, c.money),
    );

    // SEASON CONTINUITY: minds are persistent — given an archive, they wake
    // up with last season's life verbatim. New cast members simply have no
    // transcript yet; that asymmetry IS the newcomer experience.
    const resumeDir = process.env.MW_RESUME_DIR;
    if (resumeDir) {
        const physPath = path.join(resumeDir, 'physics.json');
        const phys = fs.existsSync(physPath)
            ? (JSON.parse(fs.readFileSync(physPath, 'utf-8')) as Array<{ name: string; craft: number | null; fatigue: number; money: number; carried?: string[] }>)
            : [];
        const carriedPath = path.join(resumeDir, 'carried-state.json');
        const carriedState = fs.existsSync(carriedPath)
            ? (JSON.parse(fs.readFileSync(carriedPath, 'utf-8')) as Record<string, string[]>)
            : null;
        for (const m of minds) {
            const t = path.join(resumeDir, `mind-${m.id}.json`);
            if (fs.existsSync(t)) {
                m.transcript = JSON.parse(fs.readFileSync(t, 'utf-8')) as Msg[];
                log(`〔續命〕${m.name} 帶著前一季的日子醒來（${m.transcript.length} 段親歷）。`);
            }
            const p = phys.find((x) => x.name === m.name);
            if (p) {
                if (typeof p.craft === 'number') m.craft = p.craft;
                m.money = p.money;
                if (p.carried) m.carried = p.carried;
            }
            if (carriedState?.[m.name]) m.carried = carriedState[m.name];
        }
    }

    // Whereabouts intel is standing knowledge (small town) — it lives in the
    // SYSTEM once, not in every percept.
    for (const m of minds)
        m.system += `\n【你曉得旁人的日子】${minds.filter((o) => o !== m).map((o) => `${o.name}${o.routine}`).join('；')}。`;

    // TRIGGERED RECALL setup: loaded relationship memories (好年頭 etc.) stay in
    // the system as background knowledge, but ALSO seed a recall pool that
    // FOREGROUNDS a specific memory when its subject is co-present — the
    // perceive→recall step the parting was missing (loaded past sat inert as
    // wallpaper). Partners = the minds who share a loaded memory source.
    const remembererIds = minds.filter((m) => (EXTRA_MEM[m.id] ?? []).length).map((m) => m.id);
    const partnerOf = new Map<string, Set<string>>();
    for (const m of minds) {
        m.recallMems = (EXTRA_MEM[m.id] ?? []).slice();
        partnerOf.set(m.id, new Set(remembererIds.filter((o) => o !== m.id)));
    }

    /** The reporter's filed copy, if any — printed at next dawn. */
    let pendingPaper: { by: string; text: string } | null = null;

    /** Letters in the postman's bag — written this tick, delivered the next. */
    let mailbag: Array<{ from: string; to: Mind; content: string }> = [];

    /** THE PLAY — a world object. Minds write it; the world only stores and
     *  shows it (scoped: you read it where it physically lies, at the theatre). */
    const playbook: { title: string | null; scenes: PlayScene[]; finalNote: string | null } = {
        title: null,
        scenes: [],
        finalNote: null,
    };

    // Season eve: each mind names what it is playing for (self-authored want).
    log(`── 開季前夜（各自的圖謀） ──`);
    for (const m of minds) {
        const a = await m.aspire();
        log(`  〔${m.name} 圖謀〕${a.slice(0, 200)}`);
        m.save();
    }

    for (let day = 1; day <= DAYS; day++) {
        const texture = TEXTURE[(day - 1) % TEXTURE.length];
        for (const part of PARTS) {
            if (part === '深宵') break;
            log(`\n── 第${day}日·${part} ──`);

            // dawn: the paper hits the streets (print physics — a broadcast)
            let paperLine = '';
            if (part === '清晨' && pendingPaper) {
                paperLine = `今晨《申報》小報欄印著一段：「${pendingPaper.text}」滿城茶館都在傳看。`;
                log(`  〔小報〕${pendingPaper.by} 昨夜付印的稿子見報了：「${pendingPaper.text.slice(0, 60)}…」`);
                pendingPaper = null;
            }

            // postman round: letters written last tick reach their reader now,
            // wherever that reader happens to be (crosses distance — unlike a
            // whisper — and cannot be unsaid).
            if (mailbag.length) {
                for (const { from, to, content } of mailbag) {
                    to.hear(`（郵差送來一封信，是${from}的字：「${content}」）`);
                    log(`  〔捎信〕${from} → ${to.name}：「${content.slice(0, 40)}…」`);
                }
                mailbag = [];
            }

            const finaleFact =
                day === DAYS && (part === '黃昏' || part === '入夜')
                    ? INTERLUDE
                        ? ''
                        : DEPARTURE
                        ? `今夜是清查限期的最後一夜——會樂里過了今夜就要變天。走的、留的、要說的話、要交代的人，都只剩這一夜了。`
                        : UNBOXING
                        ? `今夜開春第一鑼——封了一冬的戲台重新開鑼，滿城的人都來聽這聲響。${
                              part === '入夜' ? '這一個時辰就是開鑼正場。' : ''
                          }`
                        : BACKSTAGE
                        ? `今夜封箱：全班在雲錦台吃封箱酒、立班規、合一堂全樂——過了今夜，戲箱上鎖到開春。${
                              part === '入夜' ? '這一個時辰就是封箱酒與合樂的正場。' : ''
                          }`
                        : `今夜${playbook.title ? `《${playbook.title}》` : '春雪社新戲'}首演，雲錦台開鑼——水牌貼了這些天，滿城的人都往那兒去。${
                              part === '入夜' ? '這一個時辰就是正戲：照著本子與定本，一場一場真演下去。' : ''
                          }`
                    : '';

            // group by venue for multi-party exchanges
            const atVenue = new Map<string, Mind[]>();
            for (const m of minds) atVenue.set(m.venue, [...(atVenue.get(m.venue) ?? []), m]);

            const moved: Array<Move & { mind: Mind }> = [];
            const recordMove = (m: Mind, from: string, to: string): void => {
                moved.push({ mind: m, name: m.name, fromCluster: clusterOf(from), toCluster: clusterOf(to), to });
            };
            const takePrint = (m: Mind, act: MindAct): void => {
                if (act.印 && m.occ === 'reporter') {
                    pendingPaper = { by: m.name, text: act.印.slice(0, 220) };
                    log(`  〔付印〕${m.name} 把稿子交了下去，明晨見報。`);
                }
            };
            const takeLetter = (m: Mind, act: MindAct): void => {
                if (!act.信) return;
                const l = parseLetter(act.信, minds.filter((o) => o !== m).map((o) => o.name));
                if (!l) return;
                const to = minds.find((o) => o.name === l.toName)!;
                mailbag.push({ from: m.name, to, content: l.content.slice(0, 300) });
                log(`  〔寄信〕${m.name} 給 ${to.name} 寫了封信，交了郵差。`);
            };
            const takePen = async (m: Mind, act: MindAct): Promise<void> => {
                if (m.occ !== 'troupe' && m.occ !== 'banzhu') return;
                // narrated writing IS writing intent — 做 is the mind's action
                // declaration, same as 去 is for movement. When the narration
                // says the pen moved, the world lays paper and real ink flows.
                const narrated =
                    !act.筆 &&
                    /寫|落筆|提筆|蘸墨|批註|改本|填詞/.test(act.做) &&
                    /本子|戲本|新戲|唱詞|唱段|念白|一場|場子/.test(act.做 + (act.說 ?? ''));
                const intent = act.筆 ?? (narrated ? `把你方才動筆要寫的那一段真正寫完（${act.做}）` : null);
                if (!intent) return;
                const text = await m.compose(intent);
                if (!playbook.title) {
                    const t = text.match(/《(.+?)》/);
                    if (t) playbook.title = t[1];
                }
                playbook.scenes.push({ author: m.name, day, part, text });
                log(`  〔戲本〕${m.name} 寫下一場（累計 ${playbook.scenes.length} 場）：${text.replace(/\s+/g, ' ').slice(0, 80)}…`);
            };
            // GIFT physics: an object that leaves your hand is truly gone.
            // Explicit 贈 field first; narrated giving of a carried keepsake
            // (same principle as narrated writing) is parsed as intent.
            const takeGift = (m: Mind, act: MindAct, group: Mind[]): void => {
                const otherNames = minds.filter((o) => o !== m).map((o) => o.name);
                let itemIdx = -1;
                let receiver: Mind | undefined;
                if (act.贈) {
                    const g = parseGiftField(act.贈, m.carried, otherNames);
                    if (!g) return;
                    itemIdx = g.itemIdx;
                    receiver = minds.find((o) => o.name === g.receiverName);
                    if (itemIdx < 0 && receiver) {
                        // giving something not in the ledger: it comes into being in the receiver's hands
                        receiver.carried.push(g.itemName);
                        log(`  〔贈物〕${m.name} 把「${g.itemName}」給了 ${receiver.name}。`);
                        receiver.hear(`（${m.name}把「${g.itemName}」交到了你手上。）`);
                        return;
                    }
                } else {
                    const g = parseGiftNarration(act.做 + (act.說 ?? ''), m.carried, otherNames);
                    if (!g) return;
                    itemIdx = g.itemIdx;
                    receiver = minds.find((o) => o.name === g.receiverName) ??
                        (group.length === 2 ? group.find((o) => o !== m) : undefined);
                }
                if (itemIdx < 0 || !receiver) return;
                const [item] = m.carried.splice(itemIdx, 1);
                receiver.carried.push(item);
                log(`  〔贈物〕${m.name} 把「${item.slice(0, 24)}」給了 ${receiver.name}。`);
                receiver.hear(`（${m.name}把那件東西——${item}——交到了你手上，如今在你身上了。）`);
                m.hear(`（那件東西離了你的手，如今在${receiver.name}那裡了。）`);
            };
            // WHISPER physics: content reaches ONE ear; the act of whispering
            // is public. Returns a public note for the scene carry, if any.
            const takeWhisper = (m: Mind, act: MindAct, group: Mind[]): string => {
                if (!act.私) return '';
                const w = parseWhisper(act.私, group.filter((o) => o !== m).map((o) => o.name));
                if (!w) return '';
                const target = group.find((o) => o.name === w.targetName);
                if (!target) return '';
                target.hear(`（${m.name}湊到你耳邊，壓低了聲：「${w.content}」）`);
                log(`  〔私語〕${m.name} → ${target.name}：「${w.content}」`);
                return `（並湊到${target.name}耳邊低語了幾句，旁人聽不真。）`;
            };
            // DOOR physics: bolting your own door is an act; the world parses it.
            const takeDoor = (m: Mind, act: MindAct): void => {
                if (m.venue !== m.home) return;
                const intent = parseDoorIntent(act.做);
                if (intent === 'lock' && !m.doorLocked) {
                    m.doorLocked = true;
                    log(`  〔門戶〕${m.name} 閉門落閂。`);
                } else if (intent === 'unlock') {
                    m.doorLocked = false;
                }
            };
            for (const [venue, group] of atVenue) {
                if (group.length > 1) log(`  〔${venue}〕${group.map((m) => m.name).join('、')}同在。`);
                const nearby = (m: Mind): string => {
                    const sameCluster = minds.filter((o) => o !== m && o.venue !== m.venue && clusterOf(o.venue) === clusterOf(m.venue));
                    return sameCluster.length ? `你聽得見那頭的動靜——${sameCluster.map((o) => `${o.name}在${o.venue}`).join('、')}。` : '';
                };
                const present = (m: Mind): string => {
                    const here = group.filter((o) => o !== m);
                    return here.length ? `${here.map((o) => o.name).join('、')}也在這裡。` : '';
                };
                // the playbook is a physical object at the theatre: you can
                // only read where it lies (scoped perception, not knowledge)
                const playFact = (m: Mind): string => {
                    if (m.venue !== '雲錦台戲台' && m.venue !== '後台妝閣') return '';
                    if (!playbook.scenes.length)
                        return m.occ === 'troupe' || m.occ === 'banzhu'
                            ? '（案上擺著新戲的空本子——到這一刻，紙上還沒有落下一個字。水牌上的日子不等人。）'
                            : '';
                    const last = playbook.scenes[playbook.scenes.length - 1];
                    const lock = playbook.finalNote ? `（班主的定本單壓在戲本上：「${playbook.finalNote.replace(/\s+/g, ' ').slice(0, 260)}…」）` : '';
                    return `（案上的戲本：${playbook.title ? `《${playbook.title}》` : '新戲'}已成${playbook.scenes.length}場。最新一場是${last.author}的筆——「${last.text.replace(/\s+/g, ' ').slice(0, 300)}…」）${lock}`;
                };
                const worldEvent = (m: Mind): string => {
                    const ev = WORLD_EVENTS.find(
                        (e) => e.day === day && e.part === part && (e.name ? e.name === m.name : e.occ === m.occ),
                    );
                    if (!ev) return '';
                    if (!deliveredEvents.has(ev)) {
                        deliveredEvents.add(ev);
                        log(`  〔世事〕${m.name} ← ${ev.fact.slice(0, 40)}…`);
                    }
                    return `（${ev.fact}）`;
                };
                // AROUSAL / scene charge: how emotionally high-stakes THIS moment
                // is. Ordinary hours are low; a finale, a season's last days, or
                // charged content (goodbye words, tears, kneeling, leaving) run
                // high. From world signals + scene content — no mind-reading.
                const sceneCharge = (feedText: string): number => {
                    let c = 0.12;
                    if (day === DAYS) c += 0.35; // the decisive day
                    if (finaleFact) c += 0.2; // the finale window itself
                    if (DEPARTURE && day >= DAYS - 1) c += 0.2; // parting imminent
                    if (/訣別|一路順風|送行|南洋|最後一|走了|別了|再沒回頭|上船|跪|淚|燒香|保重/.test(feedText)) c += 0.3;
                    return Math.min(1, c);
                };
                // TRIGGERED RECALL — the faithful model, GATED BY AROUSAL: you
                // don't dwell on the past at an ordinary breakfast; it floods back
                // deep only when the moment is charged (生離死別). IMPORTANCE picks
                // WHICH surfaces; AGE (resisted by importance) sets fidelity; scene
                // charge decides WHETHER it surfaces and HOW DEEP.
                const nostalgia = (m: Mind, charge: number): string => {
                    if (charge < 0.4 || !m.recallMems.length) return '';
                    const other = group.find(
                        (o) => o !== m && partnerOf.get(m.id)?.has(o.id) && !m.recalledToday.has(o.id),
                    );
                    if (!other) return '';
                    const pool = m.recallMems.filter((r) => r.importance >= 0.3 && r.text !== m.lastRecalled);
                    if (!pool.length) return '';
                    const mem = pool.reduce((a, b) => (b.importance > a.importance ? b : a));
                    m.recalledToday.add(other.id);
                    m.lastRecalled = mem.text;
                    const deep = charge >= 0.7;
                    log(`  〔憶起${deep ? '·深' : ''}〕${m.name}（見${other.name}，張力${charge.toFixed(2)}）：${mem.text.slice(0, 26)}…`);
                    const body = `（這一刻你的眼睛落在${other.name}身上，一樁舊年的事翻上心頭——${ageFrame(mem.text, mem.ageYears, mem.importance)}。這是那件事的意思，不是要你背這句話：真說起來，用你此刻的話。）`;
                    return deep ? `${body}（這念頭一起，你心裡那些年一下子全回來了，眼眶發熱，一時竟挪不開。）` : body;
                };
                const percept = (m: Mind, extra?: string): string =>
                    [
                        `【第${day}日·${part}】你在${m.venue}。`,
                        part === '清晨' ? `（${texture}）` : '',
                        worldEvent(m),
                        paperLine,
                        present(m),
                        nearby(m),
                        nostalgia(m, sceneCharge(finaleFact)),
                        // body veto is physics: a collapsed body has no duty
                        m.fatigue >= 1 ? '' : dutyFact(m.occ, m.work, part, day),
                        finaleFact,
                        playFact(m),
                        ...m.felt(part),
                        extra ?? '',
                        '此刻你？',
                    ]
                        .filter(Boolean)
                        .join(' ');

                // attempt a move; returns true if the mind actually left.
                const tryMove = (m: Mind, act: MindAct): 'moved' | 'bounced' | null => {
                    if (!act.去 || !VENUE_NAMES.includes(act.去) || act.去 === m.venue) return null;
                    const lockedOwner = minds.find((o) => o !== m && o.home === act.去 && o.venue === act.去 && o.doorLocked);
                    if (lockedOwner) {
                        m.hear(`（你到了${act.去}門外叩門，門閂著，半天沒人應。）`);
                        lockedOwner.hear(`（有人在門外叩門——聽腳步嗓音，像是${m.name}。你沒應。）`);
                        log(`  〔門戶〕${m.name} 叩${act.去}的門，無人應。`);
                        return 'bounced';
                    }
                    if (m.doorLocked) m.doorLocked = false;
                    recordMove(m, m.venue, act.去);
                    m.venue = act.去;
                    return 'moved';
                };

                if (group.length === 1) {
                    const m = group[0];
                    const act = await m.act(percept(m));
                    log(`  ${m.name} @ ${m.venue}｜${act.做}${act.說 ? `「${act.說}」` : ''}`);
                    takePrint(m, act);
                    await takePen(m, act);
                    takeGift(m, act, group);
                    takeLetter(m, act);
                    takeDoor(m, act);
                    const stayed = tryMove(m, act) !== 'moved';
                    if (!stayed) log(`  → ${m.name} 動身去了 ${act.去}`);
                    // SOLITUDE brood: alone at a venue (this branch already means
                    // no one else here), staying put, in a quiet hour — a mind by
                    // itself turns something over. Once a day. A bolted door makes
                    // it certain; being alone anywhere quiet is enough.
                    else if (!m.broodedToday && (part === '晡時' || part === '入夜' || m.doorLocked)) {
                        m.broodedToday = true;
                        const b = await m.brood(part);
                        log(`  〔獨處〕${m.name}：${b.replace(/\s+/g, ' ').slice(0, 120)}`);
                    }
                } else {
                    // multi-party exchange over a SCENE FEED: every participant
                    // hears EVERYTHING since their own last turn (the single-slot
                    // carry once made a direct question inaudible two seats away).
                    // The hour bounds the scene (max 4 rounds); a full round of
                    // silence dissolves it; someone leaving no longer freezes the
                    // rest — the scene continues without them.
                    const feed = new SceneFeed();
                    const departed = new Set<Mind>();
                    for (let round = 0; round < 4; round++) {
                        let anySpoke = false;
                        for (const m of group) {
                            if (departed.has(m)) continue;
                            if (group.length - departed.size < 2) break;
                            const delta = feed.unseen(m.name);
                            // recall can fire for ANY participant seeing their
                            // subject, not just the scene's opener (percept only
                            // runs on turn 0); percept's own nostalgia is guarded
                            // against double-firing by recalledToday.
                            const recallNote = round === 0 && !delta ? '' : nostalgia(m, sceneCharge(finaleFact + ' ' + delta));
                            const base = round === 0 && !delta ? percept(m) : `${delta || '（各人做著各自的事。）'} 此刻你？`;
                            const act = await m.act(recallNote ? `${recallNote} ${base}` : base);
                            log(`  ${m.name}｜${act.做}${act.說 ? `「${act.說}」` : ''}`);
                            takePrint(m, act);
                            await takePen(m, act);
                            takeGift(m, act, group);
                            takeLetter(m, act);
                            takeDoor(m, act);
                            const whisperNote = takeWhisper(m, act, group.filter((o) => !departed.has(o)));
                            if (act.說 || act.私) anySpoke = true;
                            feed.push(m.name, `${m.name}${act.說 ? `說：「${act.說}」` : ''}（${act.做}）${whisperNote}`);
                            const mv = tryMove(m, act);
                            if (mv === 'moved') {
                                log(`  → ${m.name} 起身去了 ${act.去}`);
                                feed.push(m.name, `（${m.name}起身走了，往${act.去}去。）`);
                                feed.markDeparted(m.name);
                                departed.add(m);
                            }
                        }
                        if (!anySpoke && round > 0) break;
                        if (group.length - departed.size < 2) break;
                    }
                    // scene-end flush: whatever anyone witnessed but was never
                    // prompted with still lands in their lived transcript.
                    for (const m of group) {
                        const rest = feed.flush(m.name);
                        if (rest) m.hear(`（這一場裡你還瞧見聽見：${rest}）`);
                    }
                }
            }
            // street sightings: same-hour movers glimpse each other only when
            // their routes plausibly CROSS (shared cluster) and they are not
            // simply converging on the same doorway.
            for (const [a, b] of sightingPairs(moved)) {
                const am = (a as Move & { mind: Mind }).mind;
                const bm = (b as Move & { mind: Mind }).mind;
                am.hear(`（路上你遠遠瞧見${b.name}也在街面上，往${b.to}那頭去了。）`);
                bm.hear(`（路上你遠遠瞧見${a.name}也在街面上，往${a.to}那頭去了。）`);
                log(`  〔街面〕${a.name} 與 ${b.name} 錯身而過，彼此瞧見了。`);
            }
            // ── physics tick: fatigue accrues; duty presence = practice ──
            for (const m of minds) {
                m.fatigue = Math.min(1.2, m.fatigue + (m.venue === m.home ? 0.02 : 0.06));
                if (dutyParts(m.occ).includes(part) && m.venue === m.work) m.practicedToday = true;
            }

            // finale box office. The house's SOUND is an objective scene fact
            // heard only by those in the building; pay lands silently in the
            // ledger (the purse tells them come morning). No pre-worded
            // feelings, no town-wide broadcast.
            if (BACKSTAGE && day === DAYS && part === '入夜') {
                // 封箱合樂 — no audience: the ensemble hears its own tightness
                const inHouse = minds.filter((m) => m.venue === '雲錦台戲台');
                const players = inHouse.filter((m) => m.occ === 'troupe' || m.occ === 'musician');
                if (players.length) {
                    const grade = players.reduce((s, m) => s + m.craft, 0) / players.length;
                    const sound =
                        grade > 0.85 ? '弦鼓與唱做咬得嚴絲合縫，滿堂自己人都聽出來了：這班子成了' :
                        grade > 0.7 ? '大體齊整，只幾處氣口還毛著邊' : '弦是弦、鼓是鼓，各唱各的，離「一班」還遠';
                    log(`  〔合樂〕封箱合樂品相 ${grade.toFixed(2)}（${players.length} 人上場）——${sound}。`);
                    for (const m of inHouse) m.hear(`（今夜合樂，滿堂自己人：${sound}。）`);
                }
            }
            if (!BACKSTAGE && !INTERLUDE && !DEPARTURE && day === DAYS && part === '入夜') {
                const inHouse = minds.filter((m) => m.venue === '雲錦台戲台');
                const onStage = inHouse.filter((m) => m.occ === 'troupe' && m.venue === m.work);
                if (onStage.length) {
                    const lead = onStage.reduce((a, b) => (a.craft >= b.craft ? a : b));
                    // an unfinished play collapses on its opening night — physics.
                    // A repertoire night (第一鑼) plays the existing book instead.
                    const completeness = SEASON === 'premiere' ? Math.min(1, playbook.scenes.length / 3) : 1;
                    const grade = (0.4 + 0.6 * lead.craft) * (0.55 + 0.45 * completeness);
                    const house =
                        grade > 0.9 ? '滿場彩聲，加了三回簾' :
                        grade > 0.75 ? '彩聲不斷' : '前排有人嗑瓜子聊開了，彩聲稀稀落落';
                    log(`  〔票房〕${UNBOXING ? '第一鑼' : '首演'}品相 ${grade.toFixed(2)}（領銜 ${lead.name}）——${house}。`);
                    for (const m of inHouse) m.hear(`（今夜場內：${house}。）`);
                    for (const m of onStage) m.money += 8;
                    for (const m of inHouse) if (m.occ === 'geinu') m.money += 6;
                    const banzhu = minds.find((m) => m.occ === 'banzhu');
                    if (banzhu) banzhu.money += 12;
                }
            }
            for (const m of minds) m.save();
        }
        log(`\n── 第${day}日·深宵（各自的心） ──`);
        for (const m of minds) {
            const r = await m.reflect(day);
            log(`  〔${m.name} 夜語〕${r.replace(/\s+/g, ' ')}`);
            if (day < DAYS) {
                const p = await m.plan();
                log(`  〔${m.name} 盤算〕${p.replace(/\s+/g, ' ')}`);
            }
            // ── physics: sleep repays the body; the day's craft settles ──
            m.fatigue = Math.max(0, m.fatigue - (m.occ === 'reporter' ? 0.15 : 0.45));
            if (m.occ === 'reporter') m.fatigue = Math.max(0, m.fatigue - 0.35); // sleeps past dawn
            if (dutyParts(m.occ).length) {
                if (m.practicedToday) {
                    // asymptotic gains — mastery approaches 1 but never caps flat
                    m.craft = m.craft + 0.03 * (1 - m.craft);
                    m.daysSincePractice = 0;
                } else {
                    m.daysSincePractice += 1;
                    m.craft = m.craftBase + (m.craft - m.craftBase) * 0.97;
                }
                m.practicedToday = false;
            }
            m.broodedToday = false;
            m.recalledToday.clear();
            m.save();
        }
        // premiere eve: the banzhu locks the script (trade duty, not direction)
        if (day === DAYS - 1 && playbook.scenes.length) {
            const banzhu = minds.find((m) => m.occ === 'banzhu');
            if (banzhu) {
                const list = playbook.scenes
                    .map((s, i) => `${i + 1}. ${s.author} 筆：${s.text.replace(/\s+/g, ' ').slice(0, 60)}`)
                    .join('\n');
                playbook.finalNote = await banzhu.finalize(list);
                log(`  〔定本〕${banzhu.name} 連夜定本：${playbook.finalNote.replace(/\s+/g, ' ').slice(0, 180)}…`);
                banzhu.save();
            }
        }
    }
    // interlude epilogue: each mind distils the days into future-canon recall.
    // IMPORTANCE is fixed HERE, at encode — by the order the mind lists them
    // (what stuck most, first); ageYears starts at 0 and grows each season.
    if (INTERLUDE) {
        const extra: Record<string, RecallMem[]> = {};
        for (const m of minds) {
            const lines = await m.distill();
            extra[m.id] = lines.map((text, i) => ({ text, importance: distilledImportance(i), ageYears: 0 }));
            log(`\n〔憶〕${m.name} 刻進心裡的：`);
            for (const r of extra[m.id]) log(`  ・[重${r.importance.toFixed(2)}] ${r.text}`);
            m.save();
        }
        fs.writeFileSync(path.join(OUT, 'memories-extra.json'), JSON.stringify(extra, null, 1));
    }

    fs.writeFileSync(path.join(OUT, 'history.md'), history.join('\n'));
    fs.writeFileSync(
        path.join(OUT, 'physics.json'),
        JSON.stringify(
            minds.map((m) => ({
                name: m.name,
                // craft is a PERFORMER's ledger; occupations without a practice
                // economy do not get judged by a meter that never moves for them
                craft: dutyParts(m.occ).length ? m.craft : null,
                fatigue: m.fatigue,
                money: m.money,
                carried: m.carried,
            })),
            null,
            1,
        ),
    );
    if (playbook.scenes.length) {
        fs.writeFileSync(
            path.join(OUT, 'playbook.md'),
            [
                `# ${playbook.title ? `《${playbook.title}》` : '（未題名新戲）'}`,
                '',
                ...(playbook.finalNote ? [`## 班主定本單\n\n${playbook.finalNote}\n`] : []),
                ...playbook.scenes.map((s) => `## 第${s.day}日·${s.part}｜${s.author} 筆\n\n${s.text}\n`),
            ].join('\n'),
        );
    }
    console.log(`\n✅ MIND WORLD COMPLETE — ${minds.length} 顆心 × ${DAYS} 日；正史: ${path.join(OUT, 'history.md')}；戲本 ${playbook.scenes.length} 場`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
