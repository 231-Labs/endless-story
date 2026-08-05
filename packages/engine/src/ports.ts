/**
 * Engine ports — the seams between the pure narrative loop and the outside world.
 *
 * The tick pipeline (src/tick.ts) talks ONLY to these interfaces; concrete
 * adapters (src/adapters/*) bind them to a fake or a real backend. This is what
 * lets the engine run local-first (fake agent + local JSON memory + markdown
 * archive) today and swap in chain / MemWal / Seal adapters later (M2) without
 * touching the loop.
 *
 * Every port is LOUD on failure: an adapter that cannot do its job THROWS. The
 * loop never swallows a port error into a silent empty result (RUNNER_V2 §7 +
 * the CHARACTER_LIFECYCLE §6 diagnosis of production's `catch(()=>[])` rot).
 *
 * Runner shapes are reused as-is via `import type` (erased at runtime, so this
 * module — and the barrel that re-exports it — stays node-clean and never pulls
 * runner's `.js`-specifier graph into `node --test`).
 */

import type { CardProposal } from './core/event-deck.ts';
import type { SceneAgent } from './core/scene-loop.ts';
import type { RegenerateWantInput, RewriteLedgerInput, RewriteReply, RewriteSpawn } from './core/want-rewrite.ts';
import type { WantSemanticTag, WantSource, WantSubjectRef } from './core/want-core.ts';
import type * as Runner from '@endless-story/runner';
import { PARTS_OF_DAY, type PartOfDay } from '@endless-story/shared/world-clock';

// ── Re-used runner authorship shapes (type-only) ─────────────────────────────
export type DeriveWantsInput = Runner.characterAgent.DeriveWantsInput;
export type GenesisWant = Runner.characterAgent.GenesisWant;
export type MoveDecideInput = Runner.characterAgent.MoveDecideInput;
export type MoveDecideResult = Runner.characterAgent.MoveDecideResult;
export type TransitReactInput = Runner.characterAgent.TransitReactInput;
export type TransitReaction = Runner.characterAgent.TransitReaction;
export type NegotiateCounterInput = Runner.characterAgent.NegotiateCounterInput;
export type NegotiateCounterReply = Runner.characterAgent.NegotiateCounterReply;
export type RehearsalDecideInput = Runner.characterAgent.RehearsalDecideInput;
export type RehearsalDecideReply = Runner.characterAgent.RehearsalDecideReply;
export type SpeakPrayerInput = Runner.characterAgent.SpeakPrayerInput;
// 資助搭救 (decideAid): a moneyed character weighs giving some of their OWN coin
// to a co-present peer in real hardship. The give/no-give judgment is the
// capability's (runner aid.ts); the engine only feeds it real state.
export type AidActionInput = Runner.characterAgent.AidActionInput;
export type AidActionResult = Runner.characterAgent.AidActionResult;
export type AidPeer = Runner.characterAgent.AidPeer;
export type AidGift = Runner.characterAgent.AidGift;
export type AidRelation = Runner.characterAgent.AidRelation;
export type AidSituation = Runner.characterAgent.AidSituation;
export type AidVitality = Runner.characterAgent.AidVitality;
export type AidMemo = Runner.characterAgent.AidMemo;
export type AidManner = Runner.characterAgent.AidManner;
// 叩門/放行 (decideAdmit): the occupant of a private home decides, through the
// door, whether to admit a night knocker; consent lives with the occupant,
// never the visitor's ardor. The judgment is the capability's (runner admit.ts);
// the engine only feeds it real state and reads the verdict.
export type AdmitDecideInput = Runner.characterAgent.AdmitDecideInput;
export type AdmitDecideReply = Runner.characterAgent.AdmitDecideReply;
// 邀約 (decideInvite): the REVERSE of 叩門 — by day a pressing 愛/情/虧欠 want
// toward a co-present person may hand them tonight's word (a one-time 領入 to
// the inviter's OWN home). Offering is the inviter's decision; using it tonight
// stays the invitee's move choice. Not offering is also an answer.
export type InviteDecideInput = Runner.characterAgent.InviteDecideInput;
export type InviteDecideReply = Runner.characterAgent.InviteDecideReply;
// 告借/應借 (decideLend): 借錢是兩造的事——錢動之前，出借的人先點頭；婉拒也是
// 一句回答。The judgment is the capability's (runner lend.ts); the engine only
// feeds it real state and commits the verdict (transfer + 欠條 bill on a yes).
export type LendDecideInput = Runner.characterAgent.LendDecideInput;
export type LendDecideReply = Runner.characterAgent.LendDecideReply;
// 復核座席 (decideRecruit): a user-minted candidate (命名權＋seed 權) passes the
// 班主's three gates (正典/文風/安全) before the world admits them; an accept
// 拓寫s the user's seed into cast format, preserving ≥1 user sentence verbatim
// in memories (擁有感錨點). Driven by the MINT flow, not the tick.
export type RecruitCandidate = Runner.characterAgent.RecruitCandidate;
export type RecruitDecideInput = Runner.characterAgent.RecruitDecideInput;
export type RecruitDecideReply = Runner.characterAgent.RecruitDecideReply;
export type RecruitExpandedSeed = Runner.characterAgent.RecruitExpandedSeed;
export type AftermathInput = Runner.characterAgent.AftermathInput;
export type RippleJudgeInput = Runner.characterAgent.RippleJudgeInput;
export type RippleJudgeDelta = Runner.characterAgent.RippleJudgeDelta;
export type WeaveTickInput = Runner.sceneRecord.WeaveTickInput;
export type ReviewChapterInput = Runner.sceneRecord.ReviewChapterInput;
export type ReviewChapterReply = Runner.sceneRecord.ReviewChapterReply;
export type ComposeEpisodeInput = Runner.eventChapter.ComposeEpisodeInput;
export type ReviewSceneInput = Runner.characterAgent.ReviewSceneInput;
export type ReviewSceneReply = Runner.characterAgent.ReviewSceneReply;
export type PovReflectInput = Runner.characterAgent.PovReflectInput;
export type PovSceneInput = Runner.characterAgent.PovSceneInput;
export type JudgeEstablishedInput = Runner.characterAgent.JudgeEstablishedInput;
export type DossierCanonicalEvent = Runner.eventDossier.DossierCanonicalEvent;
export type DossierPerspectiveSource = Runner.eventDossier.DossierPerspectiveSource;

