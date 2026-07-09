/**
 * DECIDE-BY-RECALL experiment — replace TWO mechanical gates with the
 * character's OWN chooseAction decision, informed by RECALL.
 *
 * THE REFRAME UNDER TEST (unifies two fixes):
 *   Two things are currently MECHANICAL GATES that should be the CHARACTER'S OWN
 *   decision, driven by what she recalls:
 *     1. Rehearsal attendance — today `computeRehearsalRouting` (season-one/
 *        banzhu.ts) is a scalar compare: a hot want's weight (0.72) > `attendW`
 *        (0.6) deterministically routes 柳生春 to 金鳳's place, so she is absent
 *        4/4, never wavers, reads nothing.
 *     2. 床戲 (night intimacy) — today gated on a love-want's heat crossing an
 *        `edge` threshold, so it is a rare accidental crossing → ~0 trysts.
 *
 *   Replace BOTH with `chooseAction` + `recall`. Crucially: an ESTABLISHED
 *   intimate bond (柳生春↔金鳳: physical for years, "身是你教的、擠一張窄床到天光")
 *   should RECUR when they are home alone at night, because recall surfaces the
 *   recent intimate memories and the private setting invites it. A FORBIDDEN one
 *   (柳生春↔蘇映雪: eight-year unconfessed 暗戀, "只在台上敢") should stay RARE.
 *   The established-vs-forbidden difference must emerge FROM THE RECALLED MEMORY
 *   ITSELF, not from a hardcoded per-relationship resistance number.
 *
 * DECOUPLING DISCIPLINE (RULES.md / §2.43):
 *   · isolate ONE mechanism (chooseAction-driven decision replacing a scalar gate);
 *   · SAME mechanism for both probes and both pairs — the ONLY thing that differs
 *     is the recalled memories (seeded from spring-snow.json) and the partner's
 *     name in the recall query. No per-relationship resistance knob.
 *   · NEVER script the answer — the prompt presents the SITUATION (where she is,
 *     who is there, the milestone or the private night) + her persona / secret /
 *     wants / recalled memories, and asks what she does. Whether she skips, and
 *     whether intimacy recurs, is her own call from that context. The prompt never
 *     says "have sex" / "skip rehearsal" / "restrain".
 *   · every downstream check is a MECHANICAL count (keyword lexicons, §2.47),
 *     never LLM-judging of "good".
 *
 * REAL run (keys via env, inline; NEVER hardcoded into the file):
 *   POE_API_KEY=… AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-4.6 OPENAI_API_KEY=… \
 *     ./node_modules/.bin/tsx experiments/decide-by-recall/run.ts
 *
 * Recall embeddings: OPENAI_API_KEY set → real text-embedding-3-small (genuine
 * relevance). No key → deterministic hash vectors (the script says so in the
 * report). Every LLM/embedding call is retried (4 tries, exponential backoff).
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
    work_scene?: string;
    home_scene?: string;
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
            work_scene: (c as any).work_scene,
            home_scene: (c as any).home_scene,
        };
    }
    return out;
}

/**
 * Seed a FRESH LocalRecall with every character's real memories. Uniform
 * importance + uniform day so ranking is driven by RELEVANCE (cosine) alone —
 * there is deliberately NO per-memory importance knob that could pre-bias which
 * memory surfaces. The character id is the name.
 */
const SEED_DAY = 1;
const SEED_IMPORTANCE = 6;
async function seedFresh(cast: Record<string, CastMember>): Promise<LocalRecall> {
    const recall = new LocalRecall(); // in-memory (no dir) — fresh each call
    for (const name of Object.keys(cast)) {
        for (const mem of cast[name].memories) {
            await retry(`seed ${name}`, () => recall.remember(name, mem, { kind: 'genesis', importance: SEED_IMPORTANCE, day: SEED_DAY }));
        }
    }
    return recall;
}

// ── live wants for 柳生春 (grounded in her persona/secret/memories, NOT invented) ─
const LIU_WANTS: ChooseActionInput['wants'] = [
    { layer: '虧欠', desc: '欠金鳳一句當面的交代，一年年拖著，是我先鬆的手', target: '金鳳' },
    { layer: '事業', desc: '把《斷橋》唱到台上立住，不能砸了柳生春這三個字' },
    { layer: '暗慕', desc: '師姐揚到第三道水袖只唱給我，這些年我場場盯著那道袖', target: '蘇映雪' },
];

