/**
 * AGENT-SEASON · AGENT-WITH-TOOLS TURN (reused from feat/agent-loop, retooled).
 * ============================================================================
 * Each acting character PLANS (first-person, grounded in the current 時辰 via a
 * time tool, its occupation-rhythm, wants, self-model, recalled memories, who's
 * present) then invokes a short SEQUENCE OF TOOLS. §2.43: the tools are
 * CAPABILITIES the character chooses among, never scripted.
 *
 * ACTING TOOLS (per the coordinator's run-1 finding): move / recall / interact.
 *   - reflect is NOT a peer tool — it never got chosen against a hot want. It runs
 *     in the SCHEDULED night consolidation (round.ts, 深宵) for everyone.
 *   - sleep is NOT a peer tool — it belongs to the 深宵 rhythm (auto home + the
 *     empty-時辰 fast-forward).
 *   - time is the grounding query: every turn first queries the 時辰 (rhythm
 *     orientation), and the agent may reason on it in its plan.
 *
 * Two planner implementations behind one interface:
 *   - FakePlanner: deterministic, rhythm-grounded, zero LLM (smoke + unit tests).
 *   - RealPlanner: real-LLM plan call (GLM-4.6 via @endless-story/llm), retried 4×.
 */

import { extractRewriteJson, tension, type Want, type WorldClock } from '../../src/index.ts';
import type { Char } from './world.ts';
import { VENUES, venueByName, WORLD_PREMISE } from './world.ts';
import { rhythmPull, type RehearsalCall, type RhythmPull } from './rhythm.ts';
import type { Perception } from './perception.ts';

export interface ToolCall {
    tool: 'time' | 'move' | 'recall' | 'interact' | 'wait' | 'relations' | 'work';
    dest?: string;
    target?: string;
    intent?: string;
    query?: string;
    /** SELF-TAGGED confide (傾吐): this interact is going to someone to unburden a
     *  pressing inner matter. The character tags its OWN action — no prose regex. */
    confide?: boolean;
}

export interface PlanResult {
    plan: string;
    tools: ToolCall[];
}

export interface PlanContext {
    char: Char;
    byId: Map<string, Char>;
    /** who is (previewed) at the character's current/rhythm venue. */
    present: Char[];
    clock: WorldClock;
    night: boolean;
    /** the character's rhythm pull this 時辰 (its own-life anchor). */
    pull: RhythmPull;
    /** auto-recalled memories exposed to the plan. */
    recalled: string[];
    reh: RehearsalCall;
    /** what this character KNOWS about their hot-want target's whereabouts this 時辰
     *  (routine knowledge of someone they know). null → no known target / stranger. */
    targetWhereabouts?: { name: string; note: string } | null;
    /** the character is already POSTED UP waiting for someone (carried-over intent). */
    waitingNote?: string | null;
    /** the deadline WORLD FACT this 時辰 (「距年底大會串還有 X 天」). Injected as an
     *  emergent fact, never an instruction (§2.42). null → no deadline in play. */
    worldFactLine?: string | null;
    /** where this character is welcome / not welcome (space access, soft). */
    accessNote?: string | null;
    /** PASSIVE, positionally-gated perception snapshot this 時辰 (眼耳鼻身). The engine
     *  emits objective gated signals; the LLM interprets them subjectively. null → nothing
     *  perceived worth surfacing. */
    perception?: Perception | null;
    /** true → surface the OPPORTUNITY-COST framing: this 時辰 is a finite block; going deep
     *  with one person spends it and neglects the others. Always true when the engine passes
     *  a plan this 時辰 (a flag is enough; the wording is general, no names). */
    timeFinite?: boolean;
    /** The 班主 is actively pulling THIS character (the troupe LEAD-by-ability, derived,
     *  never name-cased) back to rehearsal because they carry the 大會串 yet have fallen
     *  behind the castmates. Set only for the under-rehearsed lead on a rehearsal 時辰;
     *  a professional lead answers the call. `venue` = where they're summoned to. */
    banzhuSummons?: { venue: string; line: string } | null;
}

/** An in-the-moment street encounter decision (§C-level agency): the walker SAW
 *  someone mid-transit and decides NOW — engage costs the errand (the 時辰 is
 *  finite: duty wage, the person they meant to find, all slip). */