// ── 導演選牌 (the director seat) ──────────────────────────────────────────────
//
// The director's authority is exactly three decisions — WHICH card, WHEN (by
// declining), WHOM — plus dressing the card's face in world language. The engine
// computes the eligible set and settles every consequence, so a director cannot
// invent a card, invent a target, or touch a number. See core/event-deck.ts.

/** One card the engine is willing to have played on this exact tick. */
export interface DirectorOfferedCard {
    cardId: string;
    /** the card's own face text. */
    label: string;
    /** one line on what this card does, so the choice is informed. */
    note?: string;
    /** a 死線卡: it lands whether or not the director picks it. Dress only. */
    forced: boolean;
    /** the ONLY ids this card may be aimed at. */
    candidates: Array<{ id: string; name: string }>;
    /** how many of the candidates to name (0 ⇒ the card aims itself). */
    pickCount: number;
}

export interface DirectorPickInput {
    day: number;
    clock: string;
    offered: DirectorOfferedCard[];
    /** Prose-only picture of where the world stands. NEVER a figure the director
     *  could act on — money, tension and box office stay the engine's business. */
    worldBrief: string[];
    /** cards that will land regardless of this reply. */
    forcedCardIds: string[];
    /**
     * 自撰一張 — the director may, instead of picking, assemble a card the deck
     * never contained. Offered only when the season/day quota still allows it.
     *
     * This is the deck's one escape hatch and it is deliberately narrow: the
     * proposal is built from the SAME finite effect primitives every authored
     * card uses, inside magnitude caps the engine enforces (`PROPOSAL_LIMITS`),
     * aimed at real people. Anything out of bounds is refused with reasons and
     * logged. See `validateProposal`.
     */
    mayPropose?: boolean;
}

export interface DirectorPickReply {
    /** must be one of the offered `cardId`s; anything else is refused. */
    cardId: string;
    /** must be drawn from that card's `candidates`; unknown ids are dropped. */
    targetIds?: string[];
    /** 穿戲服 — the card's face rewritten in world language. Text only. */
    costume?: string;
    /** one line of reasoning, recorded in the director log for audit. */
    rationale?: string;
    /** a legitimate answer on any non-deadline tick: not yet. */
    decline?: boolean;
    /**
     * 自撰的牌 — a card of the director's own making, considered only when
     * `mayPropose` was set and no offered card was chosen. Validated before it
     * can touch the world; a refusal is logged with every reason, so a director
     * that keeps overreaching is diagnosable from the run alone.
     */
    propose?: CardProposal;
}

// ── 債主的態度 (the creditor's seat) ──────────────────────────────────────────
//
// 月半結帳 moves no money. What it does is CALL the debt, and how hard it is
// called belongs to the creditor, not to the clock and not to the engine. A
// creditor who genuinely does not mind is allowed not to mind; a creditor who
// has been put off twice is allowed to stop being quiet about it.
//
// The seat is handed plain facts and returns one of three stances. It never sees
// a raw figure it could do arithmetic on, and it cannot move money — the engine
// settles the social consequence of whichever stance comes back.

export interface DebtStanceInput {
    day: number;
    billId: string;
    /** the creditor deciding (their own name, when they are a person). */
    creditorName: string;
    /** their authored 立場, when the frame gave the house one. */
    stance?: string;
    /** how their own books feel, in words: 「手頭也緊」「還撐得住」. */
    creditorFooting: string;
    debtorName: string;
    label: string;
    /** the amount as world language (「三圓」), never a bare number. */
    owedText: string;
    daysOverdue: number;
    /** how many times this same debt has already been called at a reckoning. */
    priorCalls: number;
    /** could they have paid, as far as the street can tell? This is the whole
     *  question: 還不出 and 不肯還 are different matters. */
    debtorCouldPay: boolean;
}

