/**
 * DECOUPLED EXPERIMENT · AGENT-WITH-TOOLS LOOP (feat/agent-loop)
 * ============================================================================
 * Replaces the season's FIXED PHASE PIPELINE (perceive→plan→move→scene per tick
 * for everyone, with mechanical `computeRehearsalRouting`) with a proper
 * AGENT-WITH-TOOLS loop, and proves it restores the autonomous behaviours the
 * pipeline hard-coded away.
 *
 * THE ARCHITECTURE
 * ----------------
 * Each character is an AGENT. The tick SPOTLIGHTS one character; on its turn it
 * PLANS what to do this tick (a first-person paragraph grounded in its location,
 * self-model, wants, situation, recalled memories, who's present), then invokes
 * a short SEQUENCE OF TOOLS (cap 3), then the turn ENDS and the next character
 * is spotlighted. §2.43: the tools are CAPABILITIES the character chooses among,
 * NEVER scripted instructions — the plan prompt never says go-here / reflect /
 * settle-the-debt.
 *
 * TOOLS (capabilities, not commands)
 *   move(dest)            — go to a venue (own home/work, or someone else's for a reason)
 *   recall(query)         — pull relevant memories (also auto-run before the plan)
 *   reflect(subject,who?) — §2.52 reflection; may OVERWRITE the self-model (latest-wins)
 *   interact(target,intent) — if the target is co-present, runSceneLoop renders a SCENE
 *   sleep()               — end the day (at home)
 *
 * THE POINT: characters START AT THEIR OWN PLACES. Non-troupe 金鳳 (歌女) and
 * 白韻秋 (千金) do NOT loiter at the 戲台; their WANTS point at 柳生春 so any
 * intersection with his world is MOTIVATED (柳 goes to 會樂里 / 白韻秋 summons him),
 * never scenery-filling. The pipeline piled 49/49 scenes at the 戲台 and flipped
 * the pivotal 〔了斷〕 in a LOG with no scene; this loop must spread venues,
 * render the 了斷 as a real scene, and let nights be chosen (sleep / visit), not
 * blanket fast-forwarded.
 *
 * RUN (REAL-LLM only; keys via env, NEVER hardcoded):
 *   POE_API_KEY=… OPENAI_API_KEY=… AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-4.6 \
 *   ./node_modules/.bin/tsx experiments/agent-loop/agent-loop.ts
 *
 * Writes experiments/agent-loop/report.md and prints a mechanical counter block.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { text as llmText } from '@endless-story/llm';
import {
    LocalRecall,
    LocalClock,
    makeClock,
    newWant,
    tension,
    decayWants,
    runSceneLoop,
    type Want,
    type SceneLoopCastMember,
    type WorldClock,
} from '../../src/index.ts';
import { extractRewriteJson } from '../../src/core/want-rewrite.ts';
import { RunnerSceneAgent } from '../../src/adapters/runner-scene-agent.ts';

// ── config ───────────────────────────────────────────────────────────────────
const TICKS_PER_DAY = 6;
const TOTAL_TICKS = 12; // 2 days
const MAX_TOOLS_PER_TURN = 3;
const RETRIES = 4;

const OUT_DIR = path.join(import.meta.dirname, '.');
const REPORT_PATH = path.join(OUT_DIR, 'report.md');

const logLines: string[] = [];
function log(line = ''): void {
    console.log(line);
    logLines.push(line);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry EVERY direct LLM call 4× (task requirement). Throws after the last. */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < RETRIES; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            log(`   [retry] ${label} attempt ${i + 1}/${RETRIES} failed: ${String(e).slice(0, 140)}`);
            await sleep(600 * (i + 1));
        }
    }
    throw lastErr;
}

// ── world geography ────────────────────────────────────────────────────────
interface Venue {
    name: string;
    kind: 'home' | 'work' | 'public';
    /** short public description shown as world geography (not real-time occupancy). */
    hint: string;
}
const VENUES: Venue[] = [
    { name: '雲錦台戲台', kind: 'work', hint: '雲錦班的戲台，排戲、登台都在這' },
    { name: '後台小廂房', kind: 'home', hint: '柳生春在戲台後頭的住處' },
    { name: '會樂里長三堂子花廳', kind: 'home', hint: '金鳳做歌女、也起居的長三堂子' },
    { name: '白公館', kind: 'home', hint: '白韻秋娘家，白府千金的宅邸' },
    { name: '包廂茶座', kind: 'public', hint: '戲園子邊上的雅座，白韻秋常來聽戲的地方' },
    { name: '二樓書寓', kind: 'home', hint: '蘇映雪的書寓' },
    { name: '沈宅', kind: 'home', hint: '沈雪笙的家' },
];
const venueByName = new Map(VENUES.map((v) => [v.name, v]));
const isPrivateVenue = (name: string): boolean => venueByName.get(name)?.kind !== 'work';

// ── cast ─────────────────────────────────────────────────────────────────────
interface Char {
    id: string;
    name: string;
    role: string;
    troupe: boolean;
    homeVenue: string;
    persona: string;
    secret: string;
    thickMemories: Array<{ text: string; importance: number }>;
    coreIdentity: string[];
    /** otherId -> current one-line view (the mutable self-model, latest-wins). */
    relationshipViews: Map<string, string>;
    wants: Want[];
    venue: string; // current location
    sleptDay: number | null;
    /** otherId -> accumulated verbatim of what passed between them TODAY (for reflect). */
    todayLedger: Map<string, string>;
    /** scenes this character has been in TODAY — the fatigue signal (reset each day). */
    scenesToday: number;
}