export interface TransitReactCtx {
    char: Char;
    /** whom they spotted on the street. */
    seen: Char;
    street: string;
    from: string;
    dest: string;
    /** what this walk was FOR (the cost of stopping) — duty/seek/plain move. */
    errand: string;
    clock: WorldClock;
    night: boolean;
}
export interface TransitReaction {
    /** pass = 裝沒看見/腳不停; greet = 點頭招呼不停步; engage = 停下來，追上去. */
    act: 'pass' | 'greet' | 'engage';
    /** engage: what they go do/say (their own words, one line). */
    word?: string;
}

export interface Planner {
    plan(ctx: PlanContext): Promise<PlanResult>;
    /** In-the-moment street reaction. Default norm: most sightings pass. */
    transitReact(ctx: TransitReactCtx): Promise<TransitReaction>;
    /** Nightly 小算盤 for ONE stuck hot want: 2-3 concrete in-world steps in the
     *  character's own voice (找誰/備什麼/在哪堵人). Their OWN scheme, revised or
     *  dropped as life moves — never a director's outline. null → no scheme. */
    draftScheme(ctx: { char: Char; want: Want; clock: WorldClock }): Promise<string | null>;
    /** The 班主 rehearsal channel — an autonomous agent decision (not hardcoded).
     *  Also CHOOSES the 戲碼 (title) to rehearse, reasoning from the troupe's strengths. */
    decideRehearsal(ctx: {
        char: Char;
        clock: WorldClock;
        reh: RehearsalCall;
        troupePresent: string[];
    }): Promise<{ call: boolean; line: string; title: string }>;
}

// A 時辰 is a finite block. The tool cap bounds how full a sequence a character can plan
// in it — lifted past 3 so a character can plan a fuller night, but STILL bounded (time
// is the scarce resource: they can never do unlimited things in one 時辰).
const MAX_TOOLS = 5;
const RETRIES = 4;
const nape = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(label: string, fn: () => Promise<T>, onLog?: (s: string) => void): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < RETRIES; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            onLog?.(`   [retry] ${label} attempt ${i + 1}/${RETRIES} failed: ${String(e).slice(0, 140)}`);
            await nape(500 * (i + 1));
        }
    }
    throw lastErr;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export const hottest = (c: Char): Want | null => {
    let best: Want | null = null;
    for (const w of c.wants) {
        if (w.retired) continue;
        if (!best || tension(w) > tension(best)) best = w;
    }
    return best;
};

// ── FAKE planner (deterministic, rhythm-grounded, zero LLM) ───────────────────
const GENERDAN = new Set(['柳安春', '蘇映雪']); // 生旦 pair → 戲台
const WUHANG = new Set(['江聞鶴', '連翹']); // 武行 → 練功房