export interface DebtStanceReply {
    /** 免了 — tear the paper up; they owe you a 人情 instead.
     *  催 — say it to their face; the debt stands, the street stays out of it.
     *  傳出去 — say it to the street; the debt stands, and so does their name. */
    stance: 'forgive' | 'press' | 'broadcast';
    /** one line of reasoning, recorded for audit — never a mechanism. */
    note?: string;
}

// ── 角色工件 (diary + poem seats) ─────────────────────────────────────────────

export interface ComposeDiaryInput {
    characterId: string;
    name: string;
    persona: string;
    secret?: string;
    day: number;
    /** the day's citable beats — the ONLY evidence a claim may rest on. Each
     *  `ref` is engine-minted, so a fabricated citation cannot resolve. */
    evidence: Array<{ ref: string; clock: string; sceneName: string; text: string; inner?: string }>;
    /** the character's live 心事, in their own words. */
    wantLines: string[];
    /** their TRUE purse in world language — stated so the diary cannot drift off
     *  the ledger (the observed 24 圓 / 七十圓 failure). */
    purseLine?: string;
}

export interface ComposeDiaryReply {
    /** the diary prose the reader gets. */
    body: string;
    /** each assertion plus the `beat:N` refs it rests on. Audited by the engine;
     *  an unsupported claim is FLAGGED, not silently dropped. */
    claims: Array<{ text: string; evidenceRefs: string[] }>;
}

export interface ComposePoemInput {
    characterId: string;
    name: string;
    persona: string;
    day: number;
    clock: string;
    /** why today (張力尖峰／相許／被拒／送別／結帳). */
    occasion: string;
    occasionLine: string;
    /** the want the occasion turns on, in the character's own words. */
    wantDesc?: string;
    otherName?: string;
    sceneName?: string;
}

export interface ComposePoemReply {
    title?: string;
    body: string;
}

/** Dedicated mechanism-metadata declaration seat. The ordinary character-owned
 * want prose can be born or rewritten without gaining authority over engine
 * gates; STRICT calls this separate seat immediately before persistence. */
export interface DeclareWantSemanticsInput {
    source: WantSource;
    characterId: string;
    characterName: string;
    desc: string;
    layer?: string;
    target?: string;
    cast: Array<{ id: string; name: string }>;
    subjects: Array<WantSubjectRef & { label: string }>;
}

export interface DeclareWantSemanticsReply {
    semanticTags: WantSemanticTag[];
    /** Exact cast id or name, or absent when the want is not person-directed. */
    target?: string;
    /** Exact subject candidate, or absent when the want is not about one. */
    subjectRef?: WantSubjectRef;
}

// ── Objective event → character-session delivery ───────────────────────────
export interface CanonicalSceneBeat {
    characterId: string;
    name: string;
    text: string;
    /** Named addressee, when the actor directed the beat at one person. */
    addressed?: string;
    /** Structured delivery intent, never inferred from the prose. */
    audience: 'scene' | 'addressed';
    /** Characters who perceived the exact content; other co-present witnesses
     *  receive a redacted physical observation instead. */
    perceiverIds: string[];
    /** Private to the actor; delivery adapters must never show it to witnesses. */
    inner?: string;
    /** Validated objective physical mutations committed with this beat. */
    objectEffects?: Runner.characterAgent.BeatObjectEffect[];
    /** Validated money/contract commands committed with this beat (the ledger
     *  receipts are recoverable by causeEventId in the season economy). */
    economyCommands?: Runner.characterAgent.BeatEconomyCommand[];
}

export interface CanonicalSceneEvent {
    v: 1;
    id: string;
    sagaId: string;
    day: number;
    tick: number;
    clock: string;
    sceneId: string;
    sceneName: string;
    visibility: 'public' | 'private';
    witnessIds: string[];
    beats: CanonicalSceneBeat[];
    /** Objective dramatic movement captured before any prose editor sees it. */
    editorialSignals?: {
        resolvedWants: number;
        departures: number;
        relationshipTurn: boolean;
        objectChanges?: number;
    };
}

export interface ObserveSceneInput {
    event: CanonicalSceneEvent;
    characterId: string;
    name: string;
    persona: string;
}

// ── Structured open-action (SEASON_ONE_SLICE §2/§3) ──────────────────────────
/**
 * A character's self-tagged action kind. The LLM tags its OWN action; the engine
 * routes off the tag — NO regex classification of prose (the fix the emergence
 * test demanded, where 蘇 添唱詞 = a compose was mis-read as personal). `target`
 * only carries for `seek_person`.
 */
export type ActionKind =
    | 'propose_play'
    | 'join_play'
    | 'compose'
    | 'rehearse'
    | 'seek_person'
    | 'perform'
    | 'personal';

