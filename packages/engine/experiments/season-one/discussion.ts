/**
 * DISCUSSION layer — production decisions are ARGUED OUT by characters instead of
 * decided by silent formulas. This ports the validated casting-by-discussion
 * mechanism (feat/discussion-casting-test's `casting-discussion-ab.ts`) into the
 * season and generalizes it to the other JUDGMENT stages (立意 / 填詞提意見 /
 * 排練身段).
 *
 * The validated shape, preserved here:
 *   · aspirants ADVOCATE from their OWN wants / secrets / relationships, each
 *     seeing the prior turns (a real scene, not seeded bids);
 *   · a losing aspirant may REBUT once; then the ARBITER (班主 / senior) decides;
 *   · prompts present the OPEN decision + each speaker's own position — they NEVER
 *     tell anyone who should win, and the arbiter's prompt never pre-writes it;
 *   · every check downstream is a MECHANICAL count, never LLM-judging.
 *
 * Round discipline (spec §4): advocacy ≤2 rounds + rebuttal ≤1 before the arbiter
 * reaches a decision (never a deadlock). A losing aspirant may REFUSE the verdict
 * ONCE for drama — their choice, bounded, and it does not reopen the decision.
 *
 * Offline: every surface goes through troupe's `askJson`, so in the FAKE-LLM
 * smoke (ask.mock) a deterministic in-world fallback runs and the whole layer
 * exercises with zero keys. In the REAL run the same prompts hit GLM-4.6.
 */

import { askJson, type Ask } from '@endless-story/troupe';

// ── Round caps (spec §4) ──────────────────────────────────────────────────
export const ADVOCACY_CAP = 2;
export const REBUTTAL_CAP = 1;
/** contested casting may run the full advocacy+rebuttal budget. */
export const CASTING_ROUND_CAP = ADVOCACY_CAP + REBUTTAL_CAP; // 3
/** the lighter judgment stages get a single round before the senior rules. */
export const LIGHT_ROUND_CAP = 1;

// ── An advocate's card — assembled from world (secret + live wants) + troupe
//    member (relationships + voice). The speaker only ever sees their OWN card. ─
export interface AdvocateCard {
    id: string;
    name: string;
    /** 行當·應工 label. */
    role: string;
    /** part NAMES this member is 行當-eligible for (fitScore>0). */
    canPlay: string[];
    /** the member's in-world voice hint. */
    description: string;
    /** the character's private secret (from the world preset). */
    secret: string;
    /** their live wants, one line (from the season's living-want lane). */
    want: string;
    /** their relationships, one line. */
    relationships: string;
}

export interface AdvocacyMove {
    /** part they want to PLAY, or 無. */
    self_want: string;
    /** whom they lobby for. */
    push: { who: string; part: string }[];
    /** said aloud (heard by the room). */
    speech: string;
    /** unspoken. */
    inner: string;
}

/** A production reshape the arbiter may grant to a slot-less hot want. */
export interface Reshape {
    forName: string;
    /** the added beat/亮相's title. */
    beatTitle: string;
    /** e.g. 武戲亮相 / 加場 / 擴角. */
    kind: string;
    desc: string;
}

export interface CastArbitration {
    /** partName → actorName, all parts filled (no deadlock). */
    cast: Record<string, string>;
    /** announced aloud, in the arbiter's voice. */
    arbitration: string;
    /** her private weighing (may reason from her own secret). */
    reasoning: string;
    /** a reshape granted to a slot-less want, if any. */
    reshape?: Reshape | null;
}

export interface RefusalResult {
    refuse: boolean;
    line: string;
}

export interface LiyiDecision {
    /** the decided 立意/氣質 line (may differ from the repertoire default). */
    qizhi: string;
    /** the senior's announced ruling. */
    line: string;
    reasoning: string;
    seniorNote: string;
    seniorName: string;
}

export interface NoteResult {
    criticName: string;
    authorName: string;
    /** the note given on the 詞/唱腔. */
    note: string;
    /** the revised line the author accepted (empty = no change). */
    revisedLine: string;
}

export interface RehearsalNote {
    criticName: string;
    targetName: string;
    note: string;
    /** the target's acknowledgement (找師姐對戲 etc.). */
    ack: string;
}