export class FakePlanner implements Planner {
    /** Deterministic: engage only when the sighted person is the hottest want's
     *  target (a real pull); greet on a small hash window; otherwise pass. */
    async transitReact(ctx: TransitReactCtx): Promise<TransitReaction> {
        const hot = hottest(ctx.char);
        if (hot?.target && (hot.target === ctx.seen.id || hot.target === ctx.seen.name)) {
            return { act: 'engage', word: `把心裡掛著的那樁事，趁這一撞當面挪一挪` };
        }
        let h = ctx.clock.currentTick;
        for (const ch of ctx.char.id + ctx.seen.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return { act: h % 3 === 0 ? 'greet' : 'pass' };
    }

    async draftScheme(ctx: { char: Char; want: Want; clock: WorldClock }): Promise<string | null> {
        return `為「${ctx.want.desc.slice(0, 12)}」：明日先尋${ctx.want.target ?? '相干的人'}把話挑明，再看臉色行事。`;
    }

    async plan(ctx: PlanContext): Promise<PlanResult> {
        const { char: c, pull, clock, night, reh } = ctx;
        const tools: ToolCall[] = [{ tool: 'time' }];
        const hot = hottest(c);
        const target = hot?.target ? ctx.byId.get(hot.target) : undefined;

        // DETERMINISTIC placement (async-placement-aware): every character lands at
        // a computable dest, so co-presence at dest is known here — the split
        // (生旦→戲台, 武行→練功房 during rehearsal) disperses the troupe across TWO
        // venues in the SAME 時辰. Always declare the move (so the rhythm default in
        // the round never yanks the split back).
        const dest = fakeDest(c, clock.partOfDay, reh);
        tools.push({ tool: 'move', dest });

        // Interact intent, resolved against who ELSE actually lands at dest.
        const here = (o: Char): boolean => fakeDest(o, clock.partOfDay, reh) === dest && !o.dead && o.id !== c.id;
        const plan = fakePlanProse(c, pull, night);
        if (!target && tools.length < MAX_TOOLS) tools.push({ tool: 'work' });
        if (target && here(target) && tools.length < MAX_TOOLS) {
            tools.push({ tool: 'interact', target: target.name, intent: fakeIntent(c, target) });
        } else if (c.occupation === 'troupe' && reh.announced && isWorkVenue(dest) && tools.length < MAX_TOOLS) {
            const mate = [...ctx.byId.values()].find((o) => here(o) && o.occupation === 'troupe');
            if (mate) tools.push({ tool: 'interact', target: mate.name, intent: '對這一折的戲，走一遍' });
        } else if (c.occupation === 'banzhu' && tools.length < MAX_TOOLS) {
            const mate = [...ctx.byId.values()].find((o) => here(o) && o.occupation === 'troupe');
            if (mate) tools.push({ tool: 'interact', target: mate.name, intent: '盯著這一折，親自帶著走' });
        }
        return { plan, tools: tools.slice(0, MAX_TOOLS) };
    }

    async decideRehearsal(ctx: {
        char: Char;
        clock: WorldClock;
        reh: RehearsalCall;
        troupePresent: string[];
    }): Promise<{ call: boolean; line: string; title: string }> {
        // 沈 opens the season by calling rehearsal on her first working 時辰.
        if (ctx.reh.announced) return { call: false, line: '', title: '' };
        if (ctx.clock.partOfDay === '日午' && ctx.clock.day === 1) {
            return {
                call: true,
                line: '我把封了多年的樟木戲箱開了一條縫。傳我的話：從今兒起，春雪社排新戲，生旦武行都到戲台上來。',
                title: '牡丹亭·驚夢', // deterministic 戲碼 (fits 柳×蘇 的《驚夢》seed)
            };
        }
        return { call: false, line: '', title: '' };
    }
}

/** Deterministic placement the FakePlanner uses for BOTH self and (to resolve
 *  co-presence) every other character. Mirrors rhythm + the rehearsal split + 柳's
 *  深宵 hot-want override. Pure — the smoke's async placement stays reproducible. */
function fakeDest(c: Char, part: PartOfDayLike, reh: RehearsalCall): string {
    const pull = rhythmPull(c, part, reh);
    let dest = pull.venue ?? c.homeVenue;
    if (c.occupation === 'troupe' && reh.announced && part === '晡時') {
        dest = GENERDAN.has(c.id) ? '雲錦台戲台' : WUHANG.has(c.id) ? '練功房' : dest;
    }
    // 柳's 深宵 hot-want override: leaves home to settle the 了斷 at 金鳳's 會樂里.
    const hot = hottest(c);
    if (c.id === '柳安春' && part === '深宵' && hot?.layer === '情' && !hot.retired) dest = '會樂里寓所';
    return dest;
}
type PartOfDayLike = Parameters<typeof rhythmPull>[1];

function isWorkVenue(name: string): boolean {
    const k = venueByName.get(name)?.kind;
    return k === 'stage' || k === 'practice' || k === 'backstage';
}

function fakeIntent(c: Char, target: Char): string {
    if (c.id === '柳安春' && target.id === '金鳳') return '把當年欠她的那句話，當面說個了斷';
    if (c.id === '金鳳' && target.id === '柳安春') return '當面要他認一句欠我的，這樁舊帳了結';
    if (c.id === '蘇映雪' && target.id === '柳安春') return '對一段生旦的對手戲，多搭幾場';
    if (c.id === '白韻秋' && target.id === '柳安春') return '尋個由頭近她一近，說幾句捧場的話';
    if (c.id === '江聞鶴' && target.id === '柳安春') return '較一較這場對手戲，誰也不讓誰';
    return '說幾句話';
}

function fakePlanProse(c: Char, pull: RhythmPull, night: boolean): string {
    return `（${c.name}）此刻${pull.note}我順著自己的性子，${night ? '趁著夜色' : '趁著這半日'}，把心裡掛著的那樁事往前挪一挪。`;
}

// ── REAL planner (real-LLM, GLM-4.6) ──────────────────────────────────────────
/** Lazily loaded so this module stays node-clean (the FakePlanner path loads under
 *  `node --test`; @endless-story/llm's `.js` specifiers only resolve under tsx). */
async function llm(): Promise<typeof import('@endless-story/llm').text> {
    const mod = await import('@endless-story/llm');
    return mod.text;
}

export class RealPlanner implements Planner {
    private onLog?: (s: string) => void;
    constructor(onLog?: (s: string) => void) {
        this.onLog = onLog;
    }

