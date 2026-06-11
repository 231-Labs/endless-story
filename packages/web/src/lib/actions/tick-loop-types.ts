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

export interface TickLoopResult {
    ok: boolean;
    advanced: boolean;
    worldTime?: WorldTimeSnapshot;
    plans: TickPlanResult[];
    moves: TickMoveResult[];
    /** DR-6: scarce-resource tension derived (+ committed) before decisions. */
    drama?: TickDramaResult;
    /** The storylet opened this tick (dramatic spine), if any. */
    storylet?: TickStoryletResult;
    socials: TickSocialResult[];
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
