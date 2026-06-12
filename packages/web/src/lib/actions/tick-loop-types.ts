import type { WorldTimeSnapshot } from './world-time';

export interface TickLoopInput {
    /** Advance a tick before the pass. Default true (ignored on dry-run). */
    advance?: boolean;
    /** Cap characters processed for POV/sleep (LLM cost guard). Default 6. */
    maxCharacters?: number;
    /** Optional exact character ids to process, in order. Useful for demo acceptance. */
    characterIds?: string[];
    /** Update each character's standing plan first (N6). Default true. */
    plan?: boolean;
    /** Let idle characters walk between scenes toward their goals. Default true. */
    move?: boolean;
    /** Run the consolidation/sleep pass. Default true. */
    sleep?: boolean;
    /** Generate and anchor/preview POV chapters. Default true. */
    pov?: boolean;
    /** Generate a chapter for EVERY processed character regardless of whether an
     *  event touched them this tick. Default false → event-driven cadence: only
     *  characters in this tick's storylet / event get a chapter (an "episode" =
     *  one event's multi-POV coverage). Set true for ambient / testing. */
    povAll?: boolean;
    /** Compile the gazette at the end. Default true. */
    gazette?: boolean;
    /** Open a storylet (dramatic spine) when drama tension is live. Default true. */
    storylet?: boolean;
    /** Render the event's multi-character moment scene image (background). Default true. */
    eventImage?: boolean;
    /** Weave this event's POVs into the canonical "回" (event_cut) in the
     *  background, when ≥2 cast wrote a POV. Default true. */
    eventChapter?: boolean;
    /** Auto-resolve (judge) an event once every participant has acted.
     *  Default true — events conclude on their own (N5). */
    autoResolve?: boolean;
    /** EXPERIMENTAL (default false): drive a 回 as a multi-tick BudgetEvent that
     *  lingers OPEN across ticks and resolves WITH a resource transfer (the world
     *  steps), instead of a per-tick storylet. When on, the spine owns event
     *  resolution (autoResolve is forced off) and the cut weaves only at resolve.
     *  See docs/EVENT_LIFECYCLE.md. Not chain-verified — flag on in a chain session. */
    eventSpine?: boolean;
    /** EXPERIMENTAL (default false): run MANY events at once — one per contention
     *  axis (爭灌錄權 ∥ 爭某人的愛). Implies spine mode; live-only. See Stage 1. */
    parallelEvents?: boolean;
    /** Concurrency cap for `parallelEvents` (default 2). */
    maxConcurrentEvents?: number;
    /** EXPERIMENTAL (default false): draw contenders toward their contest in the
     *  move phase so events reliably FORM (rival gravity). A settled resource
     *  cools down so it can't glue a ≥3-way rivalry. Verified in
     *  gravity-{core,sim}.test.ts. Pairs with parallelEvents. */
    rivalGravity?: boolean;
    /** EXPERIMENTAL (default false): couple each character's parallel desires
     *  through a finite attention budget, so concurrent events pull on each other
     *  (the 柳生春 trade-off, cross-event). Off-chain steering overlay. Stage 2. */
    attentionBudget?: boolean;
    /** EXPERIMENTAL (default false): let the LLM director NAME each incident
     *  (event-framing.ts) instead of the deterministic keyword→string map. Pure
     *  narration; falls back to the deterministic label on any failure. */
    llmFraming?: boolean;
    /** EXPERIMENTAL (default false): let the LLM director ADD a contested
     *  resource mid-story (propose-resources.ts), validated + rate-limited. The
     *  new slot is desired + settled next tick. See EVENT_LIFECYCLE Phase 3. */
    directorResources?: boolean;
    /** Preview: produce POV prose but don't advance / act / anchor. */
    dryRun?: boolean;
}

export interface TickActResult {
    eventId: string;
    characterId: string;
    name?: string;
    ok: boolean;
    cardLabel?: string;
    intent?: string;
    skipped?: boolean;
    error?: string;
}

export interface TickPovResult {
    characterId: string;
    name: string;
    ok: boolean;
    anchored: boolean;
    skipReason?: string;
    chapter?: string;
    recalledCount?: number;
    commitmentId?: string;
    digest?: string;
    error?: string;
}

export interface TickPlanResult {
    characterId: string;
    name: string;
    ok: boolean;
    longTermGoal?: string;
    dailyPlanHint?: string;
    hadPrevious?: boolean;
    error?: string;
}

export interface TickResolveResult {
    eventId: string;
    ok: boolean;
    digest?: string;
    error?: string;
    /** Deterministic win/loss line derived from on-chain plays (narrative anchor). */
    verdict?: string;
    winnerId?: string;
    participants?: string[];
}

export interface TickMoveResult {
    characterId: string;
    name: string;
    ok: boolean;
    fromSceneId?: string;
    toSceneId?: string;
    toSceneName?: string;
    reason?: string;
    skipped?: boolean;
    error?: string;
}

export interface TickSocialResult {
    characterId: string;
    name: string;
    ok: boolean;
    kind: 'observe' | 'talk' | 'idle';
    targetCharacterId?: string;
    targetName?: string;
    line?: string;
    observation?: string;
    relationshipMemory?: string;
    reason?: string;
    error?: string;
}