function buildCast(): Char[] {
    const mk = (
        id: string,
        name: string,
        role: string,
        troupe: boolean,
        homeVenue: string,
        persona: string,
        secret: string,
        thickMemories: Array<{ text: string; importance: number }>,
        coreIdentity: string[],
        views: Array<[string, string]>,
        wants: Array<Omit<Parameters<typeof newWant>[0], 'characterId' | 'kind' | 'source' | 'bornTick'>>,
    ): Char => ({
        id,
        name,
        role,
        troupe,
        homeVenue,
        persona,
        secret,
        thickMemories,
        coreIdentity,
        relationshipViews: new Map(views),
        wants: wants.map((w) => newWant({ ...w, characterId: id, kind: 'narrative', source: 'genesis', bornTick: 0 })),
        venue: homeVenue,
        sleptDay: null,
        todayLedger: new Map(),
        scenesToday: 0,
    });

    return [
        mk(
            '柳生春', '柳生春', '當家老生', true, '後台小廂房',
            '雲錦班的當家老生，戲比天大，台上端方雍容，台下卻是個不肯回頭認舊帳的人。嗓子壓得住場，心事壓得更死。',
            '當年在會樂里，他答應過金鳳一句話，後來一走了之，這些年只當沒發生。',
            [
                { text: '那年冬天在會樂里花廳，金鳳替他擋了債主，他說了句「等我立住了角，回來給你個交代」，轉頭卻進了雲錦班再沒回去。', importance: 9 },
                { text: '金鳳住在會樂里長三堂子花廳，這些年他繞著會樂里走，連那條巷子口都不敢站。', importance: 8 },
                { text: '師父臨終攥著他的手說「戲子先做人，欠人的總要還」，他應了，卻一直沒還金鳳那句。', importance: 7 },
            ],
            ['我是柳生春，雲錦班的當家老生，台上不能塌。', '師父教過我：戲子先做人，欠人的總要還。'],
            [['金鳳', '會樂里的舊相好，我欠她一句了斷，這些年不敢面對'], ['蘇映雪', '同班的旦角，戲搭子，她待我似有若無有股熱勁']],
            [
                { layer: '情', desc: '欠金鳳一句了斷，這些年一直沒給她個交代', target: '金鳳', weight: 0.82, sat: 0.24, resistance: 3 },
                { layer: '志', desc: '排一齣新戲，把雲錦台重新撐起來', weight: 0.58, sat: 0.4, resistance: 5 },
            ],
        ),
        mk(
            '金鳳', '金鳳', '長三歌女', false, '會樂里長三堂子花廳',
            '會樂里長三堂子的紅歌女，一副好嗓，脾氣也硬。人前笑語迎客，人後只認一個當年沒回來的人。',
            '她這些年攢下的體己，本是替柳生春留的贖身錢，誰也沒說。',
            [
                { text: '那年冬天她替柳生春擋了債主，他說「回來給你個交代」，她信了，就在會樂里等，一等就是這些年。', importance: 9 },
                { text: '客人裡也有捧她的，要替她贖身，她都推了，只說「我這身子有主了」，其實那個「主」早不見人影。', importance: 8 },
                { text: '她攢的體己藏在花廳梳妝匣底層，本是想著哪天柳生春回來，能有個乾淨的了斷。', importance: 7 },
            ],
            ['我是金鳳，會樂里的歌女，人硬心也硬，就這一件事軟。'],
            [['柳生春', '當年說要回來給我交代的人，我在會樂里等他一句話']],
            [
                { layer: '情', desc: '要柳生春給我一句話，當年的事總得當面了斷', target: '柳生春', weight: 0.86, sat: 0.2, resistance: 3 },
                { layer: '生', desc: '把這個月的堂會唱下來，撐住花廳的門面', weight: 0.5, sat: 0.5, resistance: 5 },
            ],
        ),
        mk(
            '白韻秋', '白韻秋', '白府千金', false, '白公館',
            '白公館的獨生千金，養尊處優，聽戲聽出了痴，一顆心全撲在雲錦班的柳生春身上，想的是捧他、近他。',
            '她瞞著家裡挪用了自己的嫁妝銀子，替雲錦班的新戲砸包銀捧場。',
            [
                { text: '頭回在包廂茶座聽柳生春唱《斷橋》，她聽得落了淚，從此逢戲必到，戲牌上有他的名字就包廂全訂下。', importance: 8 },
                { text: '她差人給後台送過好幾回東西，柳生春都客客氣氣退了，越退她越上心。', importance: 7 },
                { text: '她瞞著爹娘動了嫁妝銀子，想著替雲錦班的新戲砸個彩頭，好教柳生春記著她的好。', importance: 7 },
            ],
            ['我是白韻秋，白府千金，認準的事九頭牛也拉不回。'],
            [['柳生春', '雲錦班的角兒，我非捧他不可，想法子親近他']],
            [
                { layer: '癡', desc: '想法子親近柳生春，捧他捧成名角', target: '柳生春', weight: 0.72, sat: 0.3, resistance: 4 },
            ],
        ),
        mk(
            '蘇映雪', '蘇映雪', '當家青衣', true, '二樓書寓',
            '雲錦班的當家青衣，才情高，心氣也高，戲裡戲外都想和柳生春唱一齣對兒戲，那點熱勁自己也不肯認。',
            '她私下改了新戲的本子，把旦角的戲份往柳生春的老生身上靠，好多幾場對戲。',
            [
                { text: '和柳生春合過《斷橋》，那一場水袖對眼神，台下叫好聲裡她心跳得厲害，散戲後誰也沒提。', importance: 8 },
                { text: '她在書寓改新戲的本子，悄悄把旦角和老生的對戲加了兩場，自己都覺得臉熱。', importance: 6 },
            ],
            ['我是蘇映雪，雲錦班的青衣，戲要好，人也要爭一口氣。'],
            [['柳生春', '同班的老生，最好的戲搭子，我那點心思他大約沒察覺']],
            [
                { layer: '戲', desc: '去雲錦台戲台把新戲的旦角戲排出彩，掙一個立得住的角', weight: 0.7, sat: 0.34, resistance: 4 },
                { layer: '情', desc: '私心想跟柳生春多排幾場對兒戲', target: '柳生春', weight: 0.56, sat: 0.4, resistance: 5 },
            ],
        ),
        mk(
            '沈雪笙', '沈雪笙', '班中琴師', true, '沈宅',
            '雲錦班的琴師兼半個編腔的，話不多，一把胡琴撐半台戲，一心想譜一齣能立住的新戲。',
            '他其實識譜作曲遠勝旁人所知，卻總把功勞讓給班主，怕出頭惹事。',
            [
                { text: '他為新戲琢磨了一段新腔，夜裡在沈宅拉了又改，總覺得還差一口氣。', importance: 6 },
                { text: '班裡都當他只是個拉琴的，沒人知道那幾齣叫座的戲的腔是他悄悄編的。', importance: 6 },
            ],
            ['我是沈雪笙，雲錦班的琴師，戲的骨頭在腔裡。'],
            [['柳生春', '班裡的角兒，他的嗓子配我的腔，戲才立得住']],
            [
                { layer: '志', desc: '去雲錦台戲台把新戲的新腔跟班子立起來', weight: 0.66, sat: 0.38, resistance: 4 },
                { layer: '藝', desc: '夜裡在沈宅把那段新腔的尾音磨順', weight: 0.5, sat: 0.46, resistance: 5 },
            ],
        ),
    ];
}