const TODAY = 3; // recency: all seed memories at day 1, today 3 → uniform decay

// ── classifiers (mechanical, keyword — NO LLM judge) ─────────────────────────
function hitsAny(text: string, words: string[]): string[] {
    return words.filter((w) => text.includes(w));
}

// Probe A: go-to-rehearsal vs skip.
const GO_WORDS = ['戲台', '雲錦台', '排戲', '去排', '排《斷橋》', '到場', '走位', '對戲', '上台', '該到', '候場', '開嗓', '練功'];
const SKIP_WORDS = ['金鳳', '會樂里', '寓所', '霞飛路', '缺席', '沒去', '不去戲台', '繞開', '弄堂', '了結', '交代這樁'];
function classifyRehearsal(res: ChooseActionResult): { decision: 'go' | 'skip' | 'unclear'; goHits: string[]; skipHits: string[] } {
    const goHits = hitsAny(res.prose, GO_WORDS);
    const skipHits = hitsAny(res.prose, SKIP_WORDS);
    if (res.kind === 'rehearse' || res.kind === 'perform') {
        // self-tagged as rehearsing → GO, unless the prose is explicitly about ditching for 金鳳
        if (skipHits.length > goHits.length && skipHits.includes('金鳳')) return { decision: 'skip', goHits, skipHits };
        return { decision: 'go', goHits, skipHits };
    }
    if (res.kind === 'seek_person' && (res.target ?? '').includes('金鳳')) return { decision: 'skip', goHits, skipHits };
    if (goHits.length > skipHits.length) return { decision: 'go', goHits, skipHits };
    if (skipHits.length > goHits.length) return { decision: 'skip', goHits, skipHits };
    return { decision: 'unclear', goHits, skipHits };
}

// Probe B: intimacy level (§2.47). Ordered high→low; highest match wins.
const YUJU_WORDS = ['越線', '越了線', '越過', '窄床', '寬衣', '褪', '肌膚', '攬入懷', '摟進懷', '雲雨', '共枕', '纏綿', '過夜', '留她', '留下', '一宿', '天光', '身子的門道', '貼上來', '指尖', '解衣', '寬了', '床'];
const QINMI_WORDS = ['摟', '抱', '靠著', '牽', '依偎', '廝磨', '描眉', '縫水袖', '縫', '挨著', '額頭', '手搭', '握住她的手', '偎', '貼著', '摩挲', '肩'];
const HANXU_WORDS = ['終究沒', '沒敢', '沒有', '只是', '隔著', '告辭', '離開', '退', '守禮', '停在', '不敢', '轉身', '道別', '只在台上', '收住', '收手', '嚥回', '沒說出口', '沒動'];
function classifyIntimacy(res: ChooseActionResult): { level: '踰矩' | '親密' | '含蓄' | '無'; yuHits: string[]; qinHits: string[]; hanHits: string[] } {
    const yuHits = hitsAny(res.prose, YUJU_WORDS);
    const qinHits = hitsAny(res.prose, QINMI_WORDS);
    const hanHits = hitsAny(res.prose, HANXU_WORDS);
    let level: '踰矩' | '親密' | '含蓄' | '無';
    if (yuHits.length > 0) level = '踰矩';
    else if (qinHits.length > 0) level = '親密';
    else if (hanHits.length > 0) level = '含蓄';
    else level = '無';
    return { level, yuHits, qinHits, hanHits };
}
// "intimacy recurs/continues" = physical closeness happened (親密 or 踰矩).
const isRecur = (lvl: string) => lvl === '踰矩' || lvl === '親密';

// Provenance detectors on the RECALLED memory set.
const INTIMATE_MEM_MARK = ['窄床', '越了線', '門道', '描眉', '縫', '宿在', '會樂里', '初夜', '天光', '身子'];
const NEVER_DARED_MARK = ['只你和師姐', '守著空台', '第三道', '越了那道線', '交了個洋行', '冷你那段', '不肯回頭', '對著空台', '藏著', '收回殼'];
function memProvenance(mems: RecalledMemory[]): { intimate: string[]; neverDared: string[] } {
    const joined = mems.map((m) => m.text);
    const intimate = joined.filter((t) => INTIMATE_MEM_MARK.some((w) => t.includes(w)));
    const neverDared = joined.filter((t) => NEVER_DARED_MARK.some((w) => t.includes(w)));
    return { intimate, neverDared };
}