    async draftScheme(ctx: { char: Char; want: Want; clock: WorldClock }): Promise<string | null> {
        try {
            const t = await llm();
            const client = t.createTextClient({ kind: 'primary' });
            const res = await client.chat({
                model: client.defaultModel,
                system: [
                    '夜深了。你心裡有樁事懸了許久沒進展，睡前替自己打個小算盤——不是宏圖，是市井人的盤算：',
                    '明後天先找誰、備什麼、在哪個時辰哪個地方堵人、話怎麼開口。2-3 步，每步都是你真做得到的事。',
                    '用你自己的性子和口吻寫（急性子的算盤糙、細心人的算盤密）。',
                    '嚴格只輸出 JSON：{"scheme":"一段話，2-3步的盤算"}。不要 markdown。',
                ].join('\n'),
                messages: [
                    {
                        role: 'user',
                        content:
                            `# 你是誰\n${ctx.char.name}：${ctx.char.persona}` +
                            (ctx.char.secret ? `\n\n# 你心底的事\n${ctx.char.secret}` : '') +
                            `\n\n# 懸著沒進展的心事\n「${ctx.want.desc}」${ctx.want.target ? `（牽涉${ctx.want.target}）` : ''}` +
                            `\n\n第${ctx.clock.day}日夜。你的小算盤？`,
                    },
                ],
                maxTokens: 240,
                temperature: 0.8,
            });
            const obj = (extractRewriteJson(res.text) ?? {}) as { scheme?: unknown };
            const s = typeof obj.scheme === 'string' ? obj.scheme.trim() : '';
            return s || null;
        } catch {
            return null;
        }
    }

    /** In-the-moment street encounter: one small LLM call, only when someone was
     *  actually SEEN (rare). The cost is stated as world fact, never a rule. */
    async transitReact(ctx: TransitReactCtx): Promise<TransitReaction> {
        try {
            const { char: c, seen } = ctx;
            const view = c.relationshipViews.get(seen.id);
            const hot = hottest(c);
            const t = await llm();
            const client = t.createTextClient({ kind: 'primary' });
            const res = await client.chat({
                model: client.defaultModel,
                system: [
                    '你在扮演戲園世界裡一個活生生的人。你正在街上趕路，忽然遠遠瞧見一個認得的人。',
                    '這一刻由你自己定：多數時候，人趕著路、點個頭就過去了（pass 或 greet）；',
                    '只有心裡真有事牽著這個人、此刻又值得誤了原本的事，才會停下腳追上去（engage）。',
                    '【代價（世界事實）】追上去，這個時辰原本要辦的事就誤了——' + ctx.errand,
                    '嚴格只輸出 JSON：{"act":"pass|greet|engage","word":"若 engage，你追上去要做/說什麼（一句，用你自己的話）"}。不要 markdown。',
                ].join('\n'),
                messages: [
                    {
                        role: 'user',
                        content:
                            `# 你是誰\n${c.name}：${c.persona}` +
                            (c.secret ? `\n\n# 你心底的事（只有你自己知道）\n${c.secret}` : '') +
                            (hot ? `\n\n# 你此刻心裡最重的\n「${hot.desc}」${hot.target ? `（牽涉${hot.target}）` : ''}` : '') +
                            `\n\n# 街上這一撞\n${ctx.clock.day}日${ctx.night ? '入夜' : '白日'}，你打${ctx.from}往${ctx.dest}，路過${ctx.street}，遠遠瞧見${seen.name}（${seen.role}）也在街上。` +
                            (view ? `\n你心裡對${seen.name}：${view}` : '') +
                            `\n\n這一刻，你怎麼做？`,
                    },
                ],
                maxTokens: 160,
                temperature: 0.8,
            });
            const obj = (extractRewriteJson(res.text) ?? {}) as { act?: unknown; word?: unknown };
            const act = obj.act === 'engage' || obj.act === 'greet' ? obj.act : 'pass';
            const word = typeof obj.word === 'string' && obj.word.trim() ? obj.word.trim() : undefined;
            return { act, word };
        } catch {
            return { act: 'pass' }; // the road goes on
        }
    }