// ── helpers ────────────────────────────────────────────────────────────────
function selfModelBlock(c: Char, byId: Map<string, Char>): string {
    const lines: string[] = [];
    if (c.coreIdentity.length) {
        lines.push('# 你一向記得自己是誰');
        for (const f of c.coreIdentity) lines.push(`- ${f}`);
    }
    if (c.relationshipViews.size) {
        lines.push('# 此刻你對幾個人的看法（這是你現在的看法，會隨事情改變）');
        for (const [oid, view] of c.relationshipViews) {
            const nm = byId.get(oid)?.name ?? oid;
            lines.push(`- ${nm}：「${view}」`);
        }
    }
    return lines.join('\n');
}

const hottest = (c: Char): Want | null => {
    let best: Want | null = null;
    for (const w of c.wants) {
        if (w.retired) continue;
        if (!best || tension(w) > tension(best)) best = w;
    }
    return best;
};

function wantLines(c: Char): string {
    const live = c.wants.filter((w) => !w.retired).sort((a, b) => tension(b) - tension(a));
    if (!live.length) return '（暫時沒有特別掛心的事）';
    return live.map((w) => `- [${w.layer}] ${w.desc}${w.target ? `（心裡掛著${w.target}）` : ''}`).join('\n');
}

function geographyBlock(): string {
    return VENUES.map((v) => `- ${v.name}：${v.hint}`).join('\n');
}

// ── the PLAN call (§2.43 — capabilities, never commands) ─────────────────────
interface ToolCall {
    tool: 'move' | 'recall' | 'reflect' | 'interact' | 'sleep';
    dest?: string;
    target?: string;
    intent?: string;
    query?: string;
    subject?: string; // 今日|某人|自己
    who?: string;
}
interface PlanResult {
    plan: string;
    tools: ToolCall[];
}

async function planTurn(
    c: Char,
    byId: Map<string, Char>,
    present: Char[],
    clock: WorldClock,
    night: boolean,
    recalled: string[],
    tired: boolean,
): Promise<PlanResult> {
    const system = [
        '你在扮演戲園世界裡一個活生生的人。此刻輪到你這一刻。',
        '給你：你是誰、你心底藏著什麼、你此刻對某些人的看法、你心裡掛著的幾件事、你人在哪裡、',
        '此處有誰、這世界有哪些地方、你剛想起的幾件舊事、現在是什麼時辰。',
        '',
        '你這一刻能做的事（這些是你的本事，由你自己挑著用，不是我叫你做的）：',
        '- move：動身去一個地方（你自己的住處/做活的地方，或為了某個緣故去別人的地方）。填 dest=地名。',
        '- recall：再細想一件舊事。填 query=你想細想什麼。',
        '- reflect：靜下來想一想，可能改變你對某人或自己的看法。填 subject=今日|某人|自己；若是某人，填 who=名字。',
        '- interact：去對某人做點什麼、說點什麼（若對方也在場，就會當面演成一場戲）。填 target=名字、intent=你要做/說什麼。',
        '- sleep：這一天到頭了，回住處歇下。',
        '',
        '鐵則：只順著你的性子和心事，自己定這一刻做什麼、去哪裡、找誰、要不要歇。',
        '我不會告訴你該去哪、該不該了結舊帳、該不該歇——那全由你自己拿主意。',
        '至多做三件事，排好先後（比如先動身去一個地方，到了再找人）。',
        '',
        '輸出嚴格只輸出 JSON，不要 markdown、不要多餘文字：',
        '{"plan":"第一人稱一段，你這一刻打算做什麼、為什麼（50-120字，貼著你的心事與記憶）",',
        ' "tools":[{"tool":"move","dest":"…"},{"tool":"interact","target":"…","intent":"…"}]}',
    ].join('\n');

    const presentLine = present.length
        ? present.map((p) => `${p.name}（${p.role}）`).join('、')
        : '（此處眼下只有你一個人）';
    const smBlock = selfModelBlock(c, byId);
    const recallBlock = recalled.length ? recalled.map((m) => `- ${m}`).join('\n') : '（一時想不起什麼）';
    const here = venueByName.get(c.venue);
    const user = [
        `# 你是誰\n${c.name}（${c.role}）：${c.persona}`,
        `\n# 你心底的事（只有你自己知道）\n${c.secret}`,
        smBlock ? `\n${smBlock}` : '',
        `\n# 你此刻心裡掛著的事\n${wantLines(c)}`,
        `\n# 你人在哪裡\n${c.venue}（${here?.hint ?? ''}）`,
        `\n# 此處有誰\n${presentLine}`,
        `\n# 這世界有哪些地方（你都知道怎麼去）\n${geographyBlock()}`,
        `\n# 你剛想起的幾件舊事\n${recallBlock}`,
        `\n# 現在是什麼時辰\n第${clock.day}日·${clock.partOfDay}${night ? '（入夜了）' : ''}`,
        `\n# 你此刻的身子\n${tired ? '你今日已奔忙、應對了好一陣，身上乏了，眼皮也沉。' : '你精神還好。'}`,
        `\n此刻，你（${c.name}）決定做什麼？`,
    ]
        .filter(Boolean)
        .join('\n');

    return withRetry(`plan(${c.name})`, async () => {
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 500,
            temperature: 0.85,
        });
        const obj = (extractRewriteJson(res.text) ?? {}) as { plan?: unknown; tools?: unknown };
        const plan = String(obj.plan ?? '').trim() || '（沒說出口的盤算）';
        const rawTools = Array.isArray(obj.tools) ? obj.tools : [];
        const tools: ToolCall[] = [];
        for (const t of rawTools.slice(0, MAX_TOOLS_PER_TURN)) {
            const tool = String((t as any)?.tool ?? '').trim();
            if (!['move', 'recall', 'reflect', 'interact', 'sleep'].includes(tool)) continue;
            tools.push({
                tool: tool as ToolCall['tool'],
                dest: str((t as any)?.dest),
                target: str((t as any)?.target),
                intent: str((t as any)?.intent),
                query: str((t as any)?.query),
                subject: str((t as any)?.subject),
                who: str((t as any)?.who),
            });
        }
        return { plan, tools };
    });
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