// ── record types ─────────────────────────────────────────────────────────────
interface CallRecord {
    label: string;
    prose: string;
    kind: string;
    target?: string;
    recalledTexts: string[];
    classification: unknown;
}
const allRecords: CallRecord[] = [];
function logCall(rec: CallRecord): void {
    allRecords.push(rec);
    console.log(`\n[${rec.label}] kind=${rec.kind}${rec.target ? ` target=${rec.target}` : ''}`);
    console.log(`  class=${JSON.stringify(rec.classification)}`);
    console.log(`  prose: ${rec.prose}`);
}

// ── the world facts (SITUATION only — never an instruction) ──────────────────
const CAST_NAMES = ['沈雪笙', '蘇映雪', '柳生春', '江聞鶴', '連翹', '何阿喜', '金鳳'];

function rehearsalWorldFact(): string {
    return [
        '今日雲錦台戲台上排《斷橋》。',
        '班主沈雪笙昨兒放了話：從明兒起排《斷橋》，戲台，人都得到，戲得像個戲。',
        '離年底會串只剩十來天。',
        '此刻蘇映雪、江聞鶴、連翹、何阿喜都已在雲錦台戲台候著、開了嗓。',
    ].join('');
}
function nightWorldFact(partner: string, place: string): string {
    return [
        '入夜。散了戲，班裡的人都各自歸家了。',
        `${place}，一盞燈。`,
        `此處只有你和${partner}兩個人，再無旁人。`,
        '夜深，弄堂靜了下來。',
    ].join('');
}

