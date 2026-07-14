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

const OUT = path.resolve(process.argv[2] ?? 'experiments/mind-world/out');
fs.mkdirSync(OUT, { recursive: true });
const DAYS = Number(process.env.MW_DAYS ?? 3);
const CAST = (process.env.MW_CAST ?? '柳生春,金鳳,蘇映雪,沈雪笙,方競西').split(',').map((s) => s.trim());
const PARTS = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'] as const;
const VENUE_NAMES = VENUES.map((v) => v.name);
/** transcript char budget before self-compression. */
const MEMOIR_AT = 24000;

/** 世相 — the town's day, cycled if the run outlives the table. */
const TEXTURE = [
    '年關前落了細雪，街面上人人縮著脖子趕年貨。',
    '雪停了，各家鋪子掃雪掛紅，年味一日濃過一日。',
    '茶館裡有人議論雲錦台的水牌，說春雪社要出新戲；也有人斷言排不成。',
    '城裡各家戲園年關檔期都貼出戲碼了，清一色熟口熟面的老戲。',
    '首演的日子到了，雲錦台外的水牌底下從一早就圍著人。',
];

/** SEASON SCENARIO — an original full-length play, not a gala restaging.
 *  The premiere date on the theatre's board is world physics (calendar);
 *  the ambition itself is seeded at CANON level in one mind, not directed. */
const SEASON_NOTE: Record<string, string> = {
    '沈雪笙': '【你近來壓在心口的念頭】班子重啟，老戲碼撐不起場面。你要排一齣誰也沒見過的新編全本大戲——本子還沒有，戲名也還沒有，可首演的水牌你已經叫人貼出去了，退路是沒有的。',
};

type Msg = { role: 'user' | 'assistant'; content: string };
interface MindAct { 心裡: string; 做: string; 說?: string; 去?: string; 印?: string; 筆?: string; 贈?: string }
interface PlayScene { author: string; day: number; part: string; text: string }