export interface ChooseActionInput {
    name: string;
    persona: string;
    role?: string;
    /** Private inner-life secret (colours the choice; never shown to others). */
    secret?: string;
    /** The character's live wants (layer + desc + optional target). */
    wants: Array<{ layer: string; desc: string; target?: string }>;
    /** Recalled memory snippets. */
    memories?: string[];
    /** ALWAYS-AVAILABLE self-model block (durable identity + current one-line view
     *  of significant others) from WorldState.selfModelBlock — NOT recall. Current
     *  and un-evictable by construction; injected on every decision. */
    selfModel?: string;
    /** Season world-fact injected as state-of-the-world (prologue essence at t0 +
     *  the decrementing deadline line) — a FACT, never an instruction. */
    worldFact: string;
    /** Short running log of what everyone has recently done. */
    sharedLog: string[];
    /** Current state of the 新戲-in-progress, or null if none yet. */
    playSummary?: string | null;
    castNames: string[];
}

export interface ChooseActionResult {
    /** First-person prose of what the character does this tick. */
    prose: string;
    /** The character's self-tag; the engine routes off this, never off the prose. */
    kind: ActionKind;
    /** Who the character seeks (name), only meaningful for `seek_person`. */
    target?: string;
}

// ── Audience reaction (box-office PROSE only; never the number) ───────────────
export interface AudienceReactionInput {
    audienceName: string;
    /** The performance material lines. */
    performanceLines: string[];
    /** This member's warmth toward the troupe (context for the prose only). */
    warmth: number;
}

// ── Nightly self-model consolidation (user's ③; latest-wins OVERWRITE) ─────────
/** One person this character dealt with today, with the current view + what
 *  actually happened, so the OVERWRITE is grounded (§2.43 no scripting). */
export interface SelfModelInteraction {
    otherId: string;
    otherName: string;
    /** Identity guard data: the other's 身/sex + 行當, so the nightly view never
     *  flips a pronoun or re-assigns a trade (金鳳's view once wrote the 坤生 as
     *  「他身子」 and kept a literalized 借據 alive for weeks). */
    otherBodyFact?: string;
    otherRole?: string;
    /** The current (pre-consolidation) one-line view, if any. */
    currentView?: string;
    /** Verbatim of what passed between them today (scene beats / the settling). */
    todayText: string;
    /** True when a want of this character AIMED AT this person was settled/closed
     *  today — the relationship materially changed (the latest-wins trigger). */
    resolvedWithThem?: boolean;
}

export interface SelfModelConsolidateInput {
    name: string;
    persona: string;
    secret?: string;
    /** The character's current durable identity facts (may gain one insight). */
    coreIdentity: string[];
    /** People interacted with today + core relationships to refresh. */
    interactions: SelfModelInteraction[];
    /** The narrative day, for grounding phrasing. */
    day: number;
}

// ── Nightly day-planning (N6): evolve a standing plan across days ─────────────
/** Input for one character's nightly plan regeneration. The tick populates only
 *  cheaply-available facts; the adapter maps it onto the full runner PlanInput. */
export interface PlanDayInput {
    name: string;
    role: string;
    sagaName: string;
    /** "第 N 日 · 時辰" for time-grounding. */
    dayLabel: string;
    /** Previous plan text (the thing we evolve, not reset). */
    currentPlan?: string;
    /** Today's lines that involved this character (grounds the plan in what happened). */
    recentSituation?: string;
    /** Objective world pressure right now: the day's charter, due deadlines, economy. */
    situation?: string;
    /** This character's current one-line views of significant others (their bonds). */
    relationshipPressure?: string[];
    /** This character's own private secret (colours what they guard while planning). */
    innerSecret?: string;
    /** 營生・口碑 framing: a role-rhythm + reputation stake so the plan orients toward
     *  the character's CRAFT and standing (『白天排戲、入夜登台是本分；名頭要靠一場場戲
     *  攢』), not just 去吃糖粥. Tailored per role by the tick (performer vs non-troupe;
     *  omitted when the world carries no livelihood). Optional & backward-compatible. */
    livelihoodFraming?: string;
}

export interface PlanDayReply {
    /** Formatted standing-plan block (長期目標／眼下打算／未竟之事) to store + inject.
     *  Empty string → keep the prior plan unchanged. */
    planText: string;
}

// ── 折子 (interlude): 拍與拍之間，外來刺激喚起的單角色有界演繹 ────────────────
/** 一則外來刺激 —— 東家留言、實驗者戳世界、（P1b）鏈上事件映射而來。純資料，
 *  排在 `WorldData.pendingStimuli` 佇列裡等著被合併成一次折子。 */
export interface InterludeStimulus {
    id: string;
    characterId: string;
    /** P1：'poke'（實驗者戳）| 'note'（留言）；P1b 鏈側三源再擴。 */
    kind: 'poke' | 'note';
    text: string;
    atRealMs: number;
}