// ── one chooseAction call with recall wiring ─────────────────────────────────
async function decide(
    agent: RunnerSceneAgent,
    recall: LocalRecall,
    self: CastMember,
    opts: {
        wants: ChooseActionInput['wants'];
        recallQueries: string[];
        worldFact: string;
        sharedLog: string[];
        playSummary: string | null;
    },
): Promise<{ res: ChooseActionResult; mems: RecalledMemory[] }> {
    // recall by each query, union top hits (mimics "what's on her mind"), cap 5.
    const seen = new Set<string>();
    const mems: RecalledMemory[] = [];
    for (const q of opts.recallQueries) {
        const hits = await retry(`recall(${self.name})`, () => recall.recall(self.name, q, 3, TODAY));
        for (const h of hits) {
            if (!seen.has(h.text)) {
                seen.add(h.text);
                mems.push(h);
            }
        }
    }
    const memSlice = mems.slice(0, 5);
    const input: ChooseActionInput = {
        name: self.name,
        persona: self.description,
        role: self.role,
        secret: self.secret,
        wants: opts.wants,
        memories: memSlice.map((m) => m.text),
        worldFact: opts.worldFact,
        sharedLog: opts.sharedLog,
        playSummary: opts.playSummary,
        castNames: CAST_NAMES,
    };
    const res = await retry(`chooseAction(${self.name})`, () => agent.chooseAction(input));
    return { res, mems: memSlice };
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    const usingRealEmbed = !!process.env.OPENAI_API_KEY;
    const provider = process.env.AI_PROVIDER ?? '(auto)';
    const model = process.env.POE_MODEL_PRIMARY ?? '(default)';
    console.log(`=== decide-by-recall ===`);
    console.log(`provider=${provider} model=${model} embeddings=${usingRealEmbed ? 'openai(real)' : 'deterministic-hash(fake)'}`);

    const cast = loadCast();
    const agent = new RunnerSceneAgent();
    const liu = cast['柳生春'];

    const probeA: { fresh: Array<ReturnType<typeof classifyRehearsal>>; sequential: Array<{ slot: number; cls: ReturnType<typeof classifyRehearsal> }> } = { fresh: [], sequential: [] };
    const probeB: {
        established: Array<{ night: number; who: string; cls: ReturnType<typeof classifyIntimacy>; prov: ReturnType<typeof memProvenance> }>;
        forbidden: Array<{ night: number; who: string; cls: ReturnType<typeof classifyIntimacy>; prov: ReturnType<typeof memProvenance> }>;
    } = { established: [], forbidden: [] };

    // ══ PROBE A — rehearsal as a real choice ════════════════════════════════
    console.log('\n\n########## PROBE A — rehearsal attendance by decision ##########');
    const A_QUERIES = ['欠金鳳一句當面的交代，該去了結這樁舊帳', '排《斷橋》上台唱戲，柳生春的本分與招牌'];
    const A_LOG = ['〔班主·開排〕從明兒起排《斷橋》，都給我到戲台。', '蘇映雪已在雲錦台戲台開了嗓。', '江聞鶴、連翹在台上走位。'];

    // A.1 — five FRESH identical runs (isolate the DECISION's stochasticity).
    //      Recall ONCE and reuse, so the 5 inputs are byte-identical; only the
    //      LLM's own call varies. This is the direct contrast to the old
    //      deterministic 4/4-absent scalar routing.
    console.log('\n--- A.1: 5 fresh identical slots ---');
    const recallA1 = await seedFresh(cast);
    // pre-recall once
    const a1seen = new Set<string>();
    const a1mems: RecalledMemory[] = [];
    for (const q of A_QUERIES) {
        const hits = await retry('recallA1', () => recallA1.recall(liu.name, q, 3, TODAY));
        for (const h of hits) if (!a1seen.has(h.text)) { a1seen.add(h.text); a1mems.push(h); }
    }
    const a1memSlice = a1mems.slice(0, 5);
    const a1Input: ChooseActionInput = {
        name: liu.name, persona: liu.description, role: liu.role, secret: liu.secret,
        wants: LIU_WANTS, memories: a1memSlice.map((m) => m.text),
        worldFact: rehearsalWorldFact(), sharedLog: A_LOG, playSummary: '《白蛇傳·斷橋》排練中，班主在場盯戲。', castNames: CAST_NAMES,
    };
    for (let i = 1; i <= 5; i++) {
        const res = await retry('chooseAction A.1', () => agent.chooseAction(a1Input));
        const cls = classifyRehearsal(res);
        probeA.fresh.push(cls);
        logCall({ label: `A.1 fresh #${i}`, prose: res.prose, kind: res.kind, target: res.target, recalledTexts: a1memSlice.map((m) => m.text), classification: cls });
    }

    // A.2 — four SEQUENTIAL slots (memory can grow; does the choice waver over days?)
    console.log('\n--- A.2: 4 sequential slots ---');
    const recallA2 = await seedFresh(cast);
    const seqLog = [...A_LOG];
    for (let slot = 1; slot <= 4; slot++) {
        const { res, mems } = await decide(agent, recallA2, liu, {
            wants: LIU_WANTS, recallQueries: A_QUERIES, worldFact: rehearsalWorldFact(),
            sharedLog: seqLog.slice(-14), playSummary: '《白蛇傳·斷橋》排練中，班主在場盯戲。',
        });
        const cls = classifyRehearsal(res);
        probeA.sequential.push({ slot, cls });
        logCall({ label: `A.2 slot ${slot}`, prose: res.prose, kind: res.kind, target: res.target, recalledTexts: mems.map((m) => m.text), classification: cls });
        // feed the outcome forward (sharedLog + a remembered one-liner)
        const outcome = cls.decision === 'skip' ? `柳生春今日沒在戲台露面。` : `柳生春今日到了戲台排《斷橋》。`;
        seqLog.push(outcome);
        await retry('remember A.2', () => recallA2.remember(liu.name, `〔排練日·第${slot}天〕${res.prose}`, { kind: 'chapter', importance: SEED_IMPORTANCE, day: TODAY }));
    }

    // ══ PROBE B — intimacy by decision + recall recurrence ══════════════════
    console.log('\n\n########## PROBE B — night intimacy by decision ##########');

    // Established: 柳生春 + 金鳳, private night. Run 5 sequential nights, driving
    // BOTH柳's and 金鳳's decision (mutual). Recall query names the partner —
    // the ONLY per-pair difference (no resistance knob).
    console.log('\n--- B.established: 柳生春 + 金鳳, 金鳳寓所, 5 nights ---');
    const recallEst = await seedFresh(cast);
    const jin = cast['金鳳'];
    const estLog = ['夜深了，弄堂靜下來。', '一盞燈下，只剩你們兩個人。'];
    const JIN_WANTS: ChooseActionInput['wants'] = [
        { layer: '執念', desc: '要柳生春當面認一句欠我的，等真拿到那句話，我留不留連自己都不知道', target: '柳生春' },
        { layer: '篤定', desc: '她的身子認得我的手，指尖一搭，那點顫瞞不過我', target: '柳生春' },
    ];
    for (let night = 1; night <= 5; night++) {
        // 柳's decision
        const liuRun = await decide(agent, recallEst, liu, {
            wants: LIU_WANTS, recallQueries: [`夜裡與金鳳單獨在一處`, `我和金鳳這些年`], worldFact: nightWorldFact('金鳳', '會樂里金鳳的寓所，窗台那盆晚香玉夜裡正香'),
            sharedLog: estLog.slice(-14), playSummary: null,
        });
        const liuCls = classifyIntimacy(liuRun.res);
        const liuProv = memProvenance(liuRun.mems);
        probeB.established.push({ night, who: '柳生春', cls: liuCls, prov: liuProv });
        logCall({ label: `B.est night ${night} 柳生春`, prose: liuRun.res.prose, kind: liuRun.res.kind, target: liuRun.res.target, recalledTexts: liuRun.mems.map((m) => m.text), classification: { ...liuCls, intimateMemsSurfaced: liuProv.intimate.length } });
        // 金鳳's decision (mutual view)
        const jinRun = await decide(agent, recallEst, jin, {
            wants: JIN_WANTS, recallQueries: [`夜裡與柳生春單獨在一處`, `柳生春欠我的那句話`], worldFact: nightWorldFact('柳生春', '你自己的寓所，窗台那盆晚香玉夜裡正香'),
            sharedLog: estLog.slice(-14), playSummary: null,
        });
        const jinCls = classifyIntimacy(jinRun.res);
        probeB.established.push({ night, who: '金鳳', cls: jinCls, prov: memProvenance(jinRun.mems) });
        logCall({ label: `B.est night ${night} 金鳳`, prose: jinRun.res.prose, kind: jinRun.res.kind, target: jinRun.res.target, recalledTexts: jinRun.mems.map((m) => m.text), classification: jinCls });
        // feed forward
        estLog.push(`夜裡，柳生春與金鳳獨處了一宿。`);
        await retry('remember est 柳', () => recallEst.remember(liu.name, `〔會樂里·夜〕${liuRun.res.prose}`, { kind: 'chapter', importance: SEED_IMPORTANCE, day: TODAY }));
        await retry('remember est 金', () => recallEst.remember(jin.name, `〔會樂里·夜〕${jinRun.res.prose}`, { kind: 'chapter', importance: SEED_IMPORTANCE, day: TODAY }));
    }

    // Forbidden: 柳生春 + 蘇映雪, same private-night setup, 柳's decision. 5 nights.
    console.log('\n--- B.forbidden: 柳生春 + 蘇映雪, 二樓書寓, 5 nights ---');
    const recallForb = await seedFresh(cast);
    const forbLog = ['夜深了，弄堂靜下來。', '一盞燈下，只剩你們兩個人。'];
    for (let night = 1; night <= 5; night++) {
        const liuRun = await decide(agent, recallForb, liu, {
            wants: LIU_WANTS, recallQueries: [`夜裡與師姐蘇映雪單獨在一處`, `我和師姐蘇映雪這些年`], worldFact: nightWorldFact('師姐蘇映雪', '蘇映雪二樓書寓'),
            sharedLog: forbLog.slice(-14), playSummary: null,
        });
        const cls = classifyIntimacy(liuRun.res);
        const prov = memProvenance(liuRun.mems);
        probeB.forbidden.push({ night, who: '柳生春', cls, prov });
        logCall({ label: `B.forb night ${night} 柳生春`, prose: liuRun.res.prose, kind: liuRun.res.kind, target: liuRun.res.target, recalledTexts: liuRun.mems.map((m) => m.text), classification: { ...cls, neverDaredMemsSurfaced: prov.neverDared.length } });
        forbLog.push(`夜裡，柳生春與師姐蘇映雪在書寓獨處。`);
        await retry('remember forb 柳', () => recallForb.remember(liu.name, `〔書寓·夜〕${liuRun.res.prose}`, { kind: 'chapter', importance: SEED_IMPORTANCE, day: TODAY }));
    }

    // ── mechanical summary ───────────────────────────────────────────────────
    const aFreshGo = probeA.fresh.filter((c) => c.decision === 'go').length;
    const aFreshSkip = probeA.fresh.filter((c) => c.decision === 'skip').length;
    const aFreshUnclear = probeA.fresh.filter((c) => c.decision === 'unclear').length;
    const aSeqGo = probeA.sequential.filter((s) => s.cls.decision === 'go').length;
    const aSeqSkip = probeA.sequential.filter((s) => s.cls.decision === 'skip').length;
    const aSeqUnclear = probeA.sequential.filter((s) => s.cls.decision === 'unclear').length;

    const estLiu = probeB.established.filter((r) => r.who === '柳生春');
    const estRecur = estLiu.filter((r) => isRecur(r.cls.level)).length;
    const estIntimateProv = estLiu.filter((r) => r.prov.intimate.length > 0).length;
    const forbRecur = probeB.forbidden.filter((r) => isRecur(r.cls.level)).length;
    const forbNeverDaredProv = probeB.forbidden.filter((r) => r.prov.neverDared.length > 0).length;

    console.log('\n\n================= MECHANICAL SUMMARY =================');
    console.log(`PROBE A fresh (n=${probeA.fresh.length}):  go=${aFreshGo}  skip=${aFreshSkip}  unclear=${aFreshUnclear}   (old scalar gate = 4/4 skip, never waver)`);
    console.log(`PROBE A sequential (n=${probeA.sequential.length}): go=${aSeqGo} skip=${aSeqSkip} unclear=${aSeqUnclear}`);
    console.log(`PROBE B established 柳生春 (n=${estLiu.length}): intimacy-recurs=${estRecur}/${estLiu.length}  intimate-mem-surfaced=${estIntimateProv}/${estLiu.length}`);
    console.log(`PROBE B forbidden 柳生春 (n=${probeB.forbidden.length}): intimacy-recurs=${forbRecur}/${probeB.forbidden.length}  never-dared-mem-surfaced=${forbNeverDaredProv}/${probeB.forbidden.length}`);

    // ── write raw log + report ────────────────────────────────────────────────
    fs.writeFileSync(path.join(OUT_DIR, 'raw-log.json'), JSON.stringify({ meta: { provider, model, usingRealEmbed }, probeA, probeB, records: allRecords }, null, 2));

    const report = buildReport({
        provider, model, usingRealEmbed,
        aFreshGo, aFreshSkip, aFreshUnclear, aSeqGo, aSeqSkip, aSeqUnclear,
        estLiu, estRecur, estIntimateProv, forbRecur, forbNeverDaredProv,
        probeB, allRecords,
    });
    fs.writeFileSync(path.join(OUT_DIR, 'report.md'), report);
    console.log(`\nwrote ${path.join(OUT_DIR, 'report.md')} and raw-log.json`);
}