/** ASK phase — a needy character decides whether to lower itself to ask a same-scene, solvent
 *  character for help (the "pull" side of money). The grant is handled by the GIVE phase. */
export interface TickAskResult {
    characterId: string;
    name: string;
    ok: boolean;
    asked: boolean;
    targetId?: string;
    targetName?: string;
    amount?: number;
    kind?: string;
    reason?: string;
    error?: string;
}

/** GIVE phase — a character decides whether to aid a same-scene peer in need.
 *  The give/no-give judgment is the LLM's; the balance MOVE is deferred to the
 *  on-chain economy (Part D D1 transfer_between_characters) / off-chain settle
 *  shadow (D5) — until that rail lands, `gifts` is the recorded INTENT and the
 *  effect is narrative + relationship-tone only (`deferred: true`). */
export interface TickGiveResult {
    characterId: string;
    name: string;
    ok: boolean;
    gave: boolean;
    gifts?: {
        recipientId: string;
        recipientName?: string;
        amount: number;
        memo: string;
        manner?: string;
        reason?: string;
        /** the recipient refused the gift (e.g. a rival won't take charity) — no money moves. */
        refused?: boolean;
    }[];
    /** overall reasoning / why nothing was given. */
    reason?: string;
    /** true while the actual balance move awaits the on-chain / settle rail (D1/D5). */
    deferred?: boolean;
    error?: string;
}

export interface TickSleepResult {
    characterId: string;
    name: string;
    ok: boolean;
    reflections?: string[];
    anchored?: boolean;
    skipReason?: string;
    error?: string;
}

export interface TickGazetteResult {
    ok: boolean;
    eventCount: number;
    chapterCount: number;
    anchored: boolean;
    skipReason?: string;
    blobId?: string;
    digest?: string;
    error?: string;
}

/** DR-6 — drama-engine tension derived this tick from the on-chain ledger. */
export interface TickDramaResult {
    /** true when contested resources existed and tension was derived. */
    active: boolean;
    /** number of contested resources read. */
    resourceCount: number;
    /** why drama was dormant (when active === false), e.g. 'no-resources'. */
    skipped?: string;
    /** commitment id of the self-verifying beat anchored on chain (real runs). */
    commitmentId?: string;
    /** top tension rows for the UI (capped), highest-first. */
    top?: { characterId: string; name?: string; statement: string; tension: number }[];
}

/** A storylet opened this tick — the discrete incident POV chapters anchor to. */
export interface TickStoryletResult {
    sceneId: string;
    sceneName: string;
    /** open_storylet template id (e.g. 'contention:spotlight'). */
    templateId: string;
    /** Human-readable incident framing fed to involved characters' POV. */
    label: string;
    characterIds: string[];
    names: string[];
    /** Whether StoryletOpened was emitted on chain (false on dry-run / failure). */
    opened: boolean;
    digest?: string;
    error?: string;
}

/** SETTLE phase — the off-chain economy advanced one day-boundary: treasury-funded wages paid,
 *  daily cost deducted, vitality/death updated, and this tick's accepted GIVE transfers applied
 *  to the persisted shadow balances. */
export interface TickSettleResult {
    ok: boolean;
    /** narrative day settled to. */
    day: number;
    /** on-chain saga treasury (ENDLESS) that funds the payroll pool. */
    treasuryFunds: number;
    /** accepted gift transfers moved this tick. */
    transfersApplied: number;
    /** total wages paid across the cohort this settle (ENDLESS). */
    wagesPaid: number;
    settledCount: number;
    /** characters whose vitality bottomed out (dead in the shadow). */
    dead: { id: string; name: string }[];
    /** set when settle was skipped (e.g. dry-run). */
    skipped?: string;
    error?: string;
}

export interface TickLoopResult {
    ok: boolean;
    advanced: boolean;
    worldTime?: WorldTimeSnapshot;
    plans: TickPlanResult[];
    moves: TickMoveResult[];
    /** DR-6: scarce-resource tension derived (+ committed) before decisions. */
    drama?: TickDramaResult;
    /** The storylet opened this tick (dramatic spine), if any. In parallel mode
     *  this is the first of `storylets` (back-compat). */
    storylet?: TickStoryletResult;
    /** EVERY event live this tick (Stage 1 parallel events); ≤1 in single mode. */
    storylets?: TickStoryletResult[];
    socials: TickSocialResult[];
    /** ASK phase: needy characters who opened their mouth to ask for help this tick. */
    asks: TickAskResult[];
    /** GIVE phase: character-to-character aid decided this tick. */
    gives: TickGiveResult[];
    /** SETTLE phase: the off-chain economy advanced + accepted gifts applied. */
    settle?: TickSettleResult;
    acts: TickActResult[];
    resolves: TickResolveResult[];
    povs: TickPovResult[];
    sleeps: TickSleepResult[];
    /** Set when sleep was enabled but skipped (e.g. not night yet). */
    sleepNote?: string;
    gazette?: TickGazetteResult;
    memoryWarnings?: string[];
    memoryDegraded?: boolean;
    error?: string;
}
