/**
 * DRAMA-EFFECT ENGINE — experiment config.
 *
 * The narrative observatory (`narrative.harness.ts`) hard-codes its world: a 6-cast
 * saga whose single seeded stake is `affection:文` (capacity 1), settled each tick by
 * `relationship-evolve` reading the POVs. That harness proved ONE point — that 感情 is
 * an emergent, directed relationship property, not a contested resource — but it could
 * only ever show that one soil.
 *
 * An `ExperimentConfig` lifts those hard-coded knobs into data so an owner can change
 * the dramatic SOIL (what the cast is drawn around, how the incident is framed, whether
 * the relationship graph is even evolved) in a config file, run one CLI command, and
 * open a self-contained HTML report to read「不同互動土壤長出不同關係網」.
 *
 * It is read by `run-experiment.ts` (which patches the seed + framing seam) and by the
 * presets in `presets/`. The two shipped presets contrast 傾心土壤 (affection → 戀慕)
 * against 搭戲土壤 (partnership → 競爭).
 */

/**
 * The dramatic STAKE the cast is seeded around. `kind` becomes the contested-resource
 * label prefix (`<kind>:<targetName>`), which the existing drama core turns into a
 * desire statement (`desireStatementFor`) and then an incident framing
 * (`framingForStatement`). Two kinds carry hand-authored, semantic framing:
 *
 *   · `affection`  → 「傾心於<target>」 → 戀慕/吃醋 framing (gazes ON the target).
 *   · `partnership` → 「與<target>搭戲」 → 較勁 framing (fighting for a spot).
 *
 * Any other kind falls through to the generic `contention:<kind>` framing — still a
 * valid soil, just without bespoke prose.
 */
export interface ExperimentStake {
    /** contested-resource kind, e.g. 'affection' | 'partnership' | 'spotlight' | 'recording'. */
    kind: string;
    /**
     * Index into the seeded cast naming the FOCUS of the stake — the person who is
     * 被傾心 / 被搭 / 被爭. The desire statement points every desirer at this name.
     */
    targetIndex: number;
    /** Slot count of the contested resource (default 1 = winner-takes-one). */
    capacity?: number;
}

/**
 * A founding-cast member spec — the SAME shape the web 創世班底 path uses
 * (`FoundingCharSpec` in `lib/actions/create-founding-cast.ts`). Re-declared here
 * (structurally identical) so the experiment config can carry hand-authored people
 * without importing that 'use server' module's chain/runner dependency chain.
 *
 * What the harness reads off each spec (the rest is web-only mint metadata):
 *   · `name`        → the fake character's name.
 *   · `gender`      → physical_facts.gender (POV pronoun/kinship rules).
 *   · `role`        → 行當. Becomes the public `role:<role>` tag the POV path reads
 *                     (`pov-core.roleFromCharacterJson` / roster `resolveRosterRoles`),
 *                     and `drama-core.roleResourceAmbition`'s desire shaping.
 *   · `description` → 小傳. Becomes the chain `profile.description`, surfaced as each
 *                     peer's roster `brief` so castmates see who they're with.
 *   · `minAttributes` (optional) → per-axis attribute floors; absent axes fall back to
 *                     the 行當 floors / the default roll.
 */
export interface FoundingCharSpec {
    name: string;
    /** '男' | '女' | '中性' | … */
    gender: string;
    /** 行當 / specialty — also the public role tag. */
    role: string;
    /** 小傳 — public bio. Feeds the roster brief + role inference fallback. */
    description: string;
    ageYears?: number;
    /** Per-axis attribute floors (行當下限). Omit → role floors / default roll. */
    minAttributes?: Partial<Record<'appearance' | 'constitution' | 'acuity' | 'disposition', number>>;
}

/**
 * Optional concrete STORY to seed instead of the anonymous `cast.count` shells.
 * When `cast` is given, each `FoundingCharSpec` seeds one fake character WITH a 行當 +
 * 小傳, so the POV has an anchored persona (character no longer drifts each run). When
 * absent, the harness keeps its legacy behaviour (anonymous `cast.count` + CAST_NAMES,
 * empty description/role) — default behaviour is unchanged.
 */