/** 折子座席收到的全部所見：此人、此刻、debounce 窗內合併的全部捎話。
 *  受限動詞集——聽見／回話／記下心事，不開場景、不 weave、不判官。 */
export interface InterludeInput {
    characterId: string;
    name: string;
    /** debounce 窗內合併後的全部刺激。 */
    stimuli: InterludeStimulus[];
    clock: WorldClock;
    /** mirror 世界的日期標籤（民國十五年八月五日）；tick 世界缺省。 */
    dateLabel?: string;
    /** 行當節律「此刻本該在哪」一行（有則附）。 */
    activityHint?: string;
    /** 座席側解析持久 session 身分用（key = sagaId + characterId，canon 取 persona）。
     *  引擎有就給；缺席時真座席退回無 session 的單輪，機制不變。 */
    sagaId?: string;
    persona?: string;
}

export interface InterludeReply {
    /** 聽見後的一句回應（可含動作記述）。 */
    response: string;
    /** 選配：記一筆心事（入長期記憶）。 */
    memoryNote?: string;
}

/** NIGHTLY 心事自改 input — the unspoken matter and what LANDED on it today. */
export interface EvolveSecretInput {
    name: string;
    persona: string;
    /** The unspoken matter as it currently stands. */
    secret: string;
    /** What actually landed today that touches it (resolved-want notes, vows kept). */
    landed: string[];
    /** Current self-model lines (grounding). */
    selfModel?: string[];
    /** 身/sex facts for anyone the matter may mention (pronoun guard — the 6th
     *  generation path to leak 他 for a 坤生 was the evolved secret itself). */
    castBodies?: Array<{ name: string; bodyFact?: string }>;
    /** The IMMUTABLE canon seed of this secret (bedrock): hard facts of the past
     *  — years, origins, who-did-what — must match it forever. Evolution moves
     *  the HEART, never the history (a 六七年 entanglement drifted to 十年 and
     *  the evolved secret locked the wrong number in). */
    canonSeed?: string;
    day: number;
}

export interface SelfModelConsolidateReply {
    /** otherId → the NEW ≤40字 first-person view. OVERWRITES the map entry
     *  (latest-wins) — the old line is superseded, never kept alongside. */
    relationshipViews: Array<{ otherId: string; view: string }>;
    /** Optional durable identity insight to merge into coreIdentity (§2.52). */
    identityInsight?: string;
}

/**
 * The full narrative-LLM surface the loop needs. It EXTENDS the scene-loop's
 * injectable `SceneAgent` (actBeat + judgeWantResolved, consumed inside
 * runSceneLoop) with the surrounding authorship the tick pipeline drives itself:
 * want genesis, aftermath, ripples, tick weave, day-end episode. Folding them
 * into one port keeps exactly two adapters (fake, runner) and lets the smoke run
 * with zero LLM.
 */
