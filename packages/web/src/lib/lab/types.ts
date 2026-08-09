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
    // 叩門夜訪 / 借賒有據 / 尋人掛心 已畢業為常駐（不再是可切換的旗標，永遠常開）。
    /** 情分會淡: a love want whose target is long unseen starves and fades (the
     *  want retires + a private percept); the engine forces nothing else — the
     *  character decides. Off ⇒ the old permanent-love world. */
    heartsCanFade?: boolean;
    /** 執念自揀: a beat is handed its actor's full live-want menu (qualitative ripeness,
     *  no numbers) and self-tags which one it pushed; the ledger follows that choice
     *  instead of the engine's hottest-want guess. Off ⇒ the single-want handoff. */
    beatPicksWant?: boolean;
    /** 惰息存在: a lone character with nothing pressing and nobody seeking them is
     *  quieted — the engine skips their ambient solo musing beat (no LLM call) and
     *  instead gives them ONE consolidated first-person reflection at day-end.
     *  Reactive solitude (a pressing want) still gets its beat. Off ⇒ every solo
     *  turn spends a beat as before. */
    quietPresence?: boolean;
    ticksPerDay: number;
    /** Real OpenAI embeddings for recall (needs OPENAI_API_KEY); default off. */
    realEmbeddings: boolean;
    /** 事件牌組 id (外力層) — the finite, declarative deck the LLM director plays
     *  from. Absent ⇒ no deck: no cards, no director call, no forced deadlines,
     *  exactly as a run behaved before the deck existed. */
    deckId?: string;
    deckSource?: 'builtin' | 'custom';
    /** 追蹤中的角色 (names) — whose POV prose and daily 日記 this run pays for. The
     *  structural layer (台詞＋心下＋事件) always runs for the whole cast; only the
     *  presentation layer is gated. Absent/empty ⇒ everybody, as before. */
    trackedCharacterNames?: string[];
    /** 時間法則（見 docs/narrative/WORLD_TIME_MIRROR.md）——'tick'＝排演拍（預設，
     *  day/時辰由 currentTick 推導）；'mirror'＝鏡像時間（鐘面走真實時刻，年份減一百，
     *  時辰邊界即大拍邊界）。舊卷缺此欄一律當 'tick'，byte-identical。 */
    timeMode?: 'tick' | 'mirror';
    /** 折子節律（喚醒層 P1）——debounce 合併窗與每人每日折子預算。引擎本身另有
     *  預設（60s／6），這裡只在卷主動調校時覆寫；規範化後永遠給一組具體數字，
     *  夾在合理範圍內（見 run-config.ts）。 */
    interlude?: { debounceMs: number; dailyBudget: number };
    /** 活著的世界隔多久搬演一拍（毫秒）。時辰照現實走，這是「戲」的節律——
     *  一時辰四個鐘頭，人在裡頭當然不只做一件事。缺省 3 分鐘，下限 30 秒。 */
    beatIntervalMs?: number;
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
    /** mirror 卷的紀元錨點——創卷那一刻的真實毫秒，故事第 1 日錨在此。分卷沿用
     *  母卷的紀元（日期連續）；復活／新卷各起新紀元。tick 卷不設此欄。 */
    epochRealMs?: number;
    /** 「活著」開關（僅 mirror 卷有意義）：on 時 manager 掛一個 per-run 巡佇列
     *  driver，時辰邊界自動打拍、捎話幾十秒內起折子；off／缺席＝靜止，一切
     *  仍可手動撥拍與捎話，只是沒人自動巡。 */
    alive?: boolean;
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
    /** ALL live wants, hottest first (cards show [0]; the 內頁 shows all).
     *  `id` is the engine want id — the handle 香火 (offer-incense) points at. */
    wants: Array<{ id: string; desc: string; layer: string; tension: number; target?: string }>;
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
    /** 還願：the vow was fulfilled — the pray-er returned after the want resolved. */
    fulfilled?: boolean;
    /** 香火：the character's OWNER burned this stick (Prayer.source 'owner') —
     *  the character does not know it exists (神明感應). */
    owner?: boolean;
    /** The underlying 心願 (the want that drove the prayer). */
    wantDesc?: string;
    layer?: string;
}

/** A registered world object shaped for the scene 內頁's 物在此處 facet —
 *  where it sits (sceneId/container), what shape it's in (state), or on whose
 *  person it rides (carriedBy). Hidden objects come marked, not omitted: the
 *  operator sees everything, 幽 texture stays legible as 幽. */
