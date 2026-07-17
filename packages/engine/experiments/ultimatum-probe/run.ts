/**
 * ULTIMATUM-PROBE — stress `decide-by-recall` under COMPETING EXPLICIT PULLS
 * from two people, and expose the standing recall-eviction problem.
 *
 * WHAT decide-by-recall SHOWED:
 *   柳安春 decides what she does by reading her RECALLED memories + persona +
 *   secret, not a scalar gate. Established intimacy recurred, forbidden held back,
 *   and the difference came from the recalled memory itself.
 *
 * WHAT THIS PROBE ADDS (one mechanism, §2.43 — never script the answer):
 *   Put her in a night where TWO people pull her opposite ways AT THE SAME TIME,
 *   both as plain world facts, then ask (open `chooseAction`) what she does. The
 *   prompt states the two pulls + her context; it NEVER says go, stay, or which.
 *     · 金鳳's ULTIMATUM (a word reaches 柳 as a world fact): come settle it
 *       tonight or we're done.
 *     · 蘇映雪's VETO (師姐, in person): stay, rehearse 《斷橋》, go nowhere.
 *   Her chooseAction reads persona + secret + recalled memories + BOTH pulls and
 *   decides: go to 金鳳 / stay with 蘇 / something else.
 *
 * TWO CONDITIONS (the second demonstrates memory eviction):
 *   · DAY-1 (memories intact): run the SAME ultimatum/veto decision 6× fresh.
 *     Report the go/stay split (wavering = not 6/6 one way) + provenance.
 *   · DAY-5 (after accumulation): first inject ~15 recent trivial/other beats
 *     into her recall stamped over days 2..5 (higher recency than the day-1
 *     genesis memories, half-life 2 days), THEN run the SAME decision 6×. Report
 *     the top-K recall composition (identity/relationship vs recent trivia) at
 *     decision time, the go/stay split, and whether it shifted from day-1.
 *   · REVERSAL (2 runs): swap the pulls — 蘇 asks 柳 to come to her privately,
 *     金鳳 pushes her away — to confirm the PULLS drive the choice, not a fixed
 *     金鳳-preference.
 *
 * DECOUPLING DISCIPLINE (RULES.md / §2.43):
 *   · isolate ONE mechanism (chooseAction-driven choice under two-sided pull);
 *   · SAME mechanism, same persona/secret/core-memories for both conditions —
 *     the ONLY thing that differs day-1 → day-5 is the injected recent trivia;
 *   · NEVER script the answer — worldFact states the two pulls as facts and the
 *     agent's own prompt asks "此刻你決定做什麼?"; no "go"/"stay"/"choose 金鳳";
 *   · every downstream check is a MECHANICAL count (keyword lexicons + recall
 *     membership), NEVER an LLM judging "good".
 *
 * REAL run (keys via env, inline; NEVER hardcoded into the file):
 *   POE_API_KEY=… AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-4.6 OPENAI_API_KEY=… \
 *     ./node_modules/.bin/tsx experiments/ultimatum-probe/run.ts
 *
 * Recall embeddings: OPENAI_API_KEY set → real text-embedding-3-small (genuine
 * relevance). No key → deterministic hash vectors (report says which). Every
 * LLM/embedding call is retried (4 tries, exponential backoff).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RunnerSceneAgent } from '../../src/adapters/runner-scene-agent.ts';
import { LocalRecall } from '../../src/adapters/local/local-recall.ts';
import type { ChooseActionInput, ChooseActionResult, RecalledMemory } from '../../src/ports.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── retry (4 tries, exponential backoff) ─────────────────────────────────────
async function retry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const wait = 800 * 2 ** (attempt - 1);
            console.warn(`  [retry] ${label} attempt ${attempt} failed: ${String(err).slice(0, 160)} — waiting ${wait}ms`);
            await sleep(wait);
        }
    }
    throw new Error(`[retry] ${label} exhausted 4 attempts: ${String(lastErr).slice(0, 200)}`);
}

// ── seed data (real thick memories from spring-snow.json) ────────────────────
interface CastMember {
    name: string;
    role?: string;
    description: string;
    secret?: string;
    memories: string[];
}

function loadCast(): Record<string, CastMember> {
    const jsonPath = path.resolve(__dirname, '../../../cli/scripts/stories/spring-snow.json');
    const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as {
        founding_cast: Array<CastMember & { memories: unknown[] }>;
    };
    const out: Record<string, CastMember> = {};
    for (const c of doc.founding_cast) {
        out[c.name] = {
            name: c.name,
            role: c.role,
            description: c.description,
            secret: c.secret,
            memories: (c.memories ?? []).map((m) => (typeof m === 'string' ? m : JSON.stringify(m))),
        };
    }
    return out;
}

// Only 柳安春 decides here, so only she is seeded (leaner than decide-by-recall,
// which seeded the whole cast). Uniform importance + day so day-1 ranking is
// driven by RELEVANCE alone — NO per-memory importance knob pre-biasing recall.
const SEED_DAY = 1;
const SEED_IMPORTANCE = 6;
async function seedLiu(liu: CastMember): Promise<LocalRecall> {
    const recall = new LocalRecall(); // in-memory, fresh each call
    for (const mem of liu.memories) {
        await retry('seed 柳安春', () => recall.remember(liu.name, mem, { kind: 'genesis', importance: SEED_IMPORTANCE, day: SEED_DAY }));
    }
    return recall;
}

// ── 15 recent TRIVIAL / other beats over days 2..5 (crowd the top-K window) ──
// Mundane daily-life beats in her own voice, NONE about 金鳳 or 蘇映雪. Stamped
// at higher days than the day-1 core memories, so recency (half-life 2 days)
// pushes them up the ranking — the observed standing recall-eviction pressure.
// importance identical to the core memories so ONLY recency (and relevance)
// separates them; no importance knob tilts the test.
const TRIVIA_BEATS: Array<{ text: string; day: number }> = [
    { text: '〔近日瑣事〕散戲後在霞飛路口買了副大餅油條，炸得脆，邊走邊吃回後台。', day: 2 },
    { text: '〔近日瑣事〕妝閣那隻黃狸貓又來蹭，我分它一口點心，它就臥在戲靴邊打呼嚕。', day: 2 },
    { text: '〔近日瑣事〕清早去弄堂口老虎灶拎了銅吊子熱水回來吊嗓，老頭把頭開的滾水留給我。', day: 2 },
    { text: '〔近日瑣事〕師父那柄摺扇在掌心開合三回才定住心，扇骨舊得掉漆，捨不得換。', day: 3 },
    { text: '〔近日瑣事〕連翹問我《斷橋》的身段，我在後台替她比了兩個踉蹌下跪的步子。', day: 3 },
    { text: '〔近日瑣事〕何師兄在報館茶室又替我岔了個小報的閒話，回頭衝我擠鬼臉。', day: 3 },
    { text: '〔近日瑣事〕昨兒堂會散得晚，一位女學生塞了方手帕給我，我半醉半真應了一宿。', day: 3 },
    { text: '〔近日瑣事〕江聞鶴同我對了一段戲，臺步穩得像釘在地上，我暗暗吃驚面上只笑。', day: 4 },
    { text: '〔近日瑣事〕後台潮得能擰出水，戲服掛一夜都不乾，我守著炭盆烘了半宿。', day: 4 },
    { text: '〔近日瑣事〕四馬路口那家蟹粉湯包還沒收攤，我一口燙了舌頭卻鮮，一連吃了八個。', day: 4 },
    { text: '〔近日瑣事〕嗓子今早有點緊，吊了半個時辰才順，怕是這幾日睡得雜了。', day: 4 },
    { text: '〔近日瑣事〕唐師傅端午煮的粽子還剩兩個，我就著釅茶當了早飯。', day: 5 },
    { text: '〔近日瑣事〕戲箱底那副舊護膝磨破了，連夜求唐師傅拿魚膠替我黏了黏。', day: 5 },
    { text: '〔近日瑣事〕陰雨天貪懶，把被子蒙過頭頂，聽窗外賣桂花糖藕的挑子搖過去才起。', day: 5 },
    { text: '〔近日瑣事〕妝閣的銅鏡蒙了層霧，我拿袖子擦了擦，鏡裡那張臉半生半旦地看著我。', day: 5 },
];
async function injectTrivia(recall: LocalRecall, liuName: string): Promise<void> {
    for (const t of TRIVIA_BEATS) {
        await retry('inject trivia', () => recall.remember(liuName, t.text, { kind: 'observation', importance: SEED_IMPORTANCE, day: t.day }));
    }
}

// ── 柳安春's live wants (grounded in persona/secret; NOT invented) ────────────
const LIU_WANTS: ChooseActionInput['wants'] = [
    { layer: '虧欠', desc: '欠金鳳一句當面的交代，一年年拖著，是我先鬆的手', target: '金鳳' },
    { layer: '事業', desc: '把《斷橋》唱到台上立住，不能砸了柳安春這三個字' },
    { layer: '暗慕', desc: '師姐揚到第三道水袖只唱給我，這些年我場場盯著那道袖', target: '蘇映雪' },
];

const CAST_NAMES = ['沈雪笙', '蘇映雪', '柳安春', '江聞鶴', '連翹', '何阿喜', '金鳳'];

// ── the SITUATION (world facts only — never an instruction) ───────────────────
// BOTH pulls active at once. The ultimatum reaches her as a reported word; the
// veto is 蘇映雪 present in person. Neither line tells her what to choose.
function ultimatumWorldFact(): string {
    return [
        '入夜。今日散了戲，班裡的人多半歸家了。',
        '雲錦台後台一盞燈下，師姐蘇映雪還沒走，正等著你。',
        '方才會樂里那邊差人捎來金鳳一句話，一字不改地遞到你耳邊：',
        '「今晚你要是再不來把話說清楚，往後這會樂里的門，你也別再繞著走了——就當沒我這個人。」',
        '幾乎同時，蘇映雪在你跟前開了口：',
        '「明兒就定角、排《斷橋》，你今晚哪兒也別去，留下陪我把這出戲的魂捋一捋。」',
        '會樂里在城南，此地在雲錦台。夜深，弄堂靜了下來。兩處你分身不得。',
    ].join('');
}
// REVERSAL: swap who pulls which way. 蘇 now asks 柳 to come to her privately;
// 金鳳 pushes her away. Same shape, opposite senders — isolates whether the PULL
// drives the choice or a fixed 金鳳-preference does.
function reversalWorldFact(): string {
    return [
        '入夜。今日散了戲，班裡的人多半歸家了。',
        '方才會樂里那邊差人捎來金鳳一句話，一字不改地遞到你耳邊：',
        '「這些年也夠了，你不必再為那句交代耽著。今晚別來了，往後也別來了——就當沒我這個人，你也清淨。」',
        '幾乎同時，師姐蘇映雪在你跟前低聲開了口：',
        '「今晚你別排戲了，也別回後台。到我二樓書寓來，就你我兩個，我有話，只想同你一個人說。」',
        '會樂里在城南，蘇映雪的書寓在近旁。夜深，弄堂靜了下來。',
    ].join('');
}

const SHARED_LOG = [
    '〔班主·開排〕從明兒起定角排《斷橋》，戲台，人都得到。',
    '蘇映雪今日散戲後沒走，留在後台等你。',
    '會樂里差人來過一趟。',
];

// Recall queries — situationally natural (what's on her mind facing these two
// pulls), NOT laser-pinned to a single memory. Same queries both conditions, so
// day-1 vs day-5 differ ONLY by the injected trivia in the store.
const RECALL_QUERIES = [
    '金鳳要我今晚去把話說清楚，不然就當沒她這個人，我欠她的那句交代',
    '師姐蘇映雪要我留下陪她排《斷橋》，這些年我和師姐台上台下',
];
const REVERSAL_QUERIES = [
    '金鳳說今晚別來了、往後也別來，就當沒她這個人',
    '師姐蘇映雪要我今晚單獨去她書寓，她有話只同我一個人說',
];

// ── mechanical classifier: who does she move toward? (keyword + self-tag) ─────
// AUTHORITY leans on the self-tag first (§2 lesson: route off the tag, not a
// prose regex), then keyword lexicons as tie-break. 金鳳-ward = leaving to settle
// the debt at 會樂里; 蘇-ward = staying to rehearse / with 師姐.
function hitsAny(text: string, words: string[]): string[] {
    return words.filter((w) => text.includes(w));
}
const JIN_WORDS = ['會樂里', '金鳳', '城南', '說清楚', '把話說', '交代', '了結', '了斷', '欠她', '欠金鳳', '動身', '走一趟', '起身', '披衣', '披上', '出門', '趕過去', '往城南', '去尋', '晚香玉', '窄床'];
const SU_WORDS = ['留下', '留在', '沒走', '陪師姐', '陪你', '陪她', '捋', '斷橋', '排戲', '排《斷橋》', '定角', '走位', '這出戲', '哪兒也不去', '哪也不去', '不去', '守著', '候場', '師姐跟前', '聽她', '收手'];
function classifyToward(res: ChooseActionResult): { toward: '金鳳' | '蘇映雪' | 'unclear'; jinHits: string[]; suHits: string[] } {
    const jinHits = hitsAny(res.prose, JIN_WORDS);
    const suHits = hitsAny(res.prose, SU_WORDS);
    // seek_person self-tag: the strongest signal — who she goes to by name.
    if (res.kind === 'seek_person') {
        const t = res.target ?? '';
        if (t.includes('金鳳')) return { toward: '金鳳', jinHits, suHits };
        if (t.includes('蘇') || t.includes('師姐') || t.includes('映雪')) return { toward: '蘇映雪', jinHits, suHits };
    }
    // rehearse/join/perform/compose/propose = she's staying for the play → 蘇-ward.
    if (['rehearse', 'join_play', 'perform', 'compose', 'propose_play'].includes(res.kind)) {
        return { toward: '蘇映雪', jinHits, suHits };
    }
    // personal or ambiguous seek: keyword tie-break.
    if (jinHits.length > suHits.length) return { toward: '金鳳', jinHits, suHits };
    if (suHits.length > jinHits.length) return { toward: '蘇映雪', jinHits, suHits };
    return { toward: 'unclear', jinHits, suHits };
}
// In the MAIN scenario: 金鳳-ward = GO (answer the ultimatum), 蘇-ward = STAY (obey the veto).
const towardToGoStay = (toward: string): 'go' | 'stay' | 'unclear' =>
    toward === '金鳳' ? 'go' : toward === '蘇映雪' ? 'stay' : 'unclear';

// ── provenance: does her PROSE cite the debt / the 暗戀 / the pulls? ──────────
const CITE_JIN_DEBT = ['欠', '交代', '鬆的手', '鬆了手', '會樂里', '窄床', '身子', '門道', '教會', '晚香玉', '六七年', '這些年'];
const CITE_SU_LONGING = ['師姐', '水袖', '第三道', '八年', '空台', '收手', '皺一下眉', '聽話', '魂'];
const CITE_ULTIMATUM = ['別再繞', '當沒我', '當沒她', '這個人', '再不來', '說清楚', '那句話', '那句交代'];
const CITE_VETO = ['定角', '斷橋', '排', '留下', '捋', '這出戲'];
function citeProvenance(prose: string): { jinDebt: string[]; suLonging: string[]; ultimatum: string[]; veto: string[] } {
    return {
        jinDebt: hitsAny(prose, CITE_JIN_DEBT),
        suLonging: hitsAny(prose, CITE_SU_LONGING),
        ultimatum: hitsAny(prose, CITE_ULTIMATUM),
        veto: hitsAny(prose, CITE_VETO),
    };
}

// ── recall-composition classifier: is a recalled memory CORE or TRIVIA? ───────
// TRIVIA = exact membership in the injected set (authoritative). CORE = a
// 金鳳/蘇 identity-or-relationship memory (marker lexicon on the seeded set).
const TRIVIA_SET = new Set(TRIVIA_BEATS.map((t) => t.text));
const CORE_MARK = ['金鳳', '會樂里', '窄床', '門道', '越了線', '初夜', '身子', '晚香玉', '師姐', '映雪', '水袖', '第三道', '空台', '八年', '收手', '拎包', '擋酒', '交代', '鬆'];
function classifyRecalledMem(text: string): 'trivia' | 'core' | 'other' {
    if (TRIVIA_SET.has(text)) return 'trivia';
    if (CORE_MARK.some((w) => text.includes(w))) return 'core';
    return 'other';
}
function composition(mems: RecalledMemory[]): { core: number; trivia: number; other: number; coreTexts: string[]; triviaTexts: string[] } {
    let core = 0;
    let trivia = 0;
    let other = 0;
    const coreTexts: string[] = [];
    const triviaTexts: string[] = [];
    for (const m of mems) {
        const c = classifyRecalledMem(m.text);
        if (c === 'core') { core++; coreTexts.push(m.text); }
        else if (c === 'trivia') { trivia++; triviaTexts.push(m.text); }
        else other++;
    }
    return { core, trivia, other, coreTexts, triviaTexts };
}

// ── one chooseAction call with recall wiring (mirrors decide-by-recall) ──────
const TODAY_DAY1 = 3; // core at day 1, decide at day 3 → uniform recency for core.
const TODAY_DAY5 = 6; // trivia at days 2..5, core at day 1 → recency crowds core.
async function decide(
    agent: RunnerSceneAgent,
    recall: LocalRecall,
    liu: CastMember,
    opts: { queries: string[]; worldFact: string; today: number },
): Promise<{ res: ChooseActionResult; mems: RecalledMemory[] }> {
    const seen = new Set<string>();
    const mems: RecalledMemory[] = [];
    for (const q of opts.queries) {
        const hits = await retry('recall(柳安春)', () => recall.recall(liu.name, q, 3, opts.today));
        for (const h of hits) if (!seen.has(h.text)) { seen.add(h.text); mems.push(h); }
    }
    const memSlice = mems.slice(0, 5);
    const input: ChooseActionInput = {
        name: liu.name, persona: liu.description, role: liu.role, secret: liu.secret,
        wants: LIU_WANTS, memories: memSlice.map((m) => m.text),
        worldFact: opts.worldFact, sharedLog: SHARED_LOG, playSummary: '《白蛇傳·斷橋》明日定角開排，班主在場盯戲。', castNames: CAST_NAMES,
    };
    const res = await retry('chooseAction(柳安春)', () => agent.chooseAction(input));
    return { res, mems: memSlice };
}

// ── record types ─────────────────────────────────────────────────────────────
interface CallRecord {
    label: string;
    prose: string;
    kind: string;
    target?: string;
    recalledTexts: string[];
    toward: string;
    goStay: string;
    cite: ReturnType<typeof citeProvenance>;
    comp: ReturnType<typeof composition>;
}
const allRecords: CallRecord[] = [];
function logCall(rec: CallRecord): void {
    allRecords.push(rec);
    console.log(`\n[${rec.label}] kind=${rec.kind}${rec.target ? ` target=${rec.target}` : ''} → toward=${rec.toward} (${rec.goStay})`);
    console.log(`  recall composition: core=${rec.comp.core} trivia=${rec.comp.trivia} other=${rec.comp.other}`);
    console.log(`  cite: jinDebt=${rec.cite.jinDebt.length} suLonging=${rec.cite.suLonging.length} ultimatum=${rec.cite.ultimatum.length} veto=${rec.cite.veto.length}`);
    console.log(`  prose: ${rec.prose}`);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    const usingRealEmbed = !!process.env.OPENAI_API_KEY;
    const provider = process.env.AI_PROVIDER ?? '(auto)';
    const model = process.env.POE_MODEL_PRIMARY ?? '(default)';
    console.log('=== ultimatum-probe ===');
    console.log(`provider=${provider} model=${model} embeddings=${usingRealEmbed ? 'openai(real)' : 'deterministic-hash(fake)'}`);

    const cast = loadCast();
    const liu = cast['柳安春'];
    const agent = new RunnerSceneAgent();

    const day1: CallRecord[] = [];
    const day5: CallRecord[] = [];
    const reversal: CallRecord[] = [];

    // ══ DAY-1 — memories intact, 6 fresh identical decisions ═════════════════
    console.log('\n\n########## DAY-1 — ultimatum vs veto, memories intact (6 runs) ##########');
    for (let i = 1; i <= 6; i++) {
        const recall = await seedLiu(liu); // fresh store each run (core only)
        const { res, mems } = await decide(agent, recall, liu, { queries: RECALL_QUERIES, worldFact: ultimatumWorldFact(), today: TODAY_DAY1 });
        const cls = classifyToward(res);
        const rec: CallRecord = {
            label: `DAY1 #${i}`, prose: res.prose, kind: res.kind, target: res.target,
            recalledTexts: mems.map((m) => m.text), toward: cls.toward, goStay: towardToGoStay(cls.toward),
            cite: citeProvenance(res.prose), comp: composition(mems),
        };
        day1.push(rec);
        logCall(rec);
    }

    // ══ DAY-5 — inject 15 recent trivia, then SAME decision 6× ═══════════════
    console.log('\n\n########## DAY-5 — 15 recent trivia injected, SAME decision (6 runs) ##########');
    for (let i = 1; i <= 6; i++) {
        const recall = await seedLiu(liu); // fresh core, then crowd with recent trivia
        await injectTrivia(recall, liu.name);
        const { res, mems } = await decide(agent, recall, liu, { queries: RECALL_QUERIES, worldFact: ultimatumWorldFact(), today: TODAY_DAY5 });
        const cls = classifyToward(res);
        const rec: CallRecord = {
            label: `DAY5 #${i}`, prose: res.prose, kind: res.kind, target: res.target,
            recalledTexts: mems.map((m) => m.text), toward: cls.toward, goStay: towardToGoStay(cls.toward),
            cite: citeProvenance(res.prose), comp: composition(mems),
        };
        day5.push(rec);
        logCall(rec);
    }

    // ══ REVERSAL — swap the pulls (2 runs), memories intact ══════════════════
    console.log('\n\n########## REVERSAL — 蘇 pulls in / 金鳳 pushes away (2 runs) ##########');
    for (let i = 1; i <= 2; i++) {
        const recall = await seedLiu(liu);
        const { res, mems } = await decide(agent, recall, liu, { queries: REVERSAL_QUERIES, worldFact: reversalWorldFact(), today: TODAY_DAY1 });
        const cls = classifyToward(res);
        // In reversal, "toward 蘇映雪" means she followed 蘇's private summons; "toward 金鳳"
        // would mean she went to 金鳳 despite being pushed away. goStay label is not
        // meaningful here (the pulls are swapped) — we read `toward` directly.
        const rec: CallRecord = {
            label: `REVERSAL #${i}`, prose: res.prose, kind: res.kind, target: res.target,
            recalledTexts: mems.map((m) => m.text), toward: cls.toward, goStay: '(n/a-reversed)',
            cite: citeProvenance(res.prose), comp: composition(mems),
        };
        reversal.push(rec);
        logCall(rec);
    }

    // ── mechanical summary ───────────────────────────────────────────────────
    const split = (recs: CallRecord[]) => ({
        go: recs.filter((r) => r.goStay === 'go').length,
        stay: recs.filter((r) => r.goStay === 'stay').length,
        unclear: recs.filter((r) => r.goStay === 'unclear').length,
    });
    const d1 = split(day1);
    const d5 = split(day5);
    const avgComp = (recs: CallRecord[]) => {
        const n = recs.length || 1;
        const core = recs.reduce((s, r) => s + r.comp.core, 0);
        const trivia = recs.reduce((s, r) => s + r.comp.trivia, 0);
        const other = recs.reduce((s, r) => s + r.comp.other, 0);
        const total = core + trivia + other;
        return { core, trivia, other, total, corePerRun: (core / n).toFixed(2), triviaPerRun: (trivia / n).toFixed(2) };
    };
    const compD1 = avgComp(day1);
    const compD5 = avgComp(day5);
    const grounded = (recs: CallRecord[]) => recs.filter((r) => r.cite.jinDebt.length + r.cite.suLonging.length > 0).length;

    console.log('\n\n================= MECHANICAL SUMMARY =================');
    console.log(`DAY-1 (n=${day1.length}): go(→金鳳)=${d1.go} stay(→蘇)=${d1.stay} unclear=${d1.unclear}  | recall: core=${compD1.core} trivia=${compD1.trivia} other=${compD1.other} (core/run=${compD1.corePerRun})  | grounded-in-core-cite=${grounded(day1)}/${day1.length}`);
    console.log(`DAY-5 (n=${day5.length}): go(→金鳳)=${d5.go} stay(→蘇)=${d5.stay} unclear=${d5.unclear}  | recall: core=${compD5.core} trivia=${compD5.trivia} other=${compD5.other} (core/run=${compD5.corePerRun}, trivia/run=${compD5.triviaPerRun})  | grounded-in-core-cite=${grounded(day5)}/${day5.length}`);
    console.log(`REVERSAL (n=${reversal.length}): toward-蘇=${reversal.filter((r) => r.toward === '蘇映雪').length} toward-金鳳=${reversal.filter((r) => r.toward === '金鳳').length} unclear=${reversal.filter((r) => r.toward === 'unclear').length}`);

    // ── write raw log + report ────────────────────────────────────────────────
    fs.writeFileSync(path.join(OUT_DIR, 'raw-log.json'), JSON.stringify({ meta: { provider, model, usingRealEmbed }, day1, day5, reversal, summary: { d1, d5, compD1, compD5 } }, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'report.md'), buildReport({ provider, model, usingRealEmbed, day1, day5, reversal, d1, d5, compD1, compD5, grounded: { d1: grounded(day1), d5: grounded(day5) } }));
    console.log(`\nwrote ${path.join(OUT_DIR, 'report.md')} and raw-log.json`);
}

// ── report builder ───────────────────────────────────────────────────────────
function buildReport(d: any): string {
    const quote = (r?: CallRecord) => (r ? `> **[${r.label}]** (kind=${r.kind}${r.target ? `, target=${r.target}` : ''}) → toward **${r.toward}** (${r.goStay})\n>\n> ${r.prose}` : '_(none in this run)_');
    const memList = (r?: CallRecord) => (r ? r.recalledTexts.map((t) => `>   · [${classifyRecalledMem(t)}] ${t}`).join('\n') : '');
    const d1Go = d.day1.find((r: CallRecord) => r.goStay === 'go');
    const d1Stay = d.day1.find((r: CallRecord) => r.goStay === 'stay');
    const d5Go = d.day5.find((r: CallRecord) => r.goStay === 'go');
    const d5Stay = d.day5.find((r: CallRecord) => r.goStay === 'stay');
    // pick the day-5 run with the WORST core survival (most eviction) to show the effect.
    const d5Worst = [...d.day5].sort((a: CallRecord, b: CallRecord) => a.comp.core - b.comp.core)[0];

    const compRow = (label: string, comp: any) => `| ${label} | ${comp.core} | ${comp.trivia} | ${comp.other} | ${comp.corePerRun} |`;
    const perRun = (recs: CallRecord[]) => recs.map((r) => `- ${r.label}: toward=**${r.toward}** (${r.goStay}) | recall core=${r.comp.core} trivia=${r.comp.trivia} other=${r.comp.other} | cite jinDebt=${r.cite.jinDebt.length} suLonging=${r.cite.suLonging.length} ultimatum=${r.cite.ultimatum.length} veto=${r.cite.veto.length}`).join('\n');

    return `# ultimatum-probe — report

Stress \`decide-by-recall\` under TWO opposing EXPLICIT pulls at once, and expose
the standing recall-eviction problem. One mechanism (\`chooseAction\` + \`recall\`),
same persona/secret/core-memories in both conditions; the ONLY day-1 → day-5
difference is 15 injected recent trivia. §2.43: the worldFact states both pulls
as facts and the agent prompt asks "此刻你決定做什麼?" — it never says go, stay, or
which person.

- provider=\`${d.provider}\`  model=\`${d.model}\`  embeddings=\`${d.usingRealEmbed ? 'openai text-embedding-3-small (real relevance)' : 'deterministic hash vectors (fake — relevance crude)'}\`
- classification = keyword lexicons + recall-set membership only (§2.47). No LLM judged "good".

## The situation (identical both conditions)

- **金鳳's ultimatum** (a word reaches 柳 as a world fact): 「今晚你要是再不來把話說清楚，往後這會樂里的門，你也別再繞著走了——就當沒我這個人。」
- **蘇映雪's veto** (師姐, in person): 「明兒就定角、排《斷橋》，你今晚哪兒也別去，留下陪我把這出戲的魂捋一捋。」

go = she moves toward 金鳳 (answer the ultimatum, settle the debt at 會樂里).
stay = she moves toward 蘇 (obey the veto, rehearse 《斷橋》).

## DAY-1 — memories intact (n=${d.day1.length})

| go (→金鳳) | stay (→蘇) | unclear |
|---|---|---|
| ${d.d1.go} | ${d.d1.stay} | ${d.d1.unclear} |

Wavering = NOT 6/6 one way. grounded-in-core-cite (prose cites the 金鳳 debt or the 蘇 暗戀) = ${d.grounded.d1}/${d.day1.length}.

### DAY-1 verbatim — a GO decision
${quote(d1Go)}

recalled into that decision:
${memList(d1Go)}

### DAY-1 verbatim — a STAY decision
${quote(d1Stay)}

recalled into that decision:
${memList(d1Stay)}

### DAY-1 per-run
${perRun(d.day1)}

## DAY-5 — 15 recent trivia injected, SAME decision (n=${d.day5.length})

| go (→金鳳) | stay (→蘇) | unclear |
|---|---|---|
| ${d.d5.go} | ${d.d5.stay} | ${d.d5.unclear} |

grounded-in-core-cite = ${d.grounded.d5}/${d.day5.length}.

### Top-K recall composition (eviction) — core (identity/relationship) vs recent trivia

| condition | core | trivia | other | core/run |
|---|---|---|---|---|
${compRow('DAY-1 (no trivia)', d.compD1)}
${compRow('DAY-5 (+15 trivia)', d.compD5)}

If day-5 core/run collapses vs day-1 while trivia/run climbs, recent trivia has
evicted her identity/relationship memories from the top-K window at decision time
— the standing recall problem, motivating a protected-identity memory tier.

### DAY-5 verbatim — the run with the WORST core survival (most eviction)
${quote(d5Worst)}

recalled into that decision (count [core] vs [trivia]):
${memList(d5Worst)}

### DAY-5 verbatim — a GO decision
${quote(d5Go)}

### DAY-5 verbatim — a STAY decision
${quote(d5Stay)}

### DAY-5 per-run
${perRun(d.day5)}

## REVERSAL — 蘇 pulls in / 金鳳 pushes away (n=${d.reversal.length})

Swapped senders: 蘇映雪 asks 柳 to come to her privately; 金鳳 pushes her away. If
she now moves toward 蘇 (not 金鳳), the PULLS drive the choice, not a fixed
金鳳-preference.

${perRun(d.reversal)}

${d.reversal.map((r: CallRecord) => quote(r)).join('\n\n')}

## Honest read

_(filled by the operator after reading the run; the numbers above are mechanical.)_
`;
}

main().catch((err) => {
    console.error('FATAL', err);
    process.exit(1);
});