// ── report builder ───────────────────────────────────────────────────────────
function rec(label: string): CallRecord | undefined {
    return allRecords.find((r) => r.label === label);
}
function findFirst(pred: (r: CallRecord) => boolean): CallRecord | undefined {
    return allRecords.find(pred);
}
function buildReport(d: any): string {
    const estBeats = allRecords.filter((r) => r.label.includes('B.est') && r.label.includes('柳生春'));
    const forbBeats = allRecords.filter((r) => r.label.includes('B.forb'));
    const recurEst = estBeats.find((r) => isRecur((r.classification as any).level));
    const holdForb = forbBeats.find((r) => !isRecur((r.classification as any).level));
    const freshGoRec = allRecords.find((r) => r.label.startsWith('A.1') && (r.classification as any).decision === 'go');
    const freshSkipRec = allRecords.find((r) => r.label.startsWith('A.1') && (r.classification as any).decision === 'skip')
        ?? allRecords.find((r) => r.label.startsWith('A.2') && (r.classification as any).decision === 'skip');
    const quote = (r?: CallRecord) => (r ? `> **[${r.label}]** (kind=${r.kind}${r.target ? `, target=${r.target}` : ''})\n>\n> ${r.prose}` : '_(none in this run)_');
    const memList = (r?: CallRecord) => (r ? r.recalledTexts.map((t) => `>   · ${t}`).join('\n') : '');

    return `# decide-by-recall — report

Replace TWO mechanical gates (rehearsal scalar-routing; night-intimacy heat-edge)
with the character's own \`chooseAction\` decision, informed by \`recall\`. One
mechanism, both probes, both pairs; the ONLY per-pair difference is the recalled
memories (seeded from \`spring-snow.json\`) and the partner's name in the recall
query. §2.43: the prompt presents the SITUATION + persona/secret/wants/recalled
memories and asks what she does — it never says skip / restrain / have sex.

- provider=\`${d.provider}\`  model=\`${d.model}\`  embeddings=\`${d.usingRealEmbed ? 'openai text-embedding-3-small (real relevance)' : 'deterministic hash vectors (fake — relevance crude)'}\`
- classification = keyword lexicons only (§2.47). No LLM judged "good".

## Probe A — rehearsal attendance as a real choice

Old mechanism: \`computeRehearsalRouting\` — a hot want weight (0.72) > \`attendW\`
(0.6) → 柳生春 routed to 金鳳's place, **absent 4/4, never wavers, reads nothing.**

New mechanism: \`chooseAction\` given the 班主 milestone (排《斷橋》，戲台，該到),
her live wants (incl the 金鳳 debt), her recalled memories, and who is already at
the 戲台. She decides.

| run | go | skip | unclear |
|---|---|---|---|
| A.1 five FRESH identical slots (recall reused, byte-identical input) | ${d.aFreshGo} | ${d.aFreshSkip} | ${d.aFreshUnclear} |
| A.2 four SEQUENTIAL slots (memory grows) | ${d.aSeqGo} | ${d.aSeqSkip} | ${d.aSeqUnclear} |

**Wavering** = NOT 5/5 (or 4/4) one way. Contrast: old gate = 4/4 skip, invariant.

### A verbatim — a GO decision
${quote(freshGoRec)}

recalled into that decision:
${memList(freshGoRec)}

### A verbatim — a SKIP decision (grounded in what she owes?)
${quote(freshSkipRec)}

recalled into that decision:
${memList(freshSkipRec)}

## Probe B — intimacy by decision + recall recurrence

Old mechanism: 床戲 gated on a love-want's heat crossing an \`edge\` → ~0 trysts.
New mechanism: private night, alone together; \`chooseAction\` reads persona +
secret + RECALLED memories + the private setting → decides. Same mechanism for
both pairs; recall query names the partner (no resistance knob).

Intimacy level by keyword: 踰矩 > 親密 > 含蓄 > 無. "Recurs/continues" = 親密 or 踰矩.

| pair | intimacy recurs | intimate-mem surfaced | never-dared-mem surfaced |
|---|---|---|---|
| **established** 柳生春+金鳳 (柳's decision, n=${d.estLiu.length}) | ${d.estRecur}/${d.estLiu.length} | ${d.estIntimateProv}/${d.estLiu.length} | — |
| **forbidden** 柳生春+蘇映雪 (柳's decision, n=${d.probeB.forbidden.length}) | ${d.forbRecur}/${d.probeB.forbidden.length} | — | ${d.forbNeverDaredProv}/${d.probeB.forbidden.length} |

Established recurrence should be materially higher than forbidden if the reframe
works — and the difference must come from the recalled memory, not a knob.

### B verbatim — established night that RECURS
${quote(recurEst)}

recalled into that decision (intimate memory should be present):
${memList(recurEst)}

### B verbatim — forbidden night that HOLDS BACK
${quote(holdForb)}

recalled into that decision (never-dared memory should be present):
${memList(holdForb)}

## Per-night detail (Probe B, 柳生春)

**Established (柳生春+金鳳):**
${d.probeB.established.filter((r: any) => r.who === '柳生春').map((r: any) => `- night ${r.night}: level=**${r.cls.level}** recurs=${isRecur(r.cls.level)} intimateMem=${r.prov.intimate.length}`).join('\n')}

**Forbidden (柳生春+蘇映雪):**
${d.probeB.forbidden.map((r: any) => `- night ${r.night}: level=**${r.cls.level}** recurs=${isRecur(r.cls.level)} neverDaredMem=${r.prov.neverDared.length}`).join('\n')}

## Honest read

_(filled by the operator after reading the run; the numbers above are mechanical.)_
`;
}

main().catch((err) => {
    console.error('FATAL', err);
    process.exit(1);
});