export interface ExperimentStory {
    /** Override the seeded saga name + premise. */
    saga?: { name: string; description: string };
    /** Override the seeded scene names (positional; extras ignored, missing keep defaults). */
    scenes?: { name: string }[];
    /** Concrete founding cast (with persona). When set, replaces the anonymous shells. */
    cast?: FoundingCharSpec[];
}

export interface ExperimentConfig {
    /** Stable slug — used for the report filename and the preset's argv name. */
    name: string;
    /** One-line description shown in the report header. */
    description?: string;
    /** How many ticks to iterate. */
    ticks: number;
    /** Cast shape. */
    cast: {
        /** number of fake characters seeded (min 2). */
        count: number;
        /** reserved — number of scenes (default 2, the harness's rehearsal + greenroom). */
        scenes?: number;
    };
    /**
     * Optional concrete story (saga / scenes / cast-with-persona). When `story.cast` is
     * set the anonymous `cast.count` shells are replaced by hand-authored people; the
     * `stake.targetIndex` still indexes into this cast. Omit → legacy anonymous cast.
     */
    story?: ExperimentStory;
    /** The dramatic stake the cast is seeded around. */
    stake: ExperimentStake;
    /**
     * Optional override of the incident framing the stake produces. When set, it
     * REPLACES the framing `label` fed into each desirer's POV — the single lever for
     * re-coloring the same stake (e.g. push an affection stake from 傾心 toward 試探).
     * `{target}` is interpolated with the focus character's name.
     */
    framingOverride?: string;
    /**
     * Whether to evolve the directed relationship graph from each tick's POVs.
     *   · 'relationship-evolve' — read POVs → LLM → directed tone edges → seed back.
     *   · 'none' — CONTROL: render chapters only, never write relationships (so an
     *     owner can see the prose without the evolution overlay).
     */
    settle: 'relationship-evolve' | 'none';
}

/* ── result shape (produced by run-experiment, consumed by render-report) ──────── */

import type { RelationshipTone } from '@endless-story/shared';

/** One node in a relationship-graph snapshot. */
export interface GraphNode {
    id: string;
    name: string;
}

/** One directed edge in a relationship-graph snapshot (A→B). */
export interface GraphEdge {
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
    tone: RelationshipTone;
    /** repeat count — how many times this directed tie has been seeded (≈ weight). */
    weight: number;
}

/** The whole cast's directed relationship graph at one moment. */
export interface GraphSnapshot {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

/** One captured POV / cut chapter for the report. */
export interface CapturedChapter {
    /** 'pov' | 'cut' | 'gazette'. */
    kind: string;
    /** subject name (character for POV, scene/saga for cut/gazette). */
    name: string;
    body: string;
}

/** Per-tick metrics for the small charts. */
export interface TickMetrics {
    /** recall hits drained from the memory layer this tick. */
    recallHits: number;
    /** total directed edges in the graph after this tick. */
    edgeCount: number;
    /** sum of directed-edge weights after this tick. */
    weightSum: number;
    /** directed edges newly seeded this tick (from the evolve step). */
    seededThisTick: number;
    /** tone → count over the whole graph after this tick. */
    toneCounts: Partial<Record<RelationshipTone, number>>;
}

/** Everything the report needs about one tick. */
export interface TickRecord {
    tick: number;
    /** event(s) that opened this tick (label + names) — context for the snapshot. */
    events: { label: string; names: string[] }[];
    chapters: CapturedChapter[];
    /** the directed relationship graph AFTER this tick's evolve step. */
    graph: GraphSnapshot;
    metrics: TickMetrics;
}

export interface ExperimentResult {
    config: ExperimentConfig;
    /** present only when the run hit a real provider key (else fake-LLM smoke). */
    usedRealLLM: boolean;
    perTick: TickRecord[];
    /** the final directed relationship graph (== perTick[last].graph, hoisted for convenience). */
    finalGraph: GraphSnapshot;
}