// ── One recorded turn + the whole discussion record (mechanical audit) ──────
export interface DiscussionTurn {
    phase: string;
    speaker: string;
    said: string;
    inner?: string;
}

export interface DiscussionRecord {
    stage: '選劇立意' | '選角' | '填詞提意見' | '排練身段';
    contestedPart?: string;
    /** who voiced a want (self or pushed) for the contested part. */
    aspirants: string[];
    turns: DiscussionTurn[];
    arbiter: string;
    arbitrationLine: string;
    /** cast map for 選角; a decided text line for the lighter stages. */
    decision: string;
    rounds: number;
    cap: number;
    decided: boolean;
    reshape?: Reshape | null;
    refusal?: { by: string; line: string } | null;
    revision?: { of: string; note: string; newLine: string } | null;
}

// ── Prompt scaffolding shared by advocacy + rebuttal ────────────────────────
function cardBlock(c: AdvocateCard): string {
    return (
        `姓名：${c.name}（${c.role}）\n你唱得了的角色：${c.canPlay.join('、') || '（非上台的行當）'}\n` +
        `你的為人：${c.description}\n你的心事（沒人知道）：${c.secret}\n你此刻的想望：${c.want}\n你的關係：${c.relationships}`
    );
}

const isMove = (v: unknown): v is AdvocacyMove =>
    !!v && typeof (v as AdvocacyMove).speech === 'string';

/** Round-1 advocacy — self-nominate / lobby / concede, seeing prior turns. */
export async function advocate(
    ask: Ask,
    c: AdvocateCard,
    brief: string,
    transcript: string,
): Promise<AdvocacyMove> {
    const m = await askJson<AdvocacyMove>(
        ask,
        {
            system:
                '你是民國上海春雪社的一名角兒。班主沈雪笙要為一場会串排《白蛇傳·斷橋》，當眾議定選角。' +
                '這是一次公開的排戲議事，各人可以自薦、舉薦、爭取，也可以退讓。你只代表你自己說話，' +
                '從你自己的處境、心事、想望出發。不要替別人做決定，也不要替班主定案——最後是班主拍板。' +
                '用民初梨園白話，短、直、帶點火氣或分寸，像後台真人在爭一個角色，不要旁白解說、不要現代腔。',
            user:
                `${brief}\n\n── 你是誰 ──\n${cardBlock(c)}\n\n` +
                `── 議事到此為止，眾人已說的話（照原話）──\n${transcript || '（你是頭一個開口的）'}\n\n` +
                `輪到你當眾說話。只輸出 JSON：\n` +
                `{"self_want":"你想親自演的角色（或 無）","push":[{"who":"人名","part":"角色"}],` +
                `"speech":"你當眾說的話，3到6句","inner":"你沒說出口的一句"}`,
            maxTokens: 700,
            temperature: 0.9,
        },
        () => fallbackAdvocate(c),
        isMove,
    );
    if (!Array.isArray(m.push)) m.push = [];
    return m;
}

/** Round-2 rebuttal — the contested aspirants answer the full room, once. */
export async function rebut(
    ask: Ask,
    c: AdvocateCard,
    brief: string,
    transcript: string,
): Promise<AdvocacyMove> {
    const m = await askJson<AdvocacyMove>(
        ask,
        {
            system:
                '你是民國上海春雪社的一名角兒，方才的選角議事還沒散。你聽完了滿屋子的話，此刻要再回一句——' +
                '可以應戰、可以退讓、可以把話說重也可以鬆口，全看你自己的心。你只代表你自己，不替班主定案。' +
                '民初梨園白話，短、真，不要旁白。',
            user:
                `${brief}\n\n── 你是誰 ──\n${cardBlock(c)}\n\n` +
                `── 方才滿屋子的話（照原話）──\n${transcript}\n\n` +
                `你再回一句。只輸出 JSON：\n` +
                `{"self_want":"此刻你想親自演的角色（或 無）","push":[{"who":"人名","part":"角色"}],` +
                `"speech":"你當眾回的話，2到4句","inner":"沒說出口的一句"}`,
            maxTokens: 600,
            temperature: 0.9,
        },
        () => fallbackRebut(c),
        isMove,
    );
    if (!Array.isArray(m.push)) m.push = [];
    return m;
}