export interface LabSceneObject {
    id: string;
    label: string;
    sceneId: string;
    sceneName: string;
    container?: string;
    state?: string;
    carriedBy?: string;
    carriedByName?: string;
    visibility: 'visible' | 'hidden';
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

/** 外力牌組 — what the run's event deck picker offers. Id + provenance only:
 *  the deck's own contents are authored data the engine validates at load. */
export interface LabDeckSummary {
    id: string;
    source: 'builtin' | 'custom';
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
            /** Structured delivery intent (records since the interview layer;
             *  absent on older lines — treat as 'scene'). */
            audience?: 'scene' | 'addressed';
            /** Who perceived the exact content — 私語 redaction for knowledge
             *  reconstruction. Absent on older lines ⇒ all witnesses heard. */
            perceiverIds?: string[];
        }>;
    }>;
    eventPovs: Array<{ characterId: string; name: string; eventId: string; body: string }>;
    economyNotices?: string[];
    // ── 宏觀節奏 (macro rhythm) — additive; absent on lines written before it.
    /** 生命體徵: 不可逆事件數／resolved 率／場景熵／收斂與迴圈偵測 for this tick. */
    vitals?: {
        irreversible: number;
        wantsResolved: number;
        wantsLive: number;
        resolvedRate: number;
        resolvedThisTick: number;
        sceneEntropy: number;
        sceneCrowdPeak: number;
        convergence: Array<{ token: string; characterIds: string[]; count: number }>;
        loops: Array<{ characterId: string; token: string; ticks: number }>;
        actorCount: number;
    };
    /** 事件卡 played this tick, and who chose them. */
    cardsPlayed?: Array<{
        cardId: string;
        label: string;
        /** 'director-proposed' = a card the director wrote themselves (validated
         *  against `PROPOSAL_LIMITS`); 'character' = a 世情動作 somebody DID. */
        chosenBy: 'director' | 'deadline' | 'operator' | 'director-proposed' | 'character';
        targetNames: string[];
        /** 世情動作 only: who set it in motion. */
        actorName?: string;
        costume?: string;
        rationale?: string;
        irreversible: number;
        lines: string[];
    }>;
    /** 自撰的牌 the engine refused, with reasons — an overreaching director is
     *  visible in the diagnostics rather than silently swallowed. */
    proposalsRefused?: Array<{ label: string; problems: string[] }>;
    /** 角色工件 written this tick (日記 at day end, 詩詞 on occasion). */
    artifacts?: Array<{
        kind: 'diary' | 'poem';
        id: string;
        characterId: string;
        name: string;
        day: number;
        body: string;
        /** diary only: how many claims survived the beat-evidence audit, and how
         *  many were flagged as unsupported. */
        supportedClaims?: number;
        unsupportedClaims?: number;
        /** poem only. */
        occasion?: string;
    }>;
    /** Who this tick actually paid POV prose for — the tracking switch, visible. */
    povTrackedIds?: string[];
    /** 背景結算: hunger settled offstage, one clause each (never a scene). */
    backgroundNeeds?: string[];
    // ── mirror 卷專屬（喚醒層 P1 · 附錄 A）——additive, absent on tick 卷 / older lines.
    /** 這一拍取樣當下的真實毫秒（MirrorClock 實際取用的那個 `Date.now()`）——
     *  重播讀這個值，不再取樣牆鐘（錄時重播紀律）。 */
    realMs?: number;
    /** 「民國十五年八月五日」——由 `realMs` 推得的敘事日期標籤，tick 卷缺席。 */
    dateLabel?: string;
    /** 「活著」driver 的補算拍才有：跨了幾個時辰邊界才被巡到（恆為 1 拍，
     *  這裡記的是「歇了幾拍」的事實，不是補演的拍數——見六之五）。 */
    skippedBuckets?: number;
    finishedAt: string;
}

/** 折子（喚醒層 P1）——拍與拍之間、外來捎話喚起的一次有界演繹，供 UI 的折子卡
 *  消費。與引擎 `InterludeRecord` 同構，換上 lab 顯示慣用的淺層形狀（無需
 *  characterId 以外的引擎內部細節）。 */
export interface LabInterludeLive {
    id: string;
    characterId: string;
    name: string;
    /** Uploaded portrait (by character name), if any. */
    portraitUrl?: string;
    day: number;
    tick: number;
    partOfDay: string;
    /** 落款的真實毫秒——這一折在真實時間裡的位置。 */
    realMs: number;
    /** debounce 窗內合併聽見的全部捎話。'intent'（起念）是這個人自己先前捎給
     *  此刻的一句話——來路不同，形狀相同（見引擎 `InterludeStimulus`）。 */
    stimuli: Array<{ text: string; kind: 'poke' | 'note' | 'intent' }>;
    response: string;
    memoryNote?: string;
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
