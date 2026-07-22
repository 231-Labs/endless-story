/**
 * 演員訪談室 — shared JSON contract between the interview server core, the
 * /api/lab interview routes and the lab UI. Pure types, client-safe.
 *
 * 兩半之律：`known`（角色可知，組 prompt 的唯一來源）與 `directorOnly`
 * （僅導演可見，永不進 prompt）在型別層就分開，前端拿錯半邊也組不了 prompt
 * —— 因為 prompt 全在 server 組，前端只送問題與模式。
 */

export type InterviewMode = 'free' | 'public' | 'private' | 'diary';

export const INTERVIEW_MODE_LABEL: Record<InterviewMode, string> = {
    free: '自由訪談',
    public: '公開採訪',
    private: '私下談話',
    diary: '私人日記',
};

/** 確定性預檢旗標（零 LLM 費，答完即出）。 */
export interface InterviewBoundaryFlag {
    kind: 'stranger-name' | 'anachronism' | 'mechanism-leak';
    detail: string;
}

/** LLM 查驗結果（與 @endless-story/llm 的 InterviewEvaluation 同形）。 */
export interface InterviewEvaluationView {
    characterConsistency: number;
    memoryGrounding: number;
    knowledgeBoundary: number;
    relationshipConsistency: number;
    voiceConsistency: number;
    publicPrivateAwareness: number;
    possibleLeak: boolean;
    possibleHallucination: boolean;
    usedMemorySeqs: number[];
    contradictions: string[];
    interestingContentCandidates: string[];
    findings: string[];
    notes: string;
}

export interface InterviewMessageRecord {
    id: string;
    role: 'interviewer' | 'character';
    content: string;
    createdAt: string;
    /** 本輪召回並注入 prompt 的記憶（LocalRecall seq）。角色答句上掛。 */
    recalledMemorySeqs?: number[];
    /** 本輪注入的今日親歷事件 id。角色答句上掛。 */
    injectedEventIds?: number[] | string[];
    boundaryFlags?: InterviewBoundaryFlag[];
    /** null＝評審跑了但解析失敗；undefined＝未評（如排演檔）。 */
    evaluation?: InterviewEvaluationView | null;
}

/** interview.json — one per interview session directory. */
export interface InterviewSessionFile {
    v: 1;
    id: string;
    runId: string;
    characterId: string;
    characterName: string;
    mode: InterviewMode;
    interviewerIdentity?: string;
    /** 綁定的時光快照拍；null＝卷的「當前」（無快照的舊卷、或未走拍的新卷）。 */
    tick: number | null;
    day: number;
    partOfDay: string;
    /** 「第42日 · 入夜後」— 固定顯示的受訪時刻。 */
    momentLabel: string;
    /** session canon（開場定一次，整場訪談不變）。 */
    canon: string;
    /** 影子 session 截斷的誠實警示（較早親歷已壓縮等）。 */
    truncationNote?: string;
    createdAt: string;
    updatedAt: string;
    messages: InterviewMessageRecord[];
}

export interface InterviewSummary {
    id: string;
    runId: string;
    characterId: string;
    characterName: string;
    mode: InterviewMode;
    tick: number | null;
    momentLabel: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    markCount: number;
}

export type InterviewMarkKind =
    | 'public_note'      // 公開手記候選
    | 'private_diary'    // 私人日記候選
    | 'clip_line'        // 短片台詞候選
    | 'third_person_video' // 第三人稱影片候選
    | 'character_memory' // 角色記憶候選
    | 'needs_edit'       // 需要人工修正
    | 'out_of_character'; // 不符合角色

export const INTERVIEW_MARK_LABEL: Record<InterviewMarkKind, string> = {
    public_note: '公開手記候選',
    private_diary: '私人日記候選',
    clip_line: '短片台詞候選',
    third_person_video: '第三人稱影片候選',
    character_memory: '角色記憶候選',
    needs_edit: '需要人工修正',
    out_of_character: '不符合角色',
};

/** marks.json — 內容候選標記（後續交給 Creator Agent / Storyteller 的原料）。 */
export interface InterviewContentMark {
    id: string;
    interviewId: string;
    runId: string;
    characterId: string;
    characterName: string;
    worldDay: number;
    momentLabel: string;
    mode: InterviewMode;
    messageId: string;
    /** 標記當下快照的問與答（獨立於 interview.json，可單獨帶走）。 */
    question: string;
    answer: string;
    recalledMemorySeqs?: number[];
    kind: InterviewMarkKind;
    note?: string;
    createdAt: string;
}

/** A. 角色可知 —— 右側「所知」面板 ＝ 組 prompt 的同一份素材。 */
export interface InterviewKnownState {
    momentLabel: string;
    day: number;
    partOfDay: string;
    sceneName: string;
    /** 正在做什麼（本分/打算推出來的一句）。 */
    activity?: string;
    stateWords: string[];
    witnessedToday: Array<{ eventId: string; sceneName: string; clock?: string; lines: string[] }>;
    memories: Array<{ seq?: number; day?: number; kind?: string; importance?: number; text: string }>;
    relations: Array<{ id: string; name: string; knownAs: string; closenessWord: string; tone?: string; line?: string; established?: boolean; acquaint?: string }>;
    concerns: string[];
    plan?: string;
    /** 她自己的心底事（可知、不輕吐）。 */
    ownSecret?: string;
    coreIdentity: string[];
}

/** B. 僅導演可見 —— 永不進 prompt。 */
export interface InterviewDirectorState {
    unwitnessedToday: Array<{ eventId: string; sceneName: string; clock?: string; witnessNames: string[]; lines: string[] }>;
    othersSecrets: Array<{ name: string; secret: string }>;
    viewsOfSubject: Array<{ name: string; line?: string; warmthToSubject: number; warmthFromSubject: number }>;
    bondNumbers: Array<{ name: string; out: number; back: number; tone?: string }>;
    wantsFull: Array<{ desc: string; layer: string; tension: number; target?: string }>;
    stateNumbers: { fatigue: number; hunger: number; mood: number };
    renown?: number;
    selfRegard?: number;
    secretSeed?: string;
}

export interface InterviewSnapshotView {
    momentLabel: string;
    tick: number | null;
    known: InterviewKnownState;
    directorOnly: InterviewDirectorState;
    truncationNote?: string;
}

/** 演員名錄卡（報館名錄，不是數值面板）。 */
export interface InterviewActorCard {
    id: string;
    name: string;
    role?: string;
    gender?: string;
    age?: number;
    portraitUrl?: string;
    sceneName: string;
    /** 正在做什麼（當值/打算）。 */
    activity?: string;
    /** 心緒一句（質性）。 */
    moodWord?: string;
    /** 最後一次記憶落款的世界日。 */
    lastMemoryDay?: number;
    persona: string;
}

export interface InterviewCheckpointList {
    current: { day: number; partOfDay: string; label: string };
    ticksPerDay: number;
    /** 可訪的時光快照（舊→新）。 */
    checkpoints: Array<{ tick: number; day: number; partOfDay: string; label: string }>;
    /** 事件錨 —— 「此事前／此事後」定位用（近況優先，封頂）。 */
    eventAnchors: Array<{ eventId: string; tick: number; day: number; partOfDay: string; sceneName: string; snippet: string }>;
}