    async plan(ctx: PlanContext): Promise<PlanResult> {
        const { char: c, present, clock, night, pull, recalled } = ctx;
        const system = [
            '你在扮演戲園世界裡一個活生生的人。此刻是一天中的一個時辰，輪到你這一刻。',
            '給你：你是誰、你心底藏著什麼、你此刻對某些人的看法、你心裡掛著的幾件事、',
            '你這個時辰照著自己營生的作息該在哪、此處有誰、這世界有哪些地方、你剛想起的幾件舊事、現在是什麼時辰。',
            '',
            '你這一刻能做的事（這些是你的本事，由你自己挑著用，不是我叫你做的）：',
            '- time：先問一問現在是什麼時辰，好定準自己這一刻該做什麼（通常先做這個）。',
            '- move：動身去一個地方（你自己營生/起居的地方，或為了某個緣故去別人的地方）。填 dest=地名。',
            '- recall：再細想一件舊事。填 query=你想細想什麼。',
            '- interact：去對某個在場的人做點什麼、說點什麼（若對方也在場，就會當面演成一場戲）。填 target=名字、intent=你要做/說什麼。' +
                '若這一趟是要找信得過的人把心裡壓著的**私事**說一說（傾吐：情、愧、怕、瞞著的往事），多加 "confide":true——只有真起了想說的心才標；戲務、功夫、排戲、切磋、公事、較勁、寒暄一概不算傾吐，別標。',
            '- wait：你算準了某個人這個時辰該在的地方，守在那兒等他出現（哪怕他一時沒到，你也守著，直到他來或你等得沒了耐心）。填 target=名字、intent=你等著要對他說/做什麼。',
            '- relations：靜下心，盤一盤你與身邊眾人的近疏——誰多久沒同你單獨說過話了。想清楚了再定這個時辰做什麼。',
            '- work：守著自己的功課與營生，把這一個時辰花在正事上（吊嗓、走位、練槍、對帳、寫稿、理家）。',
            '',
            '**過日子的常識**：不是每個時辰都要去找人——功課是你之所以是你：戲子不吊嗓便不再是角兒，',
            '記者不寫稿便沒了版面。多數的日子，人守著自己的營生；心裡的事，挑要緊的時辰去辦。',
            '',
            '找一個人的訣竅：你認得的人，你大概知道他這個時辰照著營生會在哪（下面會告訴你）。要嘛動身去他那一帶找他，要嘛守在他必經的地方等他。別空等在一個他根本不會來的地方。',
            '',
            '鐵則：只順著你的性子、你的營生作息和心事，自己定這一刻做什麼、去哪裡、找誰。',
            '你這個時辰的作息是一股「拉力」，不是命令——你可以順著它，也可以為了心裡更重的一樁事偏離它。',
            '我不會告訴你該去哪、該不該了結舊帳。至多做五件事，排好先後。',
            '你的眼耳鼻身或許會捎來一些動靜（隔壁的聲響、屋裡沒散的氣味、身上的乏），那是你自己察覺到的，未必知道是誰、是什麼——你可以順著它去追、也可以不理。',
            '',
            '嚴格只輸出 JSON，不要 markdown、不要多餘文字：',
            '{"plan":"第一人稱一段，你這一刻打算做什麼、為什麼（50-120字，貼著你的營生作息與心事）",',
            ' "tools":[{"tool":"time"},{"tool":"move","dest":"…"},{"tool":"interact","target":"…","intent":"…"}]}',
        ].join('\n');

        const presentLine = present.length
            ? present.map((p) => `${p.name}（${p.role}）`).join('、')
            : '（此處眼下只有你一個人）';
        const smBlock = selfModelBlock(c, ctx.byId);
        const recallBlock = recalled.length ? recalled.map((m) => `- ${m}`).join('\n') : '（一時想不起什麼）';
        const here = venueByName.get(c.venue);
        const whereabouts = ctx.targetWhereabouts
            ? `\n# 你曉得的行蹤（你認得的人，你大概知道他這個時辰照著營生會在哪）\n- ${ctx.targetWhereabouts.name}：${ctx.targetWhereabouts.note}`
            : '';
        const waiting = ctx.waitingNote ? `\n# 你正守著的事\n${ctx.waitingNote}` : '';
        const access = ctx.accessNote ? `\n# 你進得去哪些地方（私處是有主的，別人的房要有人領或有交情才進得去）\n${ctx.accessNote}` : '';
        // Deadline as a WORLD FACT (§2.42): the character lives in a world where this
        // is simply true this 時辰. It is never an instruction to make/premiere a play.
        const worldFact = ctx.worldFactLine ? `\n# 眼下這世道\n${ctx.worldFactLine}` : '';
        const schemeNote = c.scheme ? `\n# 你前夜替自己打的小算盤（自己的主意，照不照辦由你）\n${c.scheme}` : '';
        // PASSIVE perception (眼耳鼻身) — only the channels actually sensed this 時辰.
        const perc = ctx.perception;
        const percLines: string[] = [];
        if (perc?.sight) percLines.push(`- 眼：${perc.sight}`);
        if (perc?.hear) percLines.push(`- 耳：${perc.hear}`);
        if (perc?.smell) percLines.push(`- 鼻：${perc.smell}`);
        if (perc?.body) percLines.push(`- 身：${perc.body}`);
        const perception = percLines.length
            ? `\n# 你此刻感知到的（眼耳鼻身，只是你察覺到的動靜，未必知道是誰、是什麼）\n${percLines.join('\n')}`
            : '';
        // OPPORTUNITY COST — a 時辰 is finite; going deep with one spends it on that one.
        const oppCost = ctx.timeFinite
            ? '\n# 這一個時辰只有這麼長\n這一刻是有限的。你若揀定一個人深談、溫存，這一整個時辰就都花在他身上，今夜便再顧不上你同樣掛心的旁人了。要在誰身上花這一刻，是你自己的取捨。'
            : '';
        // 班主 SUMMONS — a standing pull on the under-rehearsed troupe LEAD (derived by
        // ability, no names). It is a professional obligation the lead carries, not an
        // instruction to premiere: the 大會串 rides on them, and they've fallen behind.
        const summons = ctx.banzhuSummons
            ? `\n# 班主傳的話\n${ctx.banzhuSummons.line}你是這班子挑大梁的角兒，這齣大會串的戲眼在你身上，可你這些日子總不在排練場上。班主要你到${ctx.banzhuSummons.venue}歸班排戲。這是你這一行的本分，別誤了戲。`
            : '';
        const user = [
            `# 你是誰\n${c.name}（${c.role}）：${c.persona}`,
            `\n# 你心底的事（只有你自己知道）\n${c.secret}`,
            smBlock ? `\n${smBlock}` : '',
            `\n# 你此刻心裡掛著的事\n${wantLines(c)}`,
            `\n# 你人在哪裡\n${c.venue}（${here?.hint ?? ''}）`,
            `\n# 你這個時辰的營生作息（一股拉力，不是命令）\n${pull.note}${pull.venue ? `（多半該在：${pull.venue}）` : ''}`,
            `\n# 此處有誰\n${presentLine}`,
            whereabouts,
            waiting,
            access,
            perception,
            oppCost,
            summons,
            worldFact,
            schemeNote,
            `\n# 這世界有哪些地方（你都知道怎麼去）\n${geographyBlock()}`,
            `\n# 你剛想起的幾件舊事\n${recallBlock}`,
            `\n# 現在是什麼時辰\n第${clock.day}日·${clock.partOfDay}${night ? '（入夜了）' : ''}`,
            `\n此刻，你（${c.name}）決定做什麼？`,
        ]
            .filter(Boolean)
            .join('\n');

        return withRetry(
            `plan(${c.name})`,
            async () => {
                const llmText = await llm();
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
                for (const t of rawTools.slice(0, MAX_TOOLS)) {
                    const tool = String((t as any)?.tool ?? '').trim();
                    if (!['time', 'move', 'recall', 'interact', 'wait', 'relations', 'work'].includes(tool)) continue;
                    tools.push({
                        tool: tool as ToolCall['tool'],
                        dest: str((t as any)?.dest),
                        target: str((t as any)?.target),
                        intent: str((t as any)?.intent),
                        query: str((t as any)?.query),
                        confide: (t as any)?.confide === true,
                    });
                }
                return { plan, tools };
            },
            this.onLog,
        );
    }