/** 班主 arbitrates — fills every part, may grant a reshape to a slot-less want. */
export async function arbitrateCasting(
    ask: Ask,
    arbiter: { name: string; description: string; secret: string },
    brief: string,
    transcript: string,
    partNames: string[],
    slotless: { name: string; want: string } | null,
): Promise<CastArbitration> {
    const reshapeClause = slotless
        ? `\n有一位角兒（${slotless.name}）的想望，現有的角色都盛不下：「${slotless.want}」。` +
          `你可以（也可以不）替她把戲改一改——加一段亮相、擴一個角、插一段武戲，讓這口氣有處落。` +
          `若你決定改，在 JSON 裡給出 "reshape"；不改就給 null。`
        : '';
    const arb = await askJson<CastArbitration>(
        ask,
        {
            system:
                '你是春雪社班主沈雪笙。你昔年也工小生，如今封箱，坐鎮後台。方才眾角當眾爭了選角，' +
                '如今要你拍板定案。你按你自己的眼光與心事決斷：戲要立得住，班要撐得下去，人也要你來權衡。' +
                `你必須把 ${partNames.join('、')} 都指定到人，不許懸而不決。用民初梨園白話宣佈，帶班主的分量，不要旁白。`,
            user:
                `${brief}\n\n── 你這個人 ──\n${arbiter.description}\n你的心事（沒人知道）：${arbiter.secret}${reshapeClause}\n\n` +
                `── 方才滿屋子爭的話（照原話）──\n${transcript}\n\n` +
                `如今你拍板。只輸出 JSON：\n` +
                `{"cast":{${partNames.map((p) => `"${p}":"人名"`).join(',')}},` +
                `"arbitration":"你當眾宣佈時說的話","reasoning":"你心裡真正的權衡",` +
                `"reshape":${slotless ? '{"forName":"人名","beatTitle":"加的戲名","kind":"武戲亮相","desc":"一句說明"} 或 null' : 'null'}}`,
            maxTokens: 900,
            temperature: 0.85,
        },
        () => fallbackArbitration(partNames, slotless),
        (v): v is CastArbitration => !!v && typeof (v as CastArbitration).cast === 'object',
    );
    if (!arb.reshape) arb.reshape = null;
    return arb;
}

/** A losing aspirant's ONE optional refusal — their choice, bounded, non-reopening. */
export async function refuseVerdict(
    ask: Ask,
    c: AdvocateCard,
    verdict: string,
): Promise<RefusalResult> {
    return askJson<RefusalResult>(
        ask,
        {
            system:
                '你是春雪社一名角兒，方才班主當眾拍了選角，你沒爭到你想要的角色。你可以認、也可以當場擱下一句不服的話——' +
                '這是你自己的選擇，但戲還是班主定的，改不了。民初梨園白話，一兩句，不要旁白。',
            user:
                `班主的定案：${verdict}\n你是 ${c.name}（${c.role}）。你此刻的心事：${c.secret}\n` +
                `只輸出 JSON：{"refuse":true 或 false,"line":"你當場的一句話"}`,
            maxTokens: 300,
            temperature: 0.9,
        },
        () => fallbackRefuse(c),
        (v): v is RefusalResult => !!v && typeof (v as RefusalResult).refuse === 'boolean',
    );
}