// ── reflect (§2.52) — may OVERWRITE the self-model, latest-wins ──────────────
async function doReflect(
    c: Char,
    byId: Map<string, Char>,
    subject: string,
    who: string | undefined,
    day: number,
    agent: RunnerSceneAgent,
): Promise<{ note: string; updated: string[] }> {
    // Build interactions from today's ledger (+ the named person if 某人).
    const targetIds =
        subject === '某人' && who
            ? [...byId.values()].filter((o) => o.name === who || o.id === who).map((o) => o.id)
            : [...c.todayLedger.keys()];
    const interactions = targetIds
        .map((oid) => {
            const o = byId.get(oid);
            if (!o) return null;
            return {
                otherId: oid,
                otherName: o.name,
                currentView: c.relationshipViews.get(oid),
                todayText: c.todayLedger.get(oid) ?? '（今天只是照了個面）',
                resolvedWithThem: c.wants.some((w) => w.retired && w.target && (w.target === o.name || w.target === oid)),
            };
        })
        .filter(Boolean) as Parameters<typeof agent.consolidateSelfModel>[0]['interactions'];

    if (!interactions.length && subject !== '自己') {
        return { note: `${c.name} 靜想了片刻，但今天沒和誰有深交，看法沒什麼可改的。`, updated: [] };
    }

    try {
        const reply = await withRetry(`reflect(${c.name})`, () =>
            agent.consolidateSelfModel({
                name: c.name,
                persona: c.persona,
                secret: c.secret,
                coreIdentity: c.coreIdentity,
                interactions: interactions.length ? interactions : [],
                day,
            }),
        );
        const updated: string[] = [];
        for (const rv of reply.relationshipViews) {
            const before = c.relationshipViews.get(rv.otherId);
            c.relationshipViews.set(rv.otherId, rv.view); // OVERWRITE — latest-wins
            const nm = byId.get(rv.otherId)?.name ?? rv.otherId;
            updated.push(`對${nm}的看法：「${before ?? '（原本沒特別記著）'}」→「${rv.view}」`);
        }
        if (reply.identityInsight) {
            c.coreIdentity.push(reply.identityInsight);
            updated.push(`對自己多了一句：「${reply.identityInsight}」`);
        }
        const note = updated.length
            ? `${c.name} 靜下來想了想（${subject}${who ? '·' + who : ''}），${updated.join('；')}。`
            : `${c.name} 想了想，看法暫時沒變。`;
        return { note, updated };
    } catch (e) {
        return { note: `${c.name} 想反省但沒想成（call failed）：${String(e).slice(0, 80)}`, updated: [] };
    }
}

// ── interact → runSceneLoop (a rendered SCENE if the target is co-present) ────
interface SceneRecord {
    venue: string;
    tick: number;
    day: number;
    part: string;
    isPrivate: boolean;
    participants: string[];
    beats: Array<{ name: string; text: string; inner: string }>;
    resolved: string[];
}

function castMember(c: Char, others: Char[]): SceneLoopCastMember {
    const ties: Record<string, string> = {};
    for (const o of others) {
        const v = c.relationshipViews.get(o.id);
        if (v) ties[o.id] = v;
    }
    return {
        characterId: c.id,
        name: c.name,
        persona: c.persona,
        memories: c.thickMemories.map((m) => m.text).slice(0, 4),
        innerSecret: c.secret,
        role: c.role,
        ties,
    };
}

async function doInteract(
    c: Char,
    target: Char | undefined,
    intent: string | undefined,
    present: Char[],
    clock: WorldClock,
    agent: RunnerSceneAgent,
): Promise<{ observation: string; scene: SceneRecord | null }> {
    if (!target) return { observation: '（你想找人，卻沒說清找誰。）', scene: null };
    const coPresent = present.some((p) => p.id === target.id);
    if (!coPresent) {
        return {
            observation: `你要找${target.name}，可${target.name}此刻不在${c.venue}，你撲了個空。`,
            scene: null,
        };
    }
    // Scene cast: the spotlight char + the target (a focused two-hander when possible).
    const others = [target];
    const cast = [castMember(c, others), castMember(target, [c])];
    const priv = isPrivateVenue(c.venue) && cast.length === 2;
    const wants = [...c.wants, ...target.wants];
    const clockLabel = `第${clock.day}日·${clock.partOfDay}`;

    try {
        const loop = await runSceneLoop({
            sceneId: `t${clock.currentTick}-${c.id}`,
            sceneName: c.venue,
            isPrivate: priv,
            clock: clockLabel,
            stake: intent ? `${c.name}上門，${intent}。` : undefined,
            // No 'consummate' stance: a reckoning should render as drama, not
            // consummation. The love-layer gate still colours private beats,
            // but the adult register stays closed (§2.46 intimacy stays scarce).
            cast,
            wants,
            tick: clock.currentTick,
        });
        const beats = loop.beats.map((b) => ({ name: b.name, text: b.text, inner: b.inner }));
        const resolved = loop.resolved.map((r) => `${r.want.characterId}：${r.want.desc}｜${r.note ?? ''}`);

        // Record today's exchange into BOTH participants' ledgers (for reflect).
        const sceneText = beats.map((b) => `${b.name}：${b.text}`).join('\n');
        c.todayLedger.set(target.id, `${c.todayLedger.get(target.id) ?? ''}\n${sceneText}`.trim());
        target.todayLedger.set(c.id, `${target.todayLedger.get(c.id) ?? ''}\n${sceneText}`.trim());
        c.scenesToday += 1;
        target.scenesToday += 1;

        const scene: SceneRecord = {
            venue: c.venue,
            tick: clock.currentTick,
            day: clock.day,
            part: clock.partOfDay,
            isPrivate: priv,
            participants: [c.name, target.name],
            beats,
            resolved,
        };
        const obs = `你和${target.name}在${c.venue}${priv ? '（私下）' : ''}演成了一場戲（${beats.length}拍）${
            resolved.length ? `，並且了結了一樁心事：${resolved.join('；')}` : ''
        }。`;
        return { observation: obs, scene };
    } catch (e) {
        return { observation: `你想和${target.name}動作，但這場沒演成（call failed）：${String(e).slice(0, 80)}`, scene: null };
    }
}