    async decideRehearsal(ctx: {
        char: Char;
        clock: WorldClock;
        reh: RehearsalCall;
        troupePresent: string[];
    }): Promise<{ call: boolean; line: string; title: string }> {
        if (ctx.reh.announced) return { call: false, line: '', title: '' };
        const system = [
            '你是春雪社的班主沈雪笙。此刻在後台妝閣，一天剛開場。',
            '你要拿一個主意：今兒起，要不要把班子叫齊了排一齣新戲。這是你自己的決定，不是誰吩咐的。',
            '若你決意要排，順著班子這幾個角兒的長處，挑一齣戲碼（如《牡丹亭·驚夢》《白蛇傳》《玉堂春》之類），',
            '再寫一句你當眾傳出去的話（把班子喚到戲台的號令，貼著你的口吻）。',
            '嚴格只輸出 JSON：{"call":true/false,"title":"若 call=true，你挑的戲碼","line":"若 call=true，你傳出去的那句話"}，不要多餘文字。',
        ].join('\n');
        const user = [
            `# 你是誰\n${ctx.char.name}（${ctx.char.role}）：${ctx.char.persona}`,
            `\n# 你心底的事\n${ctx.char.secret}`,
            `\n# 你心裡掛著的事\n${wantLines(ctx.char)}`,
            `\n# 眼下班子裡的人\n${ctx.troupePresent.join('、') || '（一時沒瞧見人）'}`,
            `\n# 現在\n第${ctx.clock.day}日·${ctx.clock.partOfDay}`,
            `\n你（沈雪笙）這一刻，叫不叫排戲？`,
        ].join('\n');
        return withRetry(
            `rehearsal(${ctx.char.name})`,
            async () => {
                const llmText = await llm();
                const client = llmText.createTextClient({ kind: 'primary' });
                const res = await client.chat({
                    model: client.defaultModel,
                    system,
                    messages: [{ role: 'user', content: user }],
                    maxTokens: 240,
                    temperature: 0.8,
                });
                const obj = (extractRewriteJson(res.text) ?? {}) as { call?: unknown; line?: unknown; title?: unknown };
                const call = obj.call === true || String(obj.call).toLowerCase() === 'true';
                const line = String(obj.line ?? '').trim() || '傳我的話：從今兒起，春雪社排新戲，都到戲台上來。';
                // The model naturally returns 《戲名》; callers typeset their own 《》,
                // so strip a surrounding pair here (prevents 《《白蛇傳》》).
                const title = (String(obj.title ?? '').trim() || '新戲').replace(/^《(.+)》$/, '$1');
                return { call, line: call ? line : '', title: call ? title : '' };
            },
            this.onLog,
        );
    }
}

// ── shared plan-context helpers ───────────────────────────────────────────────
export function selfModelBlock(c: Char, byId: Map<string, Char>): string {
    const lines: string[] = [];
    // Pinned era facts + this character's real social position (anti-anachronism).
    lines.push('# 這個世界擺在眼前的事實（別違逆）');
    lines.push(`- ${WORLD_PREMISE}`);
    lines.push(`- ${c.socialFact}`);
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

export function wantLines(c: Char): string {
    const live = c.wants.filter((w) => !w.retired).sort((a, b) => tension(b) - tension(a));
    if (!live.length) return '（暫時沒有特別掛心的事）';
    return live.map((w) => `- [${w.layer}] ${w.desc}${w.target ? `（心裡掛著${w.target}）` : ''}`).join('\n');
}

function geographyBlock(): string {
    return VENUES.map((v) => `- ${v.name}：${v.hint}`).join('\n');
}