export interface SceneAgentPort extends SceneAgent {
    /** STRICT-only structured declaration. It is never called in the legacy arm,
     * preserving its call graph and bytes. Missing/failed declarations fail
     * closed to no semantic tags and are recorded as monitor warnings. */
    declareWantSemantics?(
        input: DeclareWantSemanticsInput,
    ): Promise<DeclareWantSemanticsReply | null>;
    /** Autonomous movement is an explicit affordance choice: the world supplies
     *  reachable scene ids and the character chooses one (or stays). */
    decideMove(input: MoveDecideInput): Promise<MoveDecideResult>;
    /** 路遇 (optional): a cross-district traveller who passes someone on the road
     *  decides — pass / greet / engage. `engage` stops them there and the errand
     *  slips. Real adapters implement it (one cheap LLM call, fail-safe to pass);
     *  deterministic/fake adapters omit it, and the tick just lets travellers
     *  arrive uninterrupted. */
    transitReact?(input: TransitReactInput): Promise<TransitReaction>;
    /** 對方座席 (optional): the establishment counterparty across the contract table
     *  (華光影片社、申聲唱片行…) answers an overnight 還價 within the space the
     *  deterministic reserve-gate already allows — READING its house's book facts +
     *  frame-authored 立場, never computing a number (LLM 永不碰數字). Real adapters
     *  implement it; the fake omits it, so the tick's deterministic fallback rules
     *  (money-counter → the mechanical gate; condition → the authored policy). A
     *  null reply is no verdict — the tick falls back just the same. */
    negotiateCounter?(input: NegotiateCounterInput): Promise<NegotiateCounterReply | null>;
    /** 班主叫排戲 (optional): the troupe leader's MORNING rehearsal call. At day
     *  start it weighs the troupe's straits against tonight's 開鑼 and decides
     *  whether排戲 is worth the day it costs, and which 戲碼 — a called rehearsal
     *  announces to the troupe, pulls the players to the venue that afternoon
     *  (feeding box-office quality + production effort), and bootstraps the play.
     *  Real adapters implement it (one cheap LLM call, fail-safe to null); the fake
     *  omits it, so the tick simply never calls rehearsal. A null reply → no call. */
    decideRehearsal?(input: RehearsalDecideInput): Promise<RehearsalDecideReply | null>;
    /** 祈願 (optional): voice a first-person, in-character SPOKEN prayer addressed
     *  to 神明 at a temple — 角色真的來求、對神明說出口的話 —含蓄、民國語感、≤40字
     *  (e.g.「城隍老爺在上，信女柳氏，只求那一紙契約莫奪了我的名字」). Real adapters
     *  implement it (one cheap LLM call, fail-safe to null); the fake OMITS it, so
     *  the tick's DETERMINISTIC framing (framePrayerFallback) voices the prayer
     *  instead — the mechanism works and is testable with no LLM. null → the tick
     *  falls back to the deterministic framing just the same. */
    speakPrayer?(input: SpeakPrayerInput): Promise<string | null>;
    /** 資助搭救 (optional): a character holding surplus coin, co-present with someone
     *  in real hardship (broke / no runway / acutely starving), decides whether to
     *  give some of their OWN money to help — and how much, to whom, under what
     *  名目. The give/no-give JUDGMENT is the capability's (runner aid.ts, shaped by
     *  personality + each bond); finalizeAid enforces the HARD safety (recipient a
     *  real listed peer, running total ≤ funds, NO overdraft — the same rule as the
     *  on-chain transfer). Real adapters implement it (one cheap LLM call); the fake
     *  OMITS it, so the tick's DETERMINISTIC fallback (a small clamped gift to the
     *  neediest warmly-bonded co-present peer) runs instead — the mechanism works and
     *  is testable with no LLM. The money moves ONLY through the conserving pay path. */
    decideAid?(input: AidActionInput): Promise<AidActionResult>;
    /** 叩門/放行 (optional): the occupant of a private home decides, THROUGH the
     *  door, whether to admit a night knocker — consent lives with the OCCUPANT,
     *  never the visitor's ardor; a shut door is also an answer. An admit mints a
     *  one-time pass (grantAccess oneTime) that entry consumes; a refusal leaves
     *  the knocker outside with the move spent. Real adapters implement it (one
     *  cheap LLM call, fail-safe to null); the fake OMITS it, so the tick's
     *  DEFAULT — deterministic, conservative — is to REFUSE (null reply refuses
     *  just the same: never an entry the occupant didn't grant). */
    decideAdmit?(input: AdmitDecideInput): Promise<AdmitDecideReply | null>;
    /** 邀約 (optional): by day, a character whose 愛/情/虧欠 want presses toward a
     *  CO-PRESENT person may offer tonight's word —— 今夜來我處 —— a one-time 領入
     *  to their own private home. Real adapters implement it (one cheap LLM call,
     *  fail-safe null); the fake OMITS it, so the tick's DEFAULT — deterministic,
     *  conservative — is to SWALLOW the word (no grant the inviter didn't voice). */
    decideInvite?(input: InviteDecideInput): Promise<InviteDecideReply | null>;
    /** 告借/應借 (optional): a co-present cast member is ASKED for a personal
     *  loan (a beat's `borrow` command) — 借錢是兩造的事：錢動之前，出借的人先
     *  點頭；婉拒也是一句回答，不是違規。The lender weighs their own purse, the
     *  tie toward the asker, the stated 緣故 and any 舊帳 standing, then answers
     *  lend / refuse plus one line. Real adapters implement it (one cheap LLM
     *  call, fail-safe to null); the fake OMITS it, so the tick's DEFAULT —
     *  deterministic, conservative — is to REFUSE (a null reply refuses just
     *  the same: never a loan the lender didn't grant). */
    decideLend?(input: LendDecideInput): Promise<LendDecideReply | null>;
    /** 復核座席 (optional): the 班主 reviews a USER-MINTED candidate through three
     *  gates — 正典 (era/worldview fit), 文風 (梨園 register), 安全 — and on accept
     *  拓寫s the user's seed into cast format (description/secret/memories×3/
     *  skills×2), preserving ≥1 user sentence VERBATIM in memories (擁有感錨點;
     *  `hasVerbatimAnchor` makes it checkable). Called by the MINT flow, never the
     *  tick. Real adapters implement it (one cheap LLM call, fail-safe null); the
     *  fake OMITS it — a null reply admits NOBODY (never a cast member the 班主
     *  didn't pass). */
    decideRecruit?(input: RecruitDecideInput): Promise<RecruitDecideReply | null>;
    /** Deliver a frozen event to one witness's durable session. The adapter may
     *  include that witness's own inner lines, never another actor's. */
    observeScene?(input: ObserveSceneInput): Promise<void>;
    /** Epistemic editor: writes one bespoke lead per character, extracts
     * passage-level claims, and compares them with the frozen public event.
     * Optional for deterministic/offline adapters; real adapters must fail loud
     * rather than returning an incomplete audit. */
    curateDossier?(
        event: DossierCanonicalEvent,
        perspectives: DossierPerspectiveSource[],
    ): Promise<DossierPerspectiveSource[]>;
    deriveGenesisWants(input: DeriveWantsInput): Promise<GenesisWant[]>;
    deriveAftermathWant(input: AftermathInput): Promise<GenesisWant | null>;
    judgeRipples(input: RippleJudgeInput): Promise<RippleJudgeDelta[]>;
    weaveTickChapter(input: WeaveTickInput): Promise<string | null>;
    /** CHAPTER-LEVEL SELF-CHECK / REPAIR: re-read a WOVEN 章回 and return the same
     *  passage with hard errors repaired (a 坤生/woman called 男人, wrong-gender
     *  pronouns, logic slips, anachronism). Same events, no invented lines; null →
     *  keep the original prose. GENERAL: the cast's bodyFacts drive the gender check. */
    reviewChapter(input: ReviewChapterInput): Promise<ReviewChapterReply | null>;
    composeEpisode(input: ComposeEpisodeInput): Promise<string | null>;
    /** Structured open-action: prose + a self-tagged kind (§2/§3). */
    chooseAction(input: ChooseActionInput): Promise<ChooseActionResult>;
    /** Living-want self-rewrite after a scene/action (scene-scoped, RUNNER_V2 §9). */
    rewriteWantLedger(input: RewriteLedgerInput): Promise<RewriteReply>;
    /** NIGHTLY want REGENERATION — runs for every character (even one with no scene).
     *  A just-resolved want seeds its next phase (milestone → successor); ambient
     *  world/lifecycle pressure (deadline, being broke, the year closing on a finite
     *  life) can stir a fresh want. Returns one new want or null — NEVER forced: null
     *  when no real pressure genuinely stirs one, so this is not an artificial floor. */
    regenerateWant(input: RegenerateWantInput): Promise<RewriteSpawn | null>;
    /** Nightly self-model consolidation (user's ③): OVERWRITE this character's
     *  current view of each person dealt with today + core relationships. Never
     *  appends — the returned line REPLACES the map entry (latest-wins). */
    consolidateSelfModel(input: SelfModelConsolidateInput): Promise<SelfModelConsolidateReply>;
    /** NIGHTLY DAY-PLANNING (N6, optional): evolve this character's standing plan
     *  (長期目標／眼下打算／未竟之事) for the day ahead — so movement + beats aren't
     *  purely reactive but budget toward goals & the season deadline. Real adapters
     *  implement it (one cheap LLM call); deterministic/fake adapters omit it, and
     *  the tick simply skips planning. null → keep the prior plan. */
    planDay?(input: PlanDayInput): Promise<PlanDayReply | null>;
    /** 折子座席 (optional): 拍與拍之間，外來捎話送到某個不在場上的人跟前——他聽見了，
     *  回一句，或許記一筆心事。一次有界演繹，動詞集受限（不開場景、不拉別人進戲）。
     *  Real adapters implement it (per-character session 一輪); 缺席的座席（fake 以外
     *  的舊 adapter）不實作，佇列裡的捎話便原封留給下一個大拍聽見——喚醒層是純增量，
     *  關掉即回到六拍世界。null → 這一輪沒答上，同樣留給大拍。 */
    interlude?(input: InterludeInput): Promise<InterludeReply | null>;
    /** Optional: PROSE of an audience member's reaction (never the box-office number). */
    audienceReaction?(input: AudienceReactionInput): Promise<string | null>;
    /** SELF-CHECK / REPAIR: re-read a rendered scene and return the same beats with
     *  text repaired (pronouns, wrong-gender anatomy, out-of-character voice,
     *  anachronism, prose quality). Same names/order/count; null → keep originals. */
    reviewScene(input: ReviewSceneInput): Promise<ReviewSceneReply | null>;
    /** POV daily reflection: a FIRST-PERSON, subjective (possibly biased) account of
     *  one character's day (the narrative-subjective layer). null → skip. */
    povReflect(input: PovReflectInput): Promise<string | null>;
    /** POV SCENE rendering (the 追角 lens): retell ONE rendered scene first-person
     *  through one participant's eyes — attention/interpretation diverge, events
     *  never do (probe-validated). Caller gates by followers. null → skip. */
    povScene(input: PovSceneInput): Promise<string | null>;
    /** 導演選牌 — pick ONE offered card, aim it at offered candidates, dress its
     *  face. The engine settles every consequence; a null/absent reply simply
     *  means no card is played this tick (a deadline card still lands). */
    pickEventCard?(input: DirectorPickInput): Promise<DirectorPickReply | null>;
    /** 債主的態度 — how hard THIS creditor calls THIS unpaid debt at the reckoning.
     *  No money moves either way. null/absent/throw ⇒ the deterministic fallback
     *  decides, so a rehearsal run still produces a complete, replayable reckoning. */
    decideDebtStance?(input: DebtStanceInput): Promise<DebtStanceReply | null>;
    /** 日記 — recombine ONE tracked character's day (beats + 心下 + 心事) into a
     *  first-person entry whose claims cite `beat:N` evidence. null → no diary. */
    composeDiary?(input: ComposeDiaryInput): Promise<ComposeDiaryReply | null>;
    /** 詩詞 — occasion-triggered only, never a daily quota. null → no poem. */
    composePoem?(input: ComposePoemInput): Promise<ComposePoemReply | null>;
    /** MILESTONE JUDGE: are these two, as of now, 相許? READS the relationship
     *  (never steers it) — a true verdict promotes the pair into the established
     *  set, unlocking (not scripting) the consummate register. */
    judgeEstablished(input: JudgeEstablishedInput): Promise<boolean>;
    /** NIGHTLY 心事自改: the secret is a LIVING thing, not frozen canon. When
     *  something真的落地 today (a milestone resolved, a vow kept), the unspoken
     *  matter may move to its own next step — a debt collected becomes 「留不留」.
     *  Frozen secrets re-seed the same want forever (金鳳 kept collecting a debt
     *  the world had already paid). Grows FROM the old secret in the same heart;
     *  never invents plot, never decides futures. null → unchanged. */
    evolveSecret(input: EvolveSecretInput): Promise<string | null>;
}

