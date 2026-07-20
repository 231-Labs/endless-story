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

import type { SceneAgent } from './core/scene-loop.ts';
import type { RegenerateWantInput, RewriteLedgerInput, RewriteReply, RewriteSpawn } from './core/want-rewrite.ts';
import type * as Runner from '@endless-story/runner';

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
/** The 6-part day palette (§ world-time). Night = the last two. */
export const PARTS_OF_DAY = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'] as const;
export type PartOfDay = (typeof PARTS_OF_DAY)[number];

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
