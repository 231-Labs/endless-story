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
import type { RewriteLedgerInput, RewriteReply } from './core/want-rewrite.ts';
import type * as Runner from '@endless-story/runner';

// ── Re-used runner authorship shapes (type-only) ─────────────────────────────
export type DeriveWantsInput = Runner.characterAgent.DeriveWantsInput;
export type GenesisWant = Runner.characterAgent.GenesisWant;
export type AftermathInput = Runner.characterAgent.AftermathInput;
export type RippleJudgeInput = Runner.characterAgent.RippleJudgeInput;
export type RippleJudgeDelta = Runner.characterAgent.RippleJudgeDelta;
export type WeaveTickInput = Runner.sceneRecord.WeaveTickInput;
export type ComposeEpisodeInput = Runner.eventChapter.ComposeEpisodeInput;

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

/**
 * The full narrative-LLM surface the loop needs. It EXTENDS the scene-loop's
 * injectable `SceneAgent` (actBeat + judgeWantResolved, consumed inside
 * runSceneLoop) with the surrounding authorship the tick pipeline drives itself:
 * want genesis, aftermath, ripples, tick weave, day-end episode. Folding them
 * into one port keeps exactly two adapters (fake, runner) and lets the smoke run
 * with zero LLM.
 */
export interface SceneAgentPort extends SceneAgent {
    deriveGenesisWants(input: DeriveWantsInput): Promise<GenesisWant[]>;
    deriveAftermathWant(input: AftermathInput): Promise<GenesisWant | null>;
    judgeRipples(input: RippleJudgeInput): Promise<RippleJudgeDelta[]>;
    weaveTickChapter(input: WeaveTickInput): Promise<string | null>;
    composeEpisode(input: ComposeEpisodeInput): Promise<string | null>;
    /** Structured open-action: prose + a self-tagged kind (§2/§3). */
    chooseAction(input: ChooseActionInput): Promise<ChooseActionResult>;
    /** Living-want self-rewrite after a scene/action (scene-scoped, RUNNER_V2 §9). */
    rewriteWantLedger(input: RewriteLedgerInput): Promise<RewriteReply>;
    /** Optional: PROSE of an audience member's reaction (never the box-office number). */
    audienceReaction?(input: AudienceReactionInput): Promise<string | null>;
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