/** 立意/選劇 — a senior proposes an interpretation, 班主 rules, before the brief locks. */
export async function deliberateLiyi(
    ask: Ask,
    arbiter: { name: string; description: string; secret: string },
    senior: AdvocateCard,
    play: { title: string; defaultQizhi: string; premiseSeed: string },
): Promise<LiyiDecision> {
    return askJson<LiyiDecision>(
        ask,
        {
            system:
                '你是春雪社的老角與班主，在開排前議這齣《' +
                play.title +
                '》立意——這戲到底要立在哪個心上。先由老角進一言，再由班主定。' +
                '民初梨園白話，短、真，不要旁白。',
            user:
                `戲：《${play.title}》。舊本的路子：${play.premiseSeed}（氣質：${play.defaultQizhi}）。\n` +
                `老角 ${senior.name}（${senior.role}）的為人：${senior.description}\n` +
                `班主 ${arbiter.name} 的心事：${arbiter.secret}\n\n` +
                `只輸出 JSON：{"seniorNote":"老角進的一言","qizhi":"班主定下的立意/氣質一句","line":"班主當眾定案的話","reasoning":"班主沒說出口的權衡"}`,
            maxTokens: 600,
            temperature: 0.85,
        },
        () => fallbackLiyi(arbiter, senior, play),
        (v): v is LiyiDecision => !!v && typeof (v as LiyiDecision).qizhi === 'string',
    ).then((d) => ({ ...d, seniorName: senior.name }));
}

/** 填詞提意見 — a critic gives a note on a drafted 詞, the author revises one line. */
export async function noteOnCi(
    ask: Ask,
    critic: AdvocateCard,
    author: { name: string },
    ci: { title: string; lines: string[] },
): Promise<NoteResult> {
    return askJson<NoteResult>(
        ask,
        {
            system:
                '你是春雪社的角兒，方才聽了同行填的一段唱詞，替他把把關——對唱腔唱詞提一句意見，' +
                '再由填詞的人改一句。民初梨園白話，短、實在，不要旁白。',
            user:
                `這段〈${ci.title}〉的詞：\n${ci.lines.join('\n')}\n\n` +
                `提意見的是 ${critic.name}（${critic.role}）；填詞的是 ${author.name}。\n` +
                `只輸出 JSON：{"note":"你提的一句意見","revisedLine":"你建議改成的那一句（七字左右）"}`,
            maxTokens: 400,
            temperature: 0.85,
        },
        () => fallbackNote(critic, ci),
        (v): v is NoteResult => !!v && typeof (v as NoteResult).note === 'string',
    ).then((r) => ({ ...r, criticName: critic.name, authorName: author.name }));
}

/** 排練身段 — a craft-strong performer notes another's 台步; the target 找師姐對戲. */
export async function noteOnRehearsal(
    ask: Ask,
    critic: AdvocateCard,
    target: AdvocateCard,
): Promise<RehearsalNote> {
    return askJson<RehearsalNote>(
        ask,
        {
            system:
                '你是春雪社的角兒，排戲時看了同台一位的身段台步，替他點一句——身段、台步、亮相上的實在意見，' +
                '對方再應一句（可以說去找師姐對戲）。民初梨園白話，短，不要旁白。',
            user:
                `你是 ${critic.name}（${critic.role}），台步是硬功夫。看的是 ${target.name}（${target.role}）的身段。\n` +
                `只輸出 JSON：{"note":"你點的一句","ack":"對方應的一句"}`,
            maxTokens: 400,
            temperature: 0.85,
        },
        () => fallbackRehearsal(critic, target),
        (v): v is RehearsalNote => !!v && typeof (v as RehearsalNote).note === 'string',
    ).then((r) => ({ ...r, criticName: critic.name, targetName: target.name }));
}

// ── Deterministic in-world fallbacks (the FAKE-LLM smoke) ───────────────────
function fallbackAdvocate(c: AdvocateCard): AdvocacyMove {
    switch (c.name) {
        case '江聞鶴':
            return {
                self_want: '許仙',
                push: [],
                speech: '許仙這個少年郎，我想唱一場真的。輸贏在其次，戲得立得住——一個外聘的男小生，也該有一場真對手戲。',
                inner: '怕自己這套本事，在新的上海已經不夠人看。',
            };
        case '柳安春':
            return {
                self_want: '許仙',
                push: [],
                speech: '師姐要我配這齣生旦，我想接。可我怕——怕我這演出來的男人，比不過一個真的。',
                inner: '不敢回頭看師姐的眼；金鳳那筆帳也還欠著。',
            };
        case '蘇映雪':
            return {
                self_want: '白素貞',
                push: [{ who: '柳安春', part: '許仙' }],
                speech: '白素貞我來。許仙——我舉薦生春，八年生旦，台上夫妻該是台下照見的那一對。',
                inner: '台下最貼近那一步，我總收住手。',
            };
        case '連翹':
            return {
                self_want: '小青',
                push: [],
                speech: '小青我扛得住。可我不甘只做陪襯打女——給我一段亮相，讓上海看見我這個靠身體站台心的人。',
                inner: '若我也站到台心，沈老板會不會終於看見我。',
            };
        default:
            return { self_want: '無', push: [], speech: '班主定了算，我聽班主的。', inner: '' };
    }
}