// ── spotlight selection: round-robin base + want-heat/fatigue tilt ───────────
function pickSpotlight(cast: Char[], lastTickById: Map<string, number>, tick: number): Char {
    // Eligible = not spotlighted on the immediately preceding tick.
    const eligible = cast.filter((c) => (lastTickById.get(c.id) ?? -99) !== tick - 1);
    const pool = eligible.length ? eligible : cast;
    let best = pool[0];
    let bestScore = -Infinity;
    for (const c of pool) {
        const hot = hottest(c);
        const wait = tick - (lastTickById.get(c.id) ?? -1);
        const score = (hot ? tension(hot) : 0) + 0.12 * wait;
        if (score > bestScore) {
            bestScore = score;
            best = c;
        }
    }
    return best;
}

// ── turn record (for the 3-full-turns report requirement) ────────────────────
interface TurnRecord {
    tick: number;
    day: number;
    part: string;
    night: boolean;
    char: string;
    venueBefore: string;
    venueAfter: string;
    autoRecall: string[];
    plan: string;
    steps: Array<{ tool: string; args: string; observation: string; scene?: SceneRecord | null }>;
}

// ── main loop ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    const provider = process.env.AI_PROVIDER ?? '(unset)';
    const model = process.env.POE_MODEL_PRIMARY ?? '(unset)';
    const realEmbed = !!process.env.OPENAI_API_KEY;
    log('══════════════════════════════════════════════════════════════════════');
    log(' AGENT-WITH-TOOLS LOOP — decoupled real-LLM experiment (feat/agent-loop)');
    log('══════════════════════════════════════════════════════════════════════');
    log(`provider=${provider}  model=${model}  recall-embeddings=${realEmbed ? 'REAL(openai)' : 'HASH-fallback'}`);
    log(`ticks=${TOTAL_TICKS} (${TICKS_PER_DAY}/day, 2 days)  cap=${MAX_TOOLS_PER_TURN} tools/turn`);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-agent-loop-'));
    const recall = new LocalRecall(path.join(dir, 'memory'));
    const clockPort = new LocalClock();
    const agent = new RunnerSceneAgent();

    const cast = buildCast();
    const byId = new Map(cast.map((c) => [c.id, c]));
    const byName = new Map(cast.map((c) => [c.name, c]));

    // Seed thick memories into recall (day 1).
    for (const c of cast) {
        for (const m of c.thickMemories) {
            await recall.remember(c.id, m.text, { kind: 'reflection', importance: m.importance, day: 1 });
        }
    }
    log(`\ncast (${cast.length}): ${cast.map((c) => `${c.name}@${c.homeVenue.replace('長三堂子花廳', '').replace('雲錦台', '')}`).join('、')}`);
    log('（每個人都從自己的地方起步 — 這正是重點）\n');

    const turns: TurnRecord[] = [];
    const scenes: SceneRecord[] = [];
    const venueTurnCount = new Map<string, number>(); // where each turn ENDED
    const venueSceneCount = new Map<string, number>(); // where scenes rendered
    const reflectCalls: Array<{ char: string; subject: string; note: string; updated: string[] }> = [];
    const nightDecisions: Array<{ char: string; tick: number; part: string; plan: string; tools: string }> = [];
    const lastTickById = new Map<string, number>();
    const sharedLog: string[] = [];

    let clock: WorldClock = makeClock(TICKS_PER_DAY, 0);

    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
        clock = makeClock(TICKS_PER_DAY, tick);
        const night = clockPort.isNight(clock);
        const dayEnd = clockPort.isDayEnd(clock);

        const c = pickSpotlight(cast, lastTickById, tick);
        lastTickById.set(c.id, tick);

        const present = cast.filter((o) => o.id !== c.id && o.venue === c.venue);
        const venueBefore = c.venue;

        // Auto-recall before the plan (exposed so the plan can reason on it).
        const hot = hottest(c);
        const query = hot ? `${hot.desc}${hot.target ? ' ' + hot.target : ''}` : c.persona;
        let autoRecall: string[] = [];
        try {
            autoRecall = (await recall.recall(c.id, query, 3, clock.day)).map((r) => r.text);
        } catch (e) {
            log(`   [recall] auto-recall failed for ${c.name}: ${String(e).slice(0, 80)}`);
        }

        log('──────────────────────────────────────────────────────────────────────');
        log(`TICK ${tick}  第${clock.day}日·${clock.partOfDay}${night ? '（入夜）' : ''}  ▶ 聚光：${c.name}（在 ${venueBefore}）`);

        // PLAN
        let plan: PlanResult;
        const tired = c.scenesToday >= 2;
        try {
            plan = await planTurn(c, byId, present, clock, night, autoRecall, tired);
        } catch (e) {
            log(`   [plan] FAILED after retries, skipping turn: ${String(e).slice(0, 120)}`);
            continue;
        }
        log(`  〔計劃〕${plan.plan}`);
        log(`  〔工具序列〕${plan.tools.map((t) => t.tool).join(' → ') || '（無）'}`);

        const rec: TurnRecord = {
            tick,
            day: clock.day,
            part: clock.partOfDay,
            night,
            char: c.name,
            venueBefore,
            venueAfter: venueBefore,
            autoRecall,
            plan: plan.plan,
            steps: [],
        };

        // Execute the tool sequence (observe between steps).
        for (const t of plan.tools) {
            let observation = '';
            let scene: SceneRecord | null = null;
            let args = '';
            if (t.tool === 'move') {
                args = t.dest ?? '';
                if (t.dest && venueByName.has(t.dest)) {
                    c.venue = t.dest;
                    const now = cast.filter((o) => o.id !== c.id && o.venue === c.venue);
                    observation = `你到了${t.dest}。此處有：${now.length ? now.map((p) => p.name).join('、') : '（沒別人）'}。`;
                } else {
                    // Fuzzy match on substring (model may abbreviate a venue name).
                    const match = VENUES.find((v) => t.dest && (v.name.includes(t.dest) || t.dest.includes(v.name)));
                    if (match) {
                        c.venue = match.name;
                        const now = cast.filter((o) => o.id !== c.id && o.venue === c.venue);
                        observation = `你到了${match.name}。此處有：${now.length ? now.map((p) => p.name).join('、') : '（沒別人）'}。`;
                        args = `${t.dest} → ${match.name}`;
                    } else {
                        observation = `你想去「${t.dest ?? '?'}」，可你不知道那在哪，沒動成。`;
                    }
                }
            } else if (t.tool === 'recall') {
                args = t.query ?? '';
                try {
                    const mems = await recall.recall(c.id, t.query ?? query, 3, clock.day);
                    observation = mems.length ? `你細想起：${mems.map((m) => m.text).join('｜')}` : '你細想了想，一時沒別的。';
                } catch (e) {
                    observation = `想細想卻恍了神（recall failed）：${String(e).slice(0, 60)}`;
                }
            } else if (t.tool === 'reflect') {
                args = `${t.subject ?? '今日'}${t.who ? '·' + t.who : ''}`;
                const r = await doReflect(c, byId, t.subject ?? '今日', t.who, clock.day, agent);
                observation = r.note;
                reflectCalls.push({ char: c.name, subject: args, note: r.note, updated: r.updated });
            } else if (t.tool === 'interact') {
                args = `${t.target ?? '?'}｜${t.intent ?? ''}`;
                const presentNow = cast.filter((o) => o.id !== c.id && o.venue === c.venue);
                const target = t.target ? byName.get(t.target) ?? [...byName.values()].find((x) => t.target!.includes(x.name)) : undefined;
                const r = await doInteract(c, target, t.intent, presentNow, clock, agent);
                observation = r.observation;
                scene = r.scene;
                if (scene) {
                    scenes.push(scene);
                    venueSceneCount.set(scene.venue, (venueSceneCount.get(scene.venue) ?? 0) + 1);
                    sharedLog.push(`【第${clock.day}日·${clock.partOfDay}·${scene.venue}】${scene.participants.join('×')}：${scene.beats[0]?.text.slice(0, 40) ?? ''}…`);
                }
            } else if (t.tool === 'sleep') {
                args = '';
                if (c.venue === c.homeVenue || isPrivateVenue(c.venue)) {
                    c.sleptDay = clock.day;
                    observation = `你在${c.venue}歇下了，這一天到頭。`;
                } else {
                    observation = `你想歇，可這裡是${c.venue}，不是能安睡的地方。`;
                }
            }
            log(`    · ${t.tool}(${args}) ⇒ ${observation}`);
            if (scene) {
                for (const b of scene.beats) log(`         ${b.name}：${b.text}`);
            }
            rec.steps.push({ tool: t.tool, args, observation, scene });
        }

        rec.venueAfter = c.venue;
        venueTurnCount.set(c.venue, (venueTurnCount.get(c.venue) ?? 0) + 1);
        turns.push(rec);

        if (night) {
            nightDecisions.push({
                char: c.name,
                tick,
                part: clock.partOfDay,
                plan: plan.plan,
                tools: plan.tools.map((t) => `${t.tool}(${t.dest ?? t.target ?? t.subject ?? t.query ?? ''})`).join(' → '),
            });
        }

        // A little rest for the acting character's wants (sat relaxes toward baseline).
        decayWants(c.wants);

        // Day-end: reset per-day sleep/ledger for the next day.
        if (dayEnd) {
            for (const ch of cast) {
                ch.sleptDay = null;
                ch.todayLedger.clear();
                ch.scenesToday = 0;
            }
            log(`  ── 第${clock.day}日終 ──`);
        }
    }

    // ── mechanical counter block ─────────────────────────────────────────────
    printCounters(turns, scenes, venueTurnCount, venueSceneCount, reflectCalls, nightDecisions, byName);

    // ── write report.md ──────────────────────────────────────────────────────
    writeReport({ provider, model, realEmbed, turns, scenes, venueTurnCount, venueSceneCount, reflectCalls, nightDecisions, cast });

    fs.rmSync(dir, { recursive: true, force: true });
    log(`\n✅ AGENT-LOOP REAL-LLM RUN COMPLETE — report at ${REPORT_PATH}`);
}