// ── Recall (memory) ──────────────────────────────────────────────────────────
export type MemoryKind =
    | 'dream'
    | 'reflection'
    | 'chapter'
    | 'observation'
    | 'relationship'
    | 'genesis'
    | 'plan'
    | 'unknown';

/** A recalled memory — mirrors web memory.ts's narrative-store return shape. */
export interface RecalledMemory {
    text: string;
    kind: MemoryKind;
    importance: number;
    /** Narrative day written (recency). */
    day?: number;
    anchored?: boolean;
    /** Stable per-store id when the adapter keeps one (LocalRecall's insertion
     *  seq) — lets an operator surface cite exactly which stored memories a
     *  prompt carried. Optional: adapters without durable ids omit it. */
    seq?: number;
}

export interface RememberOpts {
    kind?: MemoryKind;
    importance?: number;
    /** Narrative day the memory is stamped with (recency decay). */
    day: number;
}

/**
 * Character long-term memory. `remember` embeds+stores; `recall` returns the
 * top-`limit` by importance × recency × relevance. M0 adapter = LocalRecall
 * (JSON-backed, real OpenAI embeddings or deterministic hash vectors). M2 swaps
 * in a MemWal adapter behind the same contract.
 */
export interface RecallPort {
    remember(characterId: string, text: string, opts: RememberOpts): Promise<boolean>;
    recall(characterId: string, query: string, limit: number, today: number): Promise<RecalledMemory[]>;
}

