/**
 * Cinema-lab shared types — the JSON contract between the lab server core,
 * the /api/lab routes and the lab UI. No chain types anywhere in here.
 */

export type LabLlmMode = 'fake' | 'real';

/** Entity name → asset file key. Client-safe (pure string), shared with the
 *  server store so the 圖庫 UI can match uploads without a round trip. */
export function labAssetKeyFor(name: string): string {
    const key = name.trim().replace(/[/\\:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    if (!key || key.includes('..')) throw new Error(`invalid asset name: ${name}`);
    return key;
}

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

/** One live-feed item. `kind` distinguishes what the world just did:
 *  beat＝場中言行、move＝移步、world＝天時（clock-bound 世界事件）. */
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
    kind?: 'beat' | 'move' | 'world';
    /** Structured mechanical acts committed with this beat, humanized:
     *  物件操作（藏/移/開/毀）與銀錢動作（給錢/簽約/還價…）. */
    acts?: string[];
}

export interface LabCharacterLive {
    id: string;
    name: string;
    role?: string;
    gender?: string;
    age?: number;
    /** Uploaded portrait from the lab 圖庫 (by character name), if any. */
    portraitUrl?: string;
    sceneId: string;
    sceneName: string;
    fatigue: number;
    hunger: number;
    mood: number;
    /** ALL live wants, hottest first (cards show [0]; the 內頁 shows all). */
    wants: Array<{ desc: string; layer: string; tension: number; target?: string }>;
    latestLine?: { text: string; clock: string; day: number; sceneName: string };
    /** Seed persona (or 圖庫 description override when present). */
    description: string;
    /** Durable self-model facts (L3). */
    coreIdentity: string[];
    /** Private inner life — operator cockpit shows it, marked 心底事. */
    secret?: string;
    /** Current one-line views of significant others (latest-wins). */
    views: Array<{ name: string; line: string }>;
    /** 圖庫 multimedia gallery (images + video clips). */
    gallery: Array<{ url: string; type: 'image' | 'video' }>;
}

export interface LabSeedSummary {
    id: string;
    source: 'builtin' | 'custom';
    label?: string;
    /** Saga premise (saga.description) — the poster's one-breath pitch. */
    premise?: string;
    castCount: number;
    sceneCount: number;
    locationCount: number;
    memoryCount: number;
    resources: string[];
    /** 主演名單 — playbill cast line. */
    castNames: string[];
    /** Location names, in seed order — the UI matches terrain art for the poster. */
    locationNames: string[];
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
        /** 出身戳：這只物件生於哪一卷、哪一日拍，season 種下或 lab 置入。 */
        origin?: { runId?: string; day: number; tick: number; source: 'season' | 'lab' };
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