// ── reporting ────────────────────────────────────────────────────────────────
function venueDist(m: Map<string, number>): string {
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([v, n]) => `${v}=${n} (${Math.round((n / total) * 100)}%)`)
        .join('  ·  ');
}

/** The 了斷 = the 柳生春×金鳳 reckoning, wherever it renders (either travelled). */
function findLiaoduanScene(scenes: SceneRecord[]): SceneRecord | null {
    return (
        scenes.find(
            (s) => s.participants.includes('柳生春') && s.participants.includes('金鳳'),
        ) ?? null
    );
}

function printCounters(
    turns: TurnRecord[],
    scenes: SceneRecord[],
    venueTurnCount: Map<string, number>,
    venueSceneCount: Map<string, number>,
    reflectCalls: Array<{ char: string; subject: string; note: string; updated: string[] }>,
    nightDecisions: Array<{ char: string; tick: number; part: string; plan: string; tools: string }>,
    byName: Map<string, Char>,
): void {
    const L = (s = '') => log(s);
    L('');
    L('════════════ AGENT-LOOP — MECHANICAL COUNTER BLOCK (no LLM judge) ════════════');
    L('');
    L('── 1) VENUE SPREAD (contrast the season: 49/49 scenes at the 戲台) ───────────');
    L(`turns ended at.... ${venueDist(venueTurnCount)}`);
    L(`scenes rendered at ${venueSceneCount.size ? venueDist(venueSceneCount) : '（沒有場景 — 無 interact 演成）'}`);
    const distinctSceneVenues = venueSceneCount.size;
    L(`distinct venues with a rendered scene.. ${distinctSceneVenues}  → multi-venue=${distinctSceneVenues >= 2 ? 'YES' : 'NO'}`);
    const stageShare = (() => {
        const total = [...venueSceneCount.values()].reduce((a, b) => a + b, 0);
        return total ? Math.round(((venueSceneCount.get('雲錦台戲台') ?? 0) / total) * 100) : 0;
    })();
    L(`戲台 share of scenes.................... ${stageShare}%  (season was 100%)`);
    L('');
    L('── 2) MOTIVATED TRAVEL + 了斷 AS A RENDERED SCENE ───────────────────────────');
    const liuToHui = turns
        .filter((t) => t.char === '柳生春')
        .flatMap((t) => t.steps.filter((s) => s.tool === 'move'))
        .some((s) => s.args.includes('會樂里'));
    const jinToLiu = turns
        .filter((t) => t.char === '金鳳')
        .flatMap((t) => t.steps.filter((s) => s.tool === 'move'))
        .some((s) => s.args.includes('後台') || s.args.includes('戲台'));
    const liaoduan = findLiaoduanScene(scenes);
    L(`柳生春 chose move → 會樂里.............. ${liuToHui ? 'YES' : 'NO'}`);
    L(`金鳳 chose move → 柳's world........... ${jinToLiu ? 'YES' : 'NO'}  (the reckoning can pull either way)`);
    L(`了斷 (柳×金鳳) rendered as a SCENE...... ${liaoduan ? `YES @ ${liaoduan.venue} (${liaoduan.beats.length} beats, ${liaoduan.isPrivate ? '私下' : '公開'}) — NOT a log flip` : 'NO 柳×金鳳 scene formed'}`);
    if (liaoduan) {
        const resolved = liaoduan.resolved.length ? liaoduan.resolved.join('；') : '（本場未判了結）';
        L(`  scene resolved wants................. ${resolved}`);
    }
    L('');
    L('── 3) AUTONOMOUS NIGHT (chosen sleep/visit, NOT blanket fast-forward) ────────');
    L(`night turns................ ${nightDecisions.length}`);
    for (const nd of nightDecisions) L(`  · tick ${nd.tick} ${nd.part} ${nd.char}: [${nd.tools || '—'}]`);
    const nightScenes = scenes.filter((s) => ['入夜', '深宵'].includes(s.part));
    L(`private night scenes formed ${nightScenes.length}${nightScenes.length ? ` (${nightScenes.map((s) => `${s.participants.join('×')}@${s.venue}`).join(', ')})` : ''}`);
    L('');
    L('── 4) REFLECT INVOKED AS A TOOL (§2.52; may OVERWRITE self-model) ────────────');
    L(`reflect() calls............ ${reflectCalls.length}`);
    const updating = reflectCalls.filter((r) => r.updated.length);
    L(`  of which updated self-model ${updating.length}`);
    for (const r of reflectCalls) L(`  · ${r.char} reflect(${r.subject}) → ${r.updated.length ? r.updated.join('；') : '看法沒變'}`);
    L('');
    L('── 5) NON-TROUPE MOTIVATED (金鳳/白韻秋 at OWN venues unless motivated) ───────');
    for (const nm of ['金鳳', '白韻秋']) {
        const path = turns.filter((t) => t.char === nm).map((t) => `${t.venueBefore}→${t.venueAfter}`);
        L(`  ${nm}: ${path.join('  ')}`);
    }
    L('');
    L('── 6) AGENT-TURN LEGIBILITY ─────────────────────────────────────────────────');
    L(`total agent turns.......... ${turns.length}`);
    L(`total rendered scenes...... ${scenes.length}`);
    const toolHist = new Map<string, number>();
    for (const t of turns) for (const s of t.steps) toolHist.set(s.tool, (toolHist.get(s.tool) ?? 0) + 1);
    L(`tool-use histogram......... ${[...toolHist.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`);
    const avgTools = (turns.reduce((a, t) => a + t.steps.length, 0) / (turns.length || 1)).toFixed(2);
    L(`avg tools/turn............. ${avgTools}`);
    L('══════════════════════════════════════════════════════════════════════════════');
}