function fallbackRebut(c: AdvocateCard): AdvocacyMove {
    switch (c.name) {
        case '江聞鶴':
            return {
                self_want: '許仙',
                push: [],
                speech: '柳老板的難處我懂。可正因為難，這場對手戲才值得真刀真槍地唱一回。',
                inner: '我越怕，越不肯走。',
            };
        case '柳安春':
            return {
                self_want: '許仙',
                push: [],
                speech: '……好。我接。師姐在對面，我總不能縮著。',
                inner: '演出來的男人，這一回我要它是真的。',
            };
        default:
            return { self_want: '無', push: [], speech: '我沒別的話了。', inner: '' };
    }
}

function fallbackArbitration(
    partNames: string[],
    slotless: { name: string; want: string } | null,
): CastArbitration {
    const cast: Record<string, string> = {};
    if (partNames.includes('白素貞')) cast['白素貞'] = '蘇映雪';
    if (partNames.includes('許仙')) cast['許仙'] = '柳安春';
    if (partNames.includes('小青')) cast['小青'] = '連翹';
    // Fill any remaining part deterministically so there is never a deadlock.
    for (const p of partNames) if (!cast[p]) cast[p] = '蘇映雪';
    return {
        cast,
        arbitration:
            '許仙，生春演。江老板的本事我看在眼裡，可這齣戲要的是台下那對照見台上——生春同映雪，八年了，' +
            '這口氣別的人替不了。江老板，你這場沒白爭，往後有你一齣真對手戲。',
        reasoning: '那柄扇太像當年的我。我護她，也怕她走上我的舊路；可這戲，非她不可。',
        reshape: slotless
            ? {
                  forName: slotless.name,
                  beatTitle: '小青·水鬥踏月亮相',
                  kind: '武戲亮相',
                  desc: '斷橋之前加一段小青紮靠踏月的鎮場武戲，讓連翹替自己寫一段站台心的戲。',
              }
            : null,
    };
}

function fallbackRefuse(c: AdvocateCard): RefusalResult {
    if (c.name === '江聞鶴')
        return {
            refuse: true,
            line: '這口氣我先擱著。班主的話我認，可這場戲沒唱成，我不算輸。',
        };
    return { refuse: false, line: '班主定的，我認。' };
}

function fallbackLiyi(
    arbiter: { name: string },
    senior: AdvocateCard,
    play: { defaultQizhi: string },
): LiyiDecision {
    return {
        seniorNote: '這齣斷橋，我想不只演人妖天條，是演一個「明知留不住，還是不肯放手」的心。',
        qizhi: '哀而不傷，舊調翻作凡塵裡的悔與不捨——重的是那句沒說出口的話。',
        line: `就照${senior.name}說的，往「不肯放手」上立，別只演天條。`,
        reasoning: `那句沒說出口的話，我自己也欠了一輩子。（舊本氣質：${play.defaultQizhi}）`,
        seniorName: senior.name,
    };
}

function fallbackNote(critic: AdvocateCard, ci: { lines: string[] }): NoteResult {
    return {
        criticName: critic.name,
        authorName: '',
        note: '末句收得太冷、太快。斷橋的恨底下是不肯認，往「不認」上改，別只自憐。',
        revisedLine: '腸斷青衫不認寒',
    };
}

function fallbackRehearsal(critic: AdvocateCard, target: AdvocateCard): RehearsalNote {
    return {
        criticName: critic.name,
        targetName: target.name,
        note: '你這摺扇收得太急，少年郎的心虛要走在腳下——台步先慢半拍，扇再跟上。',
        ack: '……我記下了。這段我去找師姐對一遍再上。',
    };
}
