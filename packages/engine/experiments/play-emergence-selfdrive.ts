/**
 * Play-emergence self-drive — ONE decoupled real-LLM experiment.
 *
 * THE ONE QUESTION
 * ----------------
 * Does a collective new play (排新戲) self-organize from open-ended character
 * agency + a season goal, WITHOUT anyone scripting it? This is the load-bearing
 * bet of the whole "season" concept (SEASON_ONE_SLICE.md §1/§3): if a play does
 * not reliably emerge from open agency, everything downstream (box-office, weave)
 * is moot. We test JUST this — no scene/dialogue loop, no box-office, no
 * storyteller weave, no snapshot.
 *
 * SETUP (decoupling discipline, §2.43 "never write the answer")
 * ------------------------------------------------------------
 * - 5 troupe members (real persona/secret/first-3 memories from spring-snow.json):
 *   沈雪笙(班主) 柳安春(小生) 蘇映雪(花旦) 江聞鶴(小生) 連翹(刀馬旦).
 * - Genesis wants derived once per char via runner deriveGenesisWants (WITH secret
 *   + a sagaPremise summarizing the season situation), capped 3 each.
 * - A season WORLD-FACT (prologue essence + the deadline line) is injected VERBATIM
 *   into every character's context every tick, as a state-of-the-world FACT — never
 *   an instruction. The deadline day-count decrements each tick.
 * - Shared visible state each tick: a short running log of what everyone has been
 *   doing + the current state of any 新戲-in-progress, so characters see and react
 *   to each other's moves.
 *
 * THE LOOP (open action, 8 ticks, deadline at tick 8)
 * ---------------------------------------------------
 * Each tick, each character makes ONE open-action call: given persona+secret+wants
 * +season world-fact+shared log, they say IN FIRST PERSON, in FREE TEXT (no menu,
 * no options), what they do this tick toward what they want. The prompt NEVER
 * mentions 排新戲 / 組織一齣戲 / propose a play, nor otherwise hints that making a
 * play is the expected move — it only states the season facts and asks what they do.
 *
 * Each action is then classified IN CODE (mechanical, keyword/rule-based) into:
 *   propose-play / join-play / write-or-compose / rehearse / personal.
 * A shared 新戲 object grows accordingly. Personal actions (chasing love/rivalry
 * instead of the play) are logged and COUNT as valid — never penalized or redirected.
 *
 * JUDGING — mechanical counters only, NO LLM judging of success. The action
 * classifier is deterministic regex on the verbatim text; every action is printed
 * verbatim in the report so the classification is human-auditable. Success is a
 * code predicate. The optional per-tick want-rewrite is deliberately SKIPPED to
 * keep exactly one mechanism under test (open action + shared state) and to leave
 * budget headroom so both runs complete.
 *
 * Run (from packages/engine):
 *   POE_API_KEY=… AI_PROVIDER=poe ./node_modules/.bin/tsx experiments/play-emergence-selfdrive.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { text as llmText } from '@endless-story/llm';
import { RunnerSceneAgent } from '../src/adapters/runner-scene-agent.ts';
import type { GenesisWant } from '../src/ports.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Retry helper — 4 attempts, increasing backoff. Transient ETIMEDOUT is a known
// gotcha; every LLM call in this script goes through here.
// ─────────────────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const wait = 800 * (attempt + 1) * (attempt + 1); // 0.8s, 3.2s, 7.2s, 12.8s
            console.warn(
                `[retry] ${label} attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : err}; waiting ${wait}ms`,
            );
            if (attempt < 3) await sleep(wait);
        }
    }
    throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cast (real persona/secret/first-3 memories from spring-snow.json).
// ─────────────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORY_PATH = path.resolve(__dirname, '../../cli/scripts/stories/spring-snow.json');
const story = JSON.parse(fs.readFileSync(STORY_PATH, 'utf8'));

const CAST_NAMES = ['沈雪笙', '柳安春', '蘇映雪', '江聞鶴', '連翹'];
type Persona = {
    name: string;
    role: string;
    gender?: string;
    ageYears?: number;
    description: string;
    secret?: string;
    memories: string[];
};
const personas: Record<string, Persona> = {};
for (const n of CAST_NAMES) {
    const c = story.founding_cast.find((x: any) => x.name === n);
    if (!c) throw new Error(`cast member not found in spring-snow.json: ${n}`);
    personas[n] = {
        name: c.name,
        role: c.role,
        gender: c.gender,
        ageYears: c.ageYears,
        description: c.description,
        secret: c.secret,
        memories: (c.memories ?? []).slice(0, 3),
    };
}
const SAGA_DESC: string = story.saga?.description ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// Season world-fact. Prologue essence (SEASON_ONE_SLICE §6, world-facts only) +
// the deadline line injected VERBATIM (deadline day-count decrements per tick).
// Neither states that a play should be made — they only describe the world.
// ─────────────────────────────────────────────────────────────────────────────
const PROLOGUE_ESSENCE = [
    '春雪社這座戲台原是清末一位官紳家的堂會戲台,改朝換代後排場散了,沈雪笙盤下這方連著半進院子的戲台,掛上春雪社的水牌;正樑上那塊燙金字暗了的舊匾,她一直沒換。',
    '戲台最裡頭的後台,那幾口樟木戲箱落了十五年的灰。十五年前沈雪笙封箱那日,班裡如今台前這批人多半還是孩子;她沒對任何人交代緣由,只說往後這幾箱小生的行頭不再動了。班子靠著幾齣熟戲一年年過來,台下的人換了一批又一批,戲單卻還是那張戲單。',
    '今年不同。霞飛路那頭新起的戲園放出話來,年底要辦一場打對台的大會串。掛得上名的班子,往後的檔期、報上的版面、堂會的邀約,都在這一場上見高低;掛不上的,慢慢就沒人記得了。',
    '沈雪笙把那口最底下的箱子開了一條縫。裡頭壓著的,除了那幾件沒人再穿的小生戲衣,還有一只早停了的懷錶。',
].join('\n');

const DEADLINE_LINE = (daysLeft: number) =>
    `戲箱十五年來頭一遭要重開;霞飛路新戲園年底辦打對台大會串,掛不上名的班子往後沒人記得;距會串還有 ${daysLeft} 天`;

const TICKS = 8;
const daysLeft = (tick: number) => (TICKS + 1 - tick) * 15; // t1=120 … t8=15

function worldFact(tick: number): string {
    return `${PROLOGUE_ESSENCE}\n${DEADLINE_LINE(daysLeft(tick))}`;
}

// sagaPremise for genesis: the saga plus a summary of the season situation (facts,
// not an instruction to make a play). Resistance derives from these facts (§2.42).
const SAGA_PREMISE = [
    SAGA_DESC,
    '這一季:霞飛路新起的戲園年底要辦一場打對台的大會串,掛得上名的班子往後拿檔期、報上的版面、堂會的邀約,掛不上的慢慢沒人記得。班主沈雪笙把塵封十五年、當年親手封起的那口小生戲箱,開了一條縫;箱底除了沒人再穿的小生戲衣,還壓著一只早停了的懷錶。',
].join('\n');

// ─────────────────────────────────────────────────────────────────────────────
// Genesis wants — one derive per character (with secret + sagaPremise), cap 3.
// ─────────────────────────────────────────────────────────────────────────────
const rsa = new RunnerSceneAgent();

async function deriveWantsFor(n: string): Promise<GenesisWant[]> {
    const p = personas[n];
    const call = () =>
        rsa.deriveGenesisWants({
            name: p.name,
            role: p.role,
            gender: p.gender,
            ageYears: p.ageYears,
            description: p.description,
            secret: p.secret,
            sagaPremise: SAGA_PREMISE,
            castNames: CAST_NAMES,
        });
    let g = await withRetry(`genesis:${n}`, call);
    if (g.length === 0) g = await withRetry(`genesis-retry:${n}`, call); // one extra shot
    return g.slice(0, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// Open-action call. FREE TEXT, first person. The prompt states the season facts
// and asks what the character does — it NEVER mentions 排新戲/組織一齣戲/propose a
// play or otherwise hints that making a play is the expected move.
// ─────────────────────────────────────────────────────────────────────────────
function actionSystemPrompt(): string {
    return [
        '你在扮演一個戲園裡的人。給你這個人是誰、心底藏著什麼、心裡此刻掛著的幾件事、眼下這世道的光景,以及近來班裡發生的事。',
        '',
        '用**第一人稱**寫下 TA 這一刻決定做什麼、為什麼。',
        '**鐵則**:',
        '1. 寫一個**具體的動作**:去找誰、說了什麼、動手做什麼——像日子裡真的做出來的一件事,不是空泛的心情或決心。',
        '2. 只寫 TA **自己**這一刻的行動。不要替別人做決定,不要當旁白交代全班的事。',
        '3. 順著 TA 的性子與心事走。做什麼由 TA 自己定,沒有標準答案。',
        '4. 50 到 120 字。只輸出這段話,不要標題、不要引號、不要解釋。',
    ].join('\n');
}

function actionUserPrompt(
    n: string,
    wants: GenesisWant[],
    tick: number,
    sharedLog: string[],
    playSummary: string | null,
): string {
    const p = personas[n];
    const wantLines = wants.length
        ? wants.map((w) => `- [${w.layer}] ${w.desc}${w.target ? `（心裡掛著${w.target}）` : ''}`).join('\n')
        : '（暫時沒有特別掛心的事）';
    const memLines = p.memories.length ? p.memories.map((m) => `- ${m}`).join('\n') : '';
    const logBlock = sharedLog.length ? sharedLog.join('\n') : '（還沒什麼動靜。）';
    return [
        `# 你是誰`,
        `${p.name}（${p.role}·${p.gender ?? ''}·${p.ageYears ?? ''}歲）:${p.description}`,
        p.secret ? `\n# 你心底的事（只有你自己知道）\n${p.secret}` : '',
        memLines ? `\n# 你還記著的幾件舊事\n${memLines}` : '',
        `\n# 你此刻心裡掛著的事\n${wantLines}`,
        `\n# 眼下這世道（這些都是已經發生、擺在眼前的事實）\n${worldFact(tick)}`,
        `\n# 近來班裡發生的事\n${logBlock}`,
        playSummary ? `\n# 眼下班裡手邊這樁\n${playSummary}` : '',
        `\n此刻,你（${p.name}）決定做什麼?`,
    ]
        .filter(Boolean)
        .join('\n');
}

async function actOpen(
    n: string,
    wants: GenesisWant[],
    tick: number,
    sharedLog: string[],
    playSummary: string | null,
): Promise<string> {
    const client = llmText.createTextClient({ kind: 'primary' });
    const res = await withRetry(`act:${n}:t${tick}`, () =>
        client.chat({
            model: client.defaultModel,
            system: actionSystemPrompt(),
            messages: [{ role: 'user', content: actionUserPrompt(n, wants, tick, sharedLog, playSummary) }],
            maxTokens: 320,
            temperature: 0.85,
        }),
    );
    return res.text.trim().replace(/\s+/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Mechanical action classifier (deterministic regex on the verbatim text).
//   propose-play  — initiate a NEW collective play (open the 戲箱, 排一齣新戲, …)
//   write-or-compose — write/compose a script fragment (寫詞/編劇/譜腔/寫本子…)
//   rehearse      — 排練/對戲/走戲 an existing play
//   join-play     — throw in with an existing proposed play (入夥/算我/搭這齣…)
//   personal      — anything else (練功/尋人/放電/私事), a VALID outcome
// Ambiguity is resolved by play state: joins/rehearsals only register against a
// play that already existed at the START of the tick (what the character actually
// saw in the shared log) — this separates spontaneous parallel initiation from
// genuine reactive joining. Every action is printed verbatim so this is auditable.
// ─────────────────────────────────────────────────────────────────────────────
const RE_PROPOSE =
    /(重開|開起|開了|開一|掀開|打開|啟開|開啟).{0,5}(戲箱|箱子|樟木|那口箱|底下.{0,2}箱|箱)|排.{0,4}新戲|排.{0,3}(一)?[齣出場].{0,5}新|起.{0,3}(一)?[齣出].{0,4}新?戲|編.{0,3}(一)?[齣出].{0,4}新?戲|排出.{0,4}戲|重起爐灶|重排.{0,4}戲|挑.{0,3}(一)?[齣出].{0,4}戲.{0,6}[排演做]|召集.{0,8}[排戲]|商量.{0,6}(排|新戲|戲碼)|定.{0,3}戲碼|排一[齣出]|排[齣出]|排場新戲|要排.{0,3}戲|排新|出一[齣出]新|做一[齣出]新?戲/;
const RE_WRITE =
    /寫詞|填詞|寫本|寫劇|編劇|譜曲|譜.{0,2}(新)?腔|編腔|度曲|編排.{0,4}(戲|身段|唱|詞)|寫.{0,3}(一)?[段齣場折].{0,3}(戲|詞|本)|擬.{0,3}本|改.{0,2}本子?|想.{0,2}(戲|橋段|折子)|編.{0,3}(一)?[段折場]|寫戲文|寫一段|排本子/;
const RE_REHEARSE =
    /排練|對戲|走位|走一遍|走一趟|對一?遍|對詞|響排|合樂|合排|合演|磨戲|排一排|排這|排那|把.{0,4}排一?[遍趟]|排幾|排了|排上|再排|排到|排熟|串排|排這齣|排那齣/;
const RE_JOIN =
    /入夥|入伙|加入|我也.{0,2}[演上來算]|我來演|願.{0,3}演|願意.{0,4}(這)?戲|搭.{0,2}(這|那)?.{0,2}[齣戲]|參.{0,2}(一)?角|應下.{0,4}戲|算我一?[個份]|算上我|我也算|讓我.{0,3}[演上排]|求.{0,4}(一)?(個)?角|討.{0,3}(個)?角色|要.{0,3}(一)?(個)?角色|同.{0,3}排/;

type ActionClass = 'propose-play' | 'join-play' | 'write-or-compose' | 'rehearse' | 'personal';

function classify(text: string, playExistedAtStart: boolean, actorInCast: boolean): ActionClass {
    const propose = RE_PROPOSE.test(text);
    const write = RE_WRITE.test(text);
    const rehearse = RE_REHEARSE.test(text);
    const join = RE_JOIN.test(text);
    if (!playExistedAtStart) {
        // No play visible yet: only an initiating act counts. A "join"/"rehearse"
        // flavoured line can't be reacting to a play nobody has seen → personal.
        if (propose) return 'propose-play';
        if (write) return 'write-or-compose';
        return 'personal';
    }
    // A play was visible in the shared log at the start of this tick.
    if (write) return 'write-or-compose';
    if (rehearse) return 'rehearse';
    if (join) return 'join-play';
    if (propose) return actorInCast ? 'rehearse' : 'join-play';
    return 'personal';
}

const PLAY_DIRECTED: ActionClass[] = ['propose-play', 'join-play', 'write-or-compose', 'rehearse'];

// ─────────────────────────────────────────────────────────────────────────────
// Shared 新戲 object + per-run accumulation.
// ─────────────────────────────────────────────────────────────────────────────
interface PlayState {
    proposer: string;
    proposedTick: number;
    createdVia: 'propose' | 'write';
    cast: Set<string>;
    fragments: Array<{ tick: number; author: string; text: string }>;
    rehearsals: Array<{ tick: number; who: string }>;
}
interface ActionRec {
    tick: number;
    actor: string;
    text: string;
    cls: ActionClass;
}
interface PlayTimeline {
    tick: number;
    event: string; // human-readable growth event
    castSize: number;
    fragments: number;
    rehearsals: number;
}
interface RunResult {
    run: number;
    genesis: Record<string, GenesisWant[]>;
    actions: ActionRec[]; // all ticks
    play: PlayState | null;
    timeline: PlayTimeline[];
    castSizeByTick: number[]; // cumulative cast size after each tick
    fragmentsByTick: number[];
    rehearsalsByTick: number[];
    completed: boolean; // did all 8 ticks run
}

function createPlay(actor: string, tick: number, via: 'propose' | 'write'): PlayState {
    return { proposer: actor, proposedTick: tick, createdVia: via, cast: new Set([actor]), fragments: [], rehearsals: [] };
}

function playSummaryLine(play: PlayState | null): string | null {
    if (!play) return null;
    const cast = [...play.cast].join('、');
    return [
        `班裡正張羅一齣新戲(第 ${play.proposedTick} 拍由 ${play.proposer} 起的頭)。`,
        `目前搭夥的人:${cast || '（還只有起頭的人）'}。`,
        `攢下的戲文/唱段片段:${play.fragments.length} 段。`,
        `一起走過戲的次數:${play.rehearsals.length} 回。`,
    ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// One run (fresh genesis each run). Mutates `res` in place so partial data
// survives a mid-run failure.
// ─────────────────────────────────────────────────────────────────────────────
async function runOnce(run: number, res: RunResult): Promise<void> {
    console.log(`\n=== RUN ${run}: deriving genesis wants ===`);
    for (const n of CAST_NAMES) {
        res.genesis[n] = await deriveWantsFor(n);
        console.log(`[genesis r${run}] ${n}: ${res.genesis[n].map((g) => g.desc).join(' / ') || '(none)'}`);
    }

    const sharedLog: string[] = [];
    for (let tick = 1; tick <= TICKS; tick++) {
        const playExistedAtStart = !!res.play;
        const summary = playSummaryLine(res.play);
        // All 5 act in parallel off the SAME pre-tick shared state (nobody sees
        // this tick's moves while deciding — that is next tick's log).
        const texts = await Promise.all(
            CAST_NAMES.map((n) => actOpen(n, res.genesis[n] ?? [], tick, sharedLog, summary)),
        );

        // Classify against START-of-tick play state.
        const acts: ActionRec[] = CAST_NAMES.map((n, i) => ({
            tick,
            actor: n,
            text: texts[i],
            cls: classify(texts[i], playExistedAtStart, res.play?.cast.has(n) ?? false),
        }));
        res.actions.push(...acts);

        // Apply to the shared 新戲 object (cast order = deterministic).
        for (const a of acts) {
            switch (a.cls) {
                case 'propose-play':
                    if (!res.play) {
                        res.play = createPlay(a.actor, tick, 'propose');
                        res.timeline.push({ tick, event: `${a.actor} 起頭排一齣新戲（propose）`, ...playCounts(res.play) });
                    } else if (res.play.proposer !== a.actor) {
                        res.play.cast.add(a.actor);
                        res.timeline.push({ tick, event: `${a.actor} 同聲起頭（並行 propose → 併入）`, ...playCounts(res.play) });
                    }
                    break;
                case 'write-or-compose': {
                    if (!res.play) {
                        res.play = createPlay(a.actor, tick, 'write');
                        res.timeline.push({ tick, event: `${a.actor} 動筆寫本子（write → 起頭）`, ...playCounts(res.play) });
                    }
                    res.play.fragments.push({ tick, author: a.actor, text: a.text });
                    res.play.cast.add(a.actor);
                    res.timeline.push({ tick, event: `${a.actor} 添了一段戲文/唱段（+1 片段）`, ...playCounts(res.play) });
                    break;
                }
                case 'join-play':
                    if (res.play && !res.play.cast.has(a.actor)) {
                        res.play.cast.add(a.actor);
                        res.timeline.push({ tick, event: `${a.actor} 入夥（+1 選角）`, ...playCounts(res.play) });
                    }
                    break;
                case 'rehearse':
                    if (res.play) {
                        res.play.rehearsals.push({ tick, who: a.actor });
                        res.play.cast.add(a.actor);
                        res.timeline.push({ tick, event: `${a.actor} 排了一回（+1 排練）`, ...playCounts(res.play) });
                    }
                    break;
                case 'personal':
                    break;
            }
        }

        // Roll the shared log (verbatim gist, last 12 entries).
        for (const a of acts) sharedLog.push(`【第${tick}拍】${a.actor}:${a.text.slice(0, 48)}${a.text.length > 48 ? '…' : ''}`);
        while (sharedLog.length > 12) sharedLog.shift();

        // Snapshot counters.
        res.castSizeByTick.push(res.play?.cast.size ?? 0);
        res.fragmentsByTick.push(res.play?.fragments.length ?? 0);
        res.rehearsalsByTick.push(res.play?.rehearsals.length ?? 0);
        const mix = acts.map((a) => a.cls[0] === 'p' && a.cls !== 'propose-play' ? 'personal' : a.cls).join(',');
        console.log(
            `[run ${run}] tick ${tick} (距會串${daysLeft(tick)}天) — cast ${res.play?.cast.size ?? 0}, frag ${res.play?.fragments.length ?? 0}, reh ${res.play?.rehearsals.length ?? 0} | ${acts.map((a) => `${a.actor[0]}=${a.cls}`).join(' ')}`,
        );
    }
    res.completed = true;
}

function playCounts(play: PlayState): { castSize: number; fragments: number; rehearsals: number } {
    return { castSize: play.cast.size, fragments: play.fragments.length, rehearsals: play.rehearsals.length };
}

async function runWithRestart(run: number): Promise<RunResult> {
    const mk = (): RunResult => ({
        run,
        genesis: {},
        actions: [],
        play: null,
        timeline: [],
        castSizeByTick: [],
        fragmentsByTick: [],
        rehearsalsByTick: [],
        completed: false,
    });
    let res = mk();
    try {
        await runOnce(run, res);
        return res;
    } catch (err) {
        console.warn(`[run ${run}] died after retries: ${err instanceof Error ? err.message : err}. Restarting once.`);
    }
    res = mk();
    try {
        await runOnce(run, res);
    } catch (err) {
        console.warn(`[run ${run}] died again: ${err instanceof Error ? err.message : err}. Reporting partial data.`);
    }
    return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Counters (all mechanical — no LLM judging of success).
// ─────────────────────────────────────────────────────────────────────────────
interface Counters {
    proposalEmerged: boolean;
    proposalTick: number | null;
    proposer: string | null;
    createdVia: 'propose' | 'write' | null;
    proposerIsBanzhu: boolean;
    castJoined: number; // distinct cast by end
    fragments: number;
    rehearsals: number;
    performanceReady: boolean;
    outcome: 'ready' | 'fizzled' | 'never-formed';
    mix: Record<ActionClass, number>;
    playDirected: number;
    personal: number;
    totalActions: number;
}

function computeCounters(res: RunResult): Counters {
    const mix: Record<ActionClass, number> = {
        'propose-play': 0,
        'join-play': 0,
        'write-or-compose': 0,
        rehearse: 0,
        personal: 0,
    };
    for (const a of res.actions) mix[a.cls]++;
    const playDirected = PLAY_DIRECTED.reduce((s, k) => s + mix[k], 0);
    const personal = mix.personal;
    const play = res.play;
    const fragments = play?.fragments.length ?? 0;
    const rehearsals = play?.rehearsals.length ?? 0;
    const castJoined = play?.cast.size ?? 0;
    const performanceReady = !!play && fragments >= 1 && castJoined >= 2 && rehearsals >= 1;
    const outcome: Counters['outcome'] = !play ? 'never-formed' : performanceReady ? 'ready' : 'fizzled';
    return {
        proposalEmerged: !!play,
        proposalTick: play?.proposedTick ?? null,
        proposer: play?.proposer ?? null,
        createdVia: play?.createdVia ?? null,
        proposerIsBanzhu: play?.proposer === '沈雪笙',
        castJoined,
        fragments,
        rehearsals,
        performanceReady,
        outcome,
        mix,
        playDirected,
        personal,
        totalActions: res.actions.length,
    };
}

// Unprompted verification: the action prompt (tick 1, no play) must contain none
// of the forbidden play-suggesting tokens. Computed on the ACTUAL prompt strings.
// NOTE: the required-verbatim world-fact names the rival venue "霞飛路新戲園" (a
// place — a new theatre HOUSE), whose substring "新戲" is NOT a "make a new play"
// hint. We neutralise that venue token first so the check measures genuine
// play-MAKING hints, then still scan for a standalone "新戲" (a new play).
const FORBIDDEN = ['排新戲', '組織一齣戲', '排一齣', '提議', 'propose', 'play', '排戲', '組班', '新戲'];
function unpromptedCheck(): { clean: boolean; hits: string[] } {
    const raw = actionSystemPrompt() + '\n' + actionUserPrompt('沈雪笙', [], 1, [], null);
    const sample = raw.split('新戲園').join('＿園＿'); // venue name is a world-fact place, not a play hint
    const hits = FORBIDDEN.filter((tok) => sample.includes(tok));
    return { clean: hits.length === 0, hits };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────
const CLS_ZH: Record<ActionClass, string> = {
    'propose-play': '提議排戲',
    'join-play': '入夥',
    'write-or-compose': '寫詞/編排',
    rehearse: '排練',
    personal: '私事/自顧',
};

function runSection(res: RunResult, c: Counters): string {
    const L: string[] = [];
    L.push(`## Run ${res.run}`);
    L.push('');
    L.push(res.completed ? '_(completed all 8 ticks)_' : '_(PARTIAL — run did not complete)_');
    L.push('');
    L.push('### Genesis wants (this run)');
    for (const n of CAST_NAMES) {
        L.push(`- **${n}**: ` + (res.genesis[n]?.map((w) => `[${w.layer}] ${w.desc}${w.target ? `→${w.target}` : ''}`).join('　｜　') || '(none)'));
    }
    L.push('');
    L.push('### Tick-by-tick actions (verbatim + classification)');
    L.push('');
    L.push('| 拍 | 距會串 | 角色 | 分類 | 動作（逐字） |');
    L.push('|---|---|---|---|---|');
    for (const a of res.actions) {
        const safe = a.text.replace(/\|/g, '/').replace(/\n/g, ' ');
        L.push(`| ${a.tick} | ${daysLeft(a.tick)}天 | ${a.actor} | ${CLS_ZH[a.cls]} | ${safe} |`);
    }
    L.push('');
    L.push('### 新戲 growth timeline');
    if (res.timeline.length === 0) {
        L.push('_(no 新戲 ever formed)_');
    } else {
        L.push('');
        L.push('| 拍 | 事件 | 選角數 | 片段 | 排練 |');
        L.push('|---|---|---|---|---|');
        for (const t of res.timeline) L.push(`| ${t.tick} | ${t.event} | ${t.castSize} | ${t.fragments} | ${t.rehearsals} |`);
    }
    L.push('');
    L.push('### Counters');
    L.push('');
    L.push(`- 排新戲 proposal emerged: **${c.proposalEmerged ? 'YES' : 'NO'}**` + (c.proposalEmerged ? ` — tick ${c.proposalTick}, by ${c.proposer} (${c.proposerIsBanzhu ? '班主' : '非班主'}), via ${c.createdVia}` : ''));
    L.push(`- Cast joined (distinct, by end): **${c.castJoined}**　｜　cast size by tick: ${res.castSizeByTick.join(' → ')}`);
    L.push(`- Script fragments: **${c.fragments}**　｜　by tick: ${res.fragmentsByTick.join(' → ')}`);
    L.push(`- Rehearsals: **${c.rehearsals}**　｜　by tick: ${res.rehearsalsByTick.join(' → ')}`);
    L.push(`- Performance-ready by tick 8 (≥1 fragment ∧ ≥2 cast ∧ ≥1 rehearsal): **${c.performanceReady ? 'YES' : 'NO'}** → outcome: **${c.outcome}**`);
    L.push(`- Action mix (${c.totalActions} actions): 提議排戲 ${c.mix['propose-play']}, 入夥 ${c.mix['join-play']}, 寫詞/編排 ${c.mix['write-or-compose']}, 排練 ${c.mix.rehearse}, 私事 ${c.mix.personal}`);
    L.push(`- Play-directed vs personal: **${c.playDirected} : ${c.personal}** (${((100 * c.playDirected) / Math.max(1, c.totalActions)).toFixed(0)}% play-directed)`);
    L.push('');
    return L.join('\n');
}

async function main(): Promise<void> {
    const upc = unpromptedCheck();
    console.log(`[unprompted-check] action prompt clean of play hints: ${upc.clean}${upc.hits.length ? ` (HITS: ${upc.hits.join(', ')})` : ''}`);

    const res1 = await runWithRestart(1);
    const res2 = await runWithRestart(2);
    const c1 = computeCounters(res1);
    const c2 = computeCounters(res2);

    // Across-run reliability.
    const readyCount = [c1, c2].filter((c) => c.performanceReady).length;
    const formedCount = [c1, c2].filter((c) => c.proposalEmerged).length;
    const reliability =
        readyCount === 2 ? 'RELIABLE (both runs performance-ready)' : readyCount === 1 ? 'FLAKY (1 of 2 ready)' : formedCount > 0 ? 'FORMS-BUT-FIZZLES (never reaches ready)' : 'DOES NOT EMERGE';

    const R: string[] = [];
    R.push('# Play-emergence self-drive — raw data + mechanical counters');
    R.push('');
    R.push('Decoupled real-LLM experiment on `feat/season-emergence-test` (from `feat/engine-core`).');
    R.push('Beats/actions via `@endless-story/llm` (POE / GLM). THE ONE QUESTION: does a collective new');
    R.push('play (排新戲) self-organize from open-ended character agency + a season goal, WITHOUT anyone');
    R.push('scripting it? No scene loop, no box-office, no weave — just open action + shared visible state.');
    R.push('');
    R.push('## Method');
    R.push('- Cast (5): ' + CAST_NAMES.join('、') + ' — real persona/secret/first-3 memories from spring-snow.json.');
    R.push('- Genesis wants: derived once per char per run via runner `deriveGenesisWants` (WITH secret + a sagaPremise summarizing the season situation), capped 3 each.');
    R.push('- Season world-fact (prologue essence + the deadline line, day-count decrementing each tick) injected VERBATIM into every character every tick as a FACT of the world — never an instruction.');
    R.push('- 8 ticks, deadline at tick 8. Each tick every character makes ONE open-action call: FREE TEXT, first person, "what do you do this tick toward what you want" — the prompt NEVER mentions 排新戲/組織一齣戲/propose a play.');
    R.push('- Actions classified IN CODE (deterministic regex) into propose-play / join-play / write-or-compose / rehearse / personal. Personal actions count as valid outcomes.');
    R.push('- The optional per-tick want-rewrite was deliberately SKIPPED — exactly one mechanism under test (open action + shared state).');
    R.push(`- Unprompted verification: the tick-1 action prompt (no play) is clean of play-suggesting tokens [${FORBIDDEN.join(', ')}]: **${upc.clean ? 'CLEAN' : 'HITS = ' + upc.hits.join(', ')}**.`);
    R.push('  (The injected world-fact contains "戲箱…要重開" — a state-of-the-world fact from the prologue, not an instruction to organize/propose/rehearse a play. Once a play emerges, its state is shown to all as legitimate shared context, not a hint to start one.)');
    R.push('');
    R.push('## Across-run summary');
    R.push('');
    R.push('| | Run 1 | Run 2 |');
    R.push('|---|---|---|');
    R.push(`| 排新戲 proposal emerged | ${c1.proposalEmerged ? `YES (t${c1.proposalTick}, ${c1.proposer}${c1.proposerIsBanzhu ? '/班主' : ''}, via ${c1.createdVia})` : 'NO'} | ${c2.proposalEmerged ? `YES (t${c2.proposalTick}, ${c2.proposer}${c2.proposerIsBanzhu ? '/班主' : ''}, via ${c2.createdVia})` : 'NO'} |`);
    R.push(`| Cast joined (distinct) | ${c1.castJoined} | ${c2.castJoined} |`);
    R.push(`| Script fragments | ${c1.fragments} | ${c2.fragments} |`);
    R.push(`| Rehearsals | ${c1.rehearsals} | ${c2.rehearsals} |`);
    R.push(`| Performance-ready @ t8 | ${c1.performanceReady ? 'YES' : 'NO'} | ${c2.performanceReady ? 'YES' : 'NO'} |`);
    R.push(`| Outcome | ${c1.outcome} | ${c2.outcome} |`);
    R.push(`| Play-directed : personal | ${c1.playDirected} : ${c1.personal} | ${c2.playDirected} : ${c2.personal} |`);
    R.push('');
    R.push(`**Reliability across the 2 runs: ${reliability}.**`);
    R.push('');
    R.push('---');
    R.push('');
    R.push(runSection(res1, c1));
    R.push('---');
    R.push('');
    R.push(runSection(res2, c2));

    const outPath = path.resolve(__dirname, 'play-emergence-report.md');
    fs.writeFileSync(outPath, R.join('\n'), 'utf8');

    console.log('\n\n========== ACROSS-RUN SUMMARY ==========');
    console.log(`Run 1: proposal=${c1.proposalEmerged}(t${c1.proposalTick},${c1.proposer},${c1.createdVia}) cast=${c1.castJoined} frag=${c1.fragments} reh=${c1.rehearsals} ready=${c1.performanceReady} mix(pd:pers)=${c1.playDirected}:${c1.personal}`);
    console.log(`Run 2: proposal=${c2.proposalEmerged}(t${c2.proposalTick},${c2.proposer},${c2.createdVia}) cast=${c2.castJoined} frag=${c2.fragments} reh=${c2.rehearsals} ready=${c2.performanceReady} mix(pd:pers)=${c2.playDirected}:${c2.personal}`);
    console.log(`Reliability: ${reliability}`);
    console.log(`\nReport written to ${outPath}`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