/** bigram overlap — does the narration mention this object? */
function mentionsItem(text: string, itemDesc: string): boolean {
    const clean = itemDesc.replace(/[（(].*?[)）]/g, '');
    for (let i = 0; i + 2 <= clean.length; i++) {
        const gram = clean.slice(i, i + 2);
        if (/[一-鿿]{2}/.test(gram) && text.includes(gram)) return true;
    }
    return false;
}

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
            return part === '日午' || part === '晡時' || part === '黃昏' ? `這個時辰你照例在${work}坐鎮，看帳、盯排戲。` : '';
        case 'reporter':
            return part === '深宵' ? `深宵回報館趕稿（${work}），截稿是天。` : part === '清晨' ? '趕完稿天亮才睡下，晌午前起不來。' : '';
        case 'guest':
            return part === '晡時' ? `這個時辰你照例在${work}吃茶聽戲，城裡的體面人都認得你的座。` : '';
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
    // ── physics state (world truths; the mind only ever FEELS these) ──
    craft: number;
    craftBase: number;
    fatigue = 0.2;
    money: number;
    lastToldMoney = -1;
    daysSincePractice = 0;
    practicedToday = false;
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
            occ === 'guest' ? `晡時常在${work}吃茶聽戲` : '起居隨意';
        this.system = [
            `你是${c.name}（${c.role}），活在 1920 年代的上海。這不是扮演——你就是這個人，活在連續的時間裡。`,
            `【你是誰】${c.description}`,
            `【你心底的事（只有你自己知道）】${c.secret}`,
            `【你記得的過往】\n${c.memories.map((m) => `・${m.text}`).join('\n')}`,
            SEASON_NOTE[id] ?? '',
            `【這個世界】${WORLD_PREMISE}`,
            `地方：${VENUE_NAMES.join('、')}。`,
            `【本季】雲錦台外貼出了水牌：第${DAYS}日夜，春雪社新編大戲首演。滿城都在看春雪社這回拿什麼出來。`,
            '',
            '【你怎麼活】你會不斷收到「此刻的感知」。每次收到，回覆你此刻真實的反應，嚴格只輸出 JSON：',
            '{"心裡":"念頭(一兩句)","做":"你客觀做了什麼(一兩句,第三人稱)","說":"說出口的話(沒有就空)","去":"要動身去的地方(留原地就空)"}',
            '規矩：話用人話說；「命/一輩子」是一生說一兩次的字；你只知道親歷親聞的事；',
            '你有自己的營生與功課，不是每個時辰都要找人；對人說話時「說」裡直接說。',
            '把隨身物件送出手時，多加一欄 "贈":"物件｜給誰"——東西離了手，就真的不在你身上了。',
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
        const raw = await llmChat(this.system, this.transcript, 500);
        this.transcript.push({ role: 'assistant', content: raw });
        try {
            const m = raw.match(/\{[\s\S]*\}/);
            const o = JSON.parse(m ? m[0] : raw) as Partial<MindAct>;
            return { 心裡: o.心裡 ?? '', 做: o.做 ?? '', 說: o.說 || undefined, 去: o.去 || undefined, 印: o.印 || undefined, 筆: o.筆 || undefined, 贈: o.贈 || undefined };
        } catch {
            return { 心裡: '', 做: raw.slice(0, 120) };
        }
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
    const minds = specs.map((c) => new Mind(c.id, c.occupation, c.homeVenue, c.workVenue, c.money));

    // Whereabouts intel is standing knowledge (small town) — it lives in the
    // SYSTEM once, not in every percept.
    for (const m of minds)
        m.system += `\n【你曉得旁人的日子】${minds.filter((o) => o !== m).map((o) => `${o.name}${o.routine}`).join('；')}。`;

    /** The reporter's filed copy, if any — printed at next dawn. */
    let pendingPaper: { by: string; text: string } | null = null;

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

            const finaleFact =
                day === DAYS && (part === '黃昏' || part === '入夜')
                    ? `今夜${playbook.title ? `《${playbook.title}》` : '春雪社新戲'}首演，雲錦台開鑼——水牌貼了這些天，滿城的人都往那兒去。${
                          part === '入夜' ? '這一個時辰就是正戲：照著本子與定本，一場一場真演下去。' : ''
                      }`
                    : '';

            // group by venue for multi-party exchanges
            const atVenue = new Map<string, Mind[]>();
            for (const m of minds) atVenue.set(m.venue, [...(atVenue.get(m.venue) ?? []), m]);

            const moved: Mind[] = [];
            const takePrint = (m: Mind, act: MindAct): void => {
                if (act.印 && m.occ === 'reporter') {
                    pendingPaper = { by: m.name, text: act.印.slice(0, 220) };
                    log(`  〔付印〕${m.name} 把稿子交了下去，明晨見報。`);
                }
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
                let itemIdx = -1;
                let receiver: Mind | undefined;
                if (act.贈) {
                    const [itemName, rcvName] = act.贈.split(/[｜|]/).map((s) => s.trim());
                    itemIdx = m.carried.findIndex((d) => itemName && mentionsItem(itemName, d));
                    receiver = minds.find((o) => o !== m && rcvName && (rcvName.includes(o.name) || o.name.includes(rcvName)));
                    if (itemIdx < 0 && itemName && receiver) {
                        // giving something not in the ledger: it comes into being in the receiver's hands
                        receiver.carried.push(itemName);
                        log(`  〔贈物〕${m.name} 把「${itemName}」給了 ${receiver.name}。`);
                        receiver.hear(`（${m.name}把「${itemName}」交到了你手上。）`);
                        return;
                    }
                } else {
                    const text = act.做 + (act.說 ?? '');
                    if (!/留給|遞給|送給|交給|留下|相贈|贈與/.test(text)) return;
                    itemIdx = m.carried.findIndex((d) => mentionsItem(text, d));
                    if (itemIdx < 0) return;
                    receiver = minds.find((o) => o !== m && text.includes(o.name)) ??
                        (group.length === 2 ? group.find((o) => o !== m) : undefined);
                }
                if (itemIdx < 0 || !receiver) return;
                const [item] = m.carried.splice(itemIdx, 1);
                receiver.carried.push(item);
                log(`  〔贈物〕${m.name} 把「${item.slice(0, 24)}」給了 ${receiver.name}。`);
                receiver.hear(`（${m.name}把那件東西——${item}——交到了你手上，如今在你身上了。）`);
                m.hear(`（那件東西離了你的手，如今在${receiver.name}那裡了。）`);
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
                const percept = (m: Mind, extra?: string): string =>
                    [
                        `【第${day}日·${part}】你在${m.venue}。`,
                        part === '清晨' ? `（${texture}）` : '',
                        paperLine,
                        present(m),
                        nearby(m),
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

                if (group.length === 1) {
                    const m = group[0];
                    const act = await m.act(percept(m));
                    log(`  ${m.name} @ ${m.venue}｜${act.做}${act.說 ? `「${act.說}」` : ''}`);
                    takePrint(m, act);
                    await takePen(m, act);
                    takeGift(m, act, group);
                    if (act.去 && VENUE_NAMES.includes(act.去) && act.去 !== m.venue) {
                        m.venue = act.去;
                        moved.push(m);
                        log(`  → ${m.name} 動身去了 ${act.去}`);
                    }
                } else {
                    // multi-party round-robin. The hour's capacity bounds the
                    // scene (time physics, max 4 rounds); it ends EARLY when the
                    // minds let it — a full round of silence means the scene
                    // dissolved on its own, someone leaving breaks it up.
                    let carry = '';
                    let ended = false;
                    for (let round = 0; round < 4 && !ended; round++) {
                        let anySpoke = false;
                        for (const m of group) {
                            const act = await m.act(round === 0 && !carry ? percept(m) : `${carry} 此刻你？`);
                            log(`  ${m.name}｜${act.做}${act.說 ? `「${act.說}」` : ''}`);
                            takePrint(m, act);
                            await takePen(m, act);
                            takeGift(m, act, group);
                            if (act.說) anySpoke = true;
                            carry = `${m.name}${act.說 ? `說：「${act.說}」` : ''}（${act.做}）`;
                            if (act.去 && VENUE_NAMES.includes(act.去) && act.去 !== m.venue) {
                                m.venue = act.去;
                                moved.push(m);
                                log(`  → ${m.name} 起身去了 ${act.去}`);
                                for (const o of group) if (o !== m) o.hear(`（${m.name}起身走了，往${act.去}去。）`);
                                ended = true;
                                break;
                            }
                        }
                        if (!anySpoke) break;
                    }
                }
            }
            // street sightings: two movers this tick glimpse each other — unless
            // they are heading to the SAME place (converging, not crossing;
            // they'll simply meet there next tick).
            for (let i = 0; i < moved.length; i++)
                for (let j = i + 1; j < moved.length; j++) {
                    if (moved[i].venue === moved[j].venue) continue;
                    moved[i].hear(`（路上你遠遠瞧見${moved[j].name}也在街面上，往${moved[j].venue}那頭去了。）`);
                    moved[j].hear(`（路上你遠遠瞧見${moved[i].name}也在街面上，往${moved[i].venue}那頭去了。）`);
                    log(`  〔街面〕${moved[i].name} 與 ${moved[j].name} 錯身而過，彼此瞧見了。`);
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
            if (day === DAYS && part === '入夜') {
                const inHouse = minds.filter((m) => m.venue === '雲錦台戲台');
                const onStage = inHouse.filter((m) => m.occ === 'troupe' && m.venue === m.work);
                if (onStage.length) {
                    const lead = onStage.reduce((a, b) => (a.craft >= b.craft ? a : b));
                    // an unfinished play collapses on its opening night — physics
                    const completeness = Math.min(1, playbook.scenes.length / 3);
                    const grade = (0.4 + 0.6 * lead.craft) * (0.55 + 0.45 * completeness);
                    const house =
                        grade > 0.9 ? '滿場彩聲，加了三回簾' :
                        grade > 0.75 ? '彩聲不斷' : '前排有人嗑瓜子聊開了，彩聲稀稀落落';
                    log(`  〔票房〕首演品相 ${grade.toFixed(2)}（領銜 ${lead.name}，本子 ${playbook.scenes.length} 場）——${house}。`);
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
                    m.craft = Math.min(1, m.craft + 0.03);
                    m.daysSincePractice = 0;
                } else {
                    m.daysSincePractice += 1;
                    m.craft = m.craftBase + (m.craft - m.craftBase) * 0.97;
                }
                m.practicedToday = false;
            }
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
