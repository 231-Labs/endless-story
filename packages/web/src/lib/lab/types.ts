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
    /** 劇本產出: characters may spend daytime ticks proposing/joining/writing/
     *  rehearsing a play that premieres when the razor holds. Off by default. */
    emergentProduction?: boolean;
    /** 登門修好: a ripe 愛/虧欠 want may seek its target home-alone at night,
     *  uninvited (mirrors 撞破, but for reconciliation not jealousy). Off by default. */
    reconcileVisit?: boolean;
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
    /** STANDING objective (N6 planDay) — 長期目標／眼下打算. Real (LLM) runs only. */
    plan?: string;
    /** 口碑・名頭 — PUBLIC renown (the street-verdict on this person's standing), 0..1.
     *  Present only when the world seeded renown; the 內頁 renders a compact 名頭 line. */
    renown?: number;
    /** 自視 — PRIVATE self-regard (how they rate their OWN standing), 0..1. May DIVERGE
     *  from `renown` (當紅卻怕不夠好). Shown subtler than 名頭, as an inner note. */
    selfRegard?: number;
    /**
     * 羈絆 — this character's directed bonds toward every significant other. The
     * UNION of `relationshipView` (the narrative 「我看TA」 line, latest-wins) and
     * the mechanical `edges` tone-graph, so a seeded edge with no view line still
     * surfaces, and a view with no edge does too. Sorted by `warmth` desc.
     */
    bonds: Array<{
        /** The other person's characterId — tap to traverse the sheet to them. */
        id: string;
        name: string;
        role?: string;
        portraitUrl?: string;
        /** 關係語 — the directed edge tone (舊情人／師承／暗戀…), when an edge exists. */
        tone?: string;
        /** 溫度 — tone-aware directed affinity (this char → other), 0..1. Coarse
         *  today (buckets by tone); becomes continuous later — cards read either way. */
        warmth: number;
        /** other → this char affinity, so the card can hint MUTUAL vs one-sided. */
        warmthBack: number;
        /** 「我看TA」 — this char's current one-line view of the other, if any. */
        line?: string;
        /** 相許／舊情 display SLOT for a coming engine layer — render a badge only
         *  when truthy; undefined for now. */
        established?: boolean;
        /** 相識分寸: how THIS character REFERS to the other at their own resolution of
         *  acquaintance (不識→行當／認姓→姓氏稱謂／識全名→全名). Equals `name` when the
         *  subjective-naming flag is off. Meaningful only with the flag on. */
        perceivedName?: string;
        /** 相識分寸: this character's acquaintance level toward the other — drives a
         *  small 面生／認得 chip. 'named' (or flag off) needs no chip. */
        acquaint?: 'stranger' | 'acquainted' | 'named';
    }>;
    /** 技藝 — this character's SKILLS (style-imparting capabilities). Each gives a
     *  distinctive conduct/output style; `kind` is the domain it colours, `style`
     *  the prose descriptor, `level` an optional 1–5 proficiency. Empty when the
     *  character carries no authored skills. */
    skills: Array<{ name: string; kind: string; style: string; level?: number; note?: string }>;
    /** 圖庫 multimedia gallery (images + video clips). */
    gallery: Array<{ url: string; type: 'image' | 'video' }>;
    /** 身上的錢 —— 已格式化（如「3 圓 20 分」）。僅掛 economy 季框的卷才有。 */
    money?: string;
    /** 隨身物品欄：carriedBy===此人、未毀之物件（含唯一 id 與出身戳）。 */
    carrying: Array<{ id: string; label: string; state?: string; hidden?: boolean; origin?: { day: number; tick: number; source: 'season' | 'lab' } }>;
    /** 持鑰 — 訪問權限: which private places this character may enter as a GUEST
     *  (`holding`, a standing 常 or one-time 次 key) and who holds a key to THIS
     *  character's own home (`myPlaceHolders`). Empty for a character with no keys
     *  and a home nobody holds a key to. */
    keys: {
        holding: Array<{ sceneId: string; sceneName: string; kind: 'standing' | 'oneTime' }>;
        myPlaceHolders: Array<{ id: string; name: string; portraitUrl?: string; kind: 'standing' | 'oneTime' }>;
    };
    /** 居所 — where this character dwells (homeByChar) and their tenure of it:
     *  'own'＝自有屋主, 'rent'＝租住(屋主 ownerNames), 'public'＝公處借宿(無主). Omitted
     *  when the character has no home scene. Read-only, derived from ownersOf.
     *  `rentYuan` present only when a 'rent' tenure bears rent (from the lease's bill). */
    home?: { sceneName: string; tenure: 'own' | 'rent' | 'public'; ownerNames: string[]; rentYuan?: number };
    /** 收租 — the rentals this character is the LANDLORD of (leases whose 屋主 is this
     *  character), each with the tenant and the 圓 rent (when the lease bears it).
     *  Omitted when this character lets nothing out. Read-only, derived from leases. */
    rentalsOut?: Array<{ sceneName: string; tenantName: string; rentYuan?: number }>;
}

/**
 * 願牆 — one SPOKEN prayer a character voiced at a temple (神明 前). This is
 * 對神明說出口的話 — a deliberate spoken utterance made at a physical temple —
 * distinct from the internal 心事 aggregated on the 願榜 (`LabCharacterLive.wants`).
 * `text` is the spoken prayer (the hero line); `wantDesc`/`layer` carry the
 * underlying 心願 that drove it (a subtle sub-line).
 */
export interface LabPrayer {
    id: string;
    characterId: string;
    name: string;
    /** Uploaded portrait (by character name), if any. */
    portraitUrl?: string;
    day: number;
    tick: number;
    /** Part-of-day the prayer was spoken (清晨/黃昏/…). */
    clock?: string;
    /** The temple the prayer was spoken at. */
    templeName: string;
    /** The SPOKEN prayer, addressed to 神明. */
    text: string;
    /** The underlying 心願 (the want that drove the prayer). */
    wantDesc?: string;
    layer?: string;
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