function turnMd(t: TurnRecord): string {
    const lines: string[] = [];
    lines.push(`#### TICK ${t.tick} · 第${t.day}日·${t.part}${t.night ? '（入夜）' : ''} · 聚光 ${t.char}（在 ${t.venueBefore}）`);
    if (t.autoRecall.length) lines.push(`- **自動召回**：${t.autoRecall.map((m) => m.slice(0, 40) + '…').join('｜')}`);
    lines.push(`- **計劃**：${t.plan}`);
    lines.push(`- **工具序列**：${t.steps.map((s) => s.tool).join(' → ') || '（無）'}`);
    for (const s of t.steps) {
        lines.push(`  - \`${s.tool}(${s.args})\` ⇒ ${s.observation}`);
        if (s.scene) {
            for (const b of s.scene.beats) lines.push(`    > **${b.name}**：${b.text}`);
        }
    }
    lines.push(`- **落點**：${t.venueAfter}`);
    return lines.join('\n');
}

function writeReport(args: {
    provider: string;
    model: string;
    realEmbed: boolean;
    turns: TurnRecord[];
    scenes: SceneRecord[];
    venueTurnCount: Map<string, number>;
    venueSceneCount: Map<string, number>;
    reflectCalls: Array<{ char: string; subject: string; note: string; updated: string[] }>;
    nightDecisions: Array<{ char: string; tick: number; part: string; plan: string; tools: string }>;
    cast: Char[];
}): void {
    const { turns, scenes, venueTurnCount, venueSceneCount, reflectCalls, nightDecisions } = args;
    const liaoduan = findLiaoduanScene(scenes);
    const nightScenes = scenes.filter((s) => ['入夜', '深宵'].includes(s.part));
    const md: string[] = [];
    md.push('# Agent-with-tools loop — decoupled real-LLM report');
    md.push('');
    md.push(`> branch \`feat/agent-loop\` (from \`feat/self-model\`) · provider=${args.provider} · model=${args.model} · recall-embeddings=${args.realEmbed ? 'REAL(openai)' : 'HASH-fallback'}`);
    md.push('');
    md.push('## What this replaces');
    md.push('');
    md.push('The season harness (`experiments/season-one/harness-v3.ts`) runs a FIXED PIPELINE — perceive→plan→move→scene per tick for everyone, with mechanical `computeRehearsalRouting` (a 0.6-vs-want-weight scalar). In the real season run that produced **33/49 scenes at [雲錦台戲台], 16 at [戲台·排], ZERO at any other venue**; nights were all "快轉, 無合格私戲"; the pivotal 〔了斷〕柳生春→金鳳 was a **LOG state-flip with NO scene**.');
    md.push('');
    md.push('This experiment makes each character an **AGENT**: the tick spotlights one; it PLANS (first-person, grounded in location/self-model/wants/situation/recall/who-is-present), then invokes a SEQUENCE OF TOOLS (cap 3) — `move / recall / reflect / interact / sleep`. §2.43: the plan prompt lists the tools as capabilities and asks "what do you do"; it never says go-here / reflect / settle-the-debt. Characters **start at their own places**.');
    md.push('');
    md.push('## 1) Venue spread (vs the season\'s all-戲台)');
    md.push('');
    md.push('```');
    md.push(`turns ended at.....  ${venueDist(venueTurnCount)}`);
    md.push(`scenes rendered at  ${venueSceneCount.size ? venueDist(venueSceneCount) : '（無場景）'}`);
    md.push('```');
    md.push('');
    md.push(`Distinct venues with a rendered scene: **${venueSceneCount.size}**. Season baseline: **1** (戲台 only, 100%).`);
    md.push('');
    md.push('## 2) Motivated travel + 了斷 as a rendered scene');
    md.push('');
    if (liaoduan) {
        // Whichever of the pair travelled INTO the reckoning venue is the motivated traveller.
        const moveTurn = turns.find(
            (t) =>
                (t.char === '柳生春' || t.char === '金鳳') &&
                t.steps.some((s) => s.tool === 'move' && s.args.includes(liaoduan.venue.slice(0, 3))),
        );
        const traveller = moveTurn?.char ?? '（其一）';
        md.push(`The 了斷 (柳生春×金鳳 reckoning) rendered as a **${liaoduan.isPrivate ? '私下' : '公開'} scene of ${liaoduan.beats.length} beats at ${liaoduan.venue}** — NOT a log flip. The debt DROVE a character to travel: **${traveller}** chose \`move\` into the other's world, then \`interact\`.`);
        md.push('');
        if (moveTurn) {
            md.push(`**${traveller}'s move-decision (verbatim plan):**`);
            md.push('');
            md.push(`> ${moveTurn.plan}`);
            md.push('');
        }
        md.push('**The 了斷 scene (verbatim beats):**');
        md.push('');
        for (const b of liaoduan.beats) md.push(`> **${b.name}**：${b.text}  \n> *（心）${b.inner}*`);
        md.push('');
        if (liaoduan.resolved.length) md.push(`Resolved: ${liaoduan.resolved.join('；')}`);
    } else {
        md.push('No 柳生春×金鳳 reckoning scene formed this run. (See honest read below.)');
    }
    md.push('');
    md.push('## 3) Autonomous night');
    md.push('');
    md.push('Night ticks were NOT blanket fast-forwarded — the spotlight character got a normal agent turn and chose:');
    md.push('');
    for (const nd of nightDecisions) md.push(`- **tick ${nd.tick} ${nd.part} ${nd.char}**: ${nd.tools || '—'}  \n  > ${nd.plan}`);
    md.push('');
    md.push(`Private night scenes formed: **${nightScenes.length}**${nightScenes.length ? ` — ${nightScenes.map((s) => `${s.participants.join('×')} @ ${s.venue}`).join(', ')}` : ''}.`);
    md.push('');
    md.push('## 4) Reflect invoked as a tool');
    md.push('');
    md.push(`\`reflect()\` calls: **${reflectCalls.length}**, of which **${reflectCalls.filter((r) => r.updated.length).length}** overwrote the self-model.`);
    md.push('');
    for (const r of reflectCalls) {
        md.push(`- **${r.char} reflect(${r.subject})**: ${r.note}`);
    }
    md.push('');
    md.push('## 5) Non-troupe characters (金鳳 / 白韻秋) — at their own venues unless motivated');
    md.push('');
    for (const nm of ['金鳳', '白韻秋']) {
        const path = turns.filter((t) => t.char === nm).map((t) => `${t.venueBefore}→${t.venueAfter}`);
        md.push(`- **${nm}**: ${path.join('  ·  ') || '（未被聚光）'}`);
    }
    md.push('');
    md.push('## 6) Three full agent turns (plan + tools + outcome, verbatim)');
    md.push('');
    // Prefer 3 turns that show variety: one with a scene, one at night, one reflect — else first 3.
    const withScene = turns.find((t) => t.steps.some((s) => s.scene));
    const withNight = turns.find((t) => t.night && t !== withScene);
    const withReflect = turns.find((t) => t.steps.some((s) => s.tool === 'reflect') && t !== withScene && t !== withNight);
    const chosen = [withScene, withNight, withReflect].filter(Boolean) as TurnRecord[];
    for (const t of turns) {
        if (chosen.length >= 3) break;
        if (!chosen.includes(t)) chosen.push(t);
    }
    for (const t of chosen.slice(0, 3)) {
        md.push(turnMd(t));
        md.push('');
    }
    md.push('## Full transcript (all turns)');
    md.push('');
    for (const t of turns) {
        md.push(turnMd(t));
        md.push('');
    }
    fs.writeFileSync(REPORT_PATH, md.join('\n'));
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