// ── Archive (durable story artifacts) ────────────────────────────────────────
export type ArtifactKind = 'shoujuan' | 'chapter' | 'episode' | 'pov';

export interface ArchiveArtifact {
    /** 手卷 (live scene beats) | 織回 (woven tick chapter) | 日終 (day episode) | POV. */
    kind: ArtifactKind;
    day: number;
    tick: number;
    /** Scene name (shoujuan/chapter) or character name (pov). */
    name: string;
    body: string;
    characterId?: string;
    sceneId?: string;
    /** Canonical event id carried into the archived/anchored artifact. */
    eventId?: string;
}

/** Commits a finished story artifact. M0 = FileArchive (markdown). M2 = chain
 *  commitment + Walrus. */
export interface ArchivePort {
    commit(artifact: ArchiveArtifact): Promise<void>;
}

// ── Clock ────────────────────────────────────────────────────────────────────
/** The 6-part day palette (§ world-time). Night = the last two. Canonical home
 *  is shared/lib/world-clock (single source across engine/runner/web);
 *  re-exported here so the engine's public API is unchanged. */
export { PARTS_OF_DAY, type PartOfDay };

export interface WorldClock {
    /** Monotonic tick counter (the single source of truth). */
    currentTick: number;
    /** Whole ticks per day (fixed for a run). */
    ticksPerDay: number;
    /** 1-indexed narrative day. tick 0 → day 1. */
    day: number;
    /** 0-based tick position within the current day. */
    tickOfDay: number;
    partOfDay: PartOfDay;
}

// ── Economy (season money physics) ───────────────────────────────────────────
/** Defined next to the pure season-economy core to avoid a runtime cycle with
 *  world-state; re-exported here so adapters/tick keep one port import site. */
export type { EconomyPort } from './core/season-economy.ts';

/** Advances and interprets the world clock. Local-first authority — the engine
 *  owns its clock (no chain WorldState). */
export interface ClockPort {
    /** Return the clock one tick later. */
    advance(clock: WorldClock): WorldClock;
    /** Night ticks route home and fast-forward all but private trysts. */
    isNight(clock: WorldClock): boolean;
    /** Last tick of the day — weave the day-end episode. */
    isDayEnd(clock: WorldClock): boolean;
}
