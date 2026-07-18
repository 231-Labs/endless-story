/**
 * Cinema-lab shared types — the JSON contract between the lab server core,
 * the /api/lab routes and the lab UI. No chain types anywhere in here.
 */

export type LabLlmMode = 'fake' | 'real';

export interface LabRunConfig {
    /** Story preset id (file name without .json). */
    presetId: string;
    /** Where the preset JSON lives: engine built-ins or the lab's custom dir. */
    seedSource: 'builtin' | 'custom';
    /** Optional season frame id. */
    seasonId?: string;
    seasonSource?: 'builtin' | 'custom';
    llm: LabLlmMode;
    relationshipFallback: boolean;
    ticksPerDay: number;
    /** Real OpenAI embeddings for recall (needs OPENAI_API_KEY); default off. */
    realEmbeddings: boolean;
}

/** lab-run.json — one per run directory; immutable provenance + lineage. */
export interface LabRunMeta {
    id: string;
    title: string;
    note?: string;
    createdAt: string;
    /** Version lineage: the run this one was forked from, and at which tick. */
    parentRunId?: string;
    forkedAtTick?: number;
    config: LabRunConfig;
}

export type LabRunPhase = 'idle' | 'running' | 'error';

/** status.json — refreshed after every tick; cheap to read for run lists. */
export interface LabRunStatusFile {
    day: number;
    tick: number;
    partOfDay: string;
    liveWants: number;
    castCount: number;
    sceneCount: number;
    eventsTotal: number;
    updatedAt: string;
}

export interface LabRunSummary {
    meta: LabRunMeta;
    status: LabRunStatusFile | null;
    /** Live phase when the run is open in this server process. */
    phase: LabRunPhase;
    pendingTicks: number;
    lastError?: string;
}

/** One committed beat, as streamed live to the UI mid-tick. */
export interface LabLiveBeat {
    seq: number;
    ts: number;
    day: number;
    tick: number;
    clock: string;
    sceneId: string;
    sceneName: string;
    isPrivate: boolean;
    characterId: string;
    name: string;
    text: string;
    /** Private interiority — the lab is an operator cockpit, so it is shown,
     *  visually separated as 心聲. */
    inner?: string;
}

export interface LabCharacterLive {
    id: string;
    name: string;
    role?: string;
    gender?: string;
    age?: number;
    sceneId: string;
    sceneName: string;
    fatigue: number;
    hunger: number;
    mood: number;
    /** Top live wants, hottest first. */
    wants: Array<{ desc: string; layer: string; tension: number }>;
    latestLine?: { text: string; clock: string; day: number; sceneName: string };
}

export interface LabSeedSummary {
    id: string;
    source: 'builtin' | 'custom';
    label?: string;
    castCount: number;
    sceneCount: number;
    locationCount: number;
    memoryCount: number;
    resources: string[];
}

export interface LabSeasonSummary {
    id: string;
    source: 'builtin' | 'custom';
    title?: string;
    centralQuestion?: string;
}

/** Tick log line (ticks.jsonl) — the durable per-tick record for timelines. */
export interface LabTickRecord {
    day: number;
    tick: number;
    partOfDay: string;
    night: boolean;
    scenesPlayed: number;
    beats: number;
    resolved: number;
    liveWants: number;
    wove: boolean;
    episode: boolean;
    routed: Record<string, string>;
    events: Array<{
        id: string;
        sceneId: string;
        sceneName: string;
        visibility: 'public' | 'private';
        witnessIds: string[];
        beats: Array<{
            characterId: string;
            name: string;
            text: string;
            inner?: string;
            addressed?: string;
        }>;
    }>;
    eventPovs: Array<{ characterId: string; name: string; eventId: string; body: string }>;
    economyNotices?: string[];
    finishedAt: string;
}

/** World-physics config surface the UI may edit while a run is idle. */
export interface LabWorldConfig {
    contestedResources: Array<{ label: string; statement?: string }>;
    objects: Array<{
        id: string;
        label: string;
        sceneId: string;
        sceneName: string;
        portable: boolean;
        visibility: 'visible' | 'hidden' | 'destroyed';
        container?: string;
        carriedBy?: string;
        carriedByName?: string;
        state?: string;
        knownBy: string[];
    }>;
    scheduledEvents: Array<{
        id: string;
        atTick: number;
        sceneId: string;
        sceneName: string;
        clock?: string;
        text: string;
        visibility: 'public' | 'private';
        witnessIds: string[];
        delivered: boolean;
    }>;
    scenes: Array<{ id: string; name: string; privacyLevel: number; capacity?: number }>;
    hasEconomy: boolean;
}
