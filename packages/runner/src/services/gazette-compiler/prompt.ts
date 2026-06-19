/**
 * Gazette compiler — prompt builder.
 *
 * Compiler philosophy: **80% template-driven, 20% LLM smoothing**.
 *
 * Why: the old failed runner attempt let the LLM write the saga
 * narrative free-form → repetitive, recapping, incoherent. The fix:
 *   - All FACTS come from chain events (typed, structured)
 *   - All POV character names + links come from chain commitments
 *   - LLM ONLY writes:
 *       (a) a short, evocative tagline (1 line)
 *       (b) 1-2-sentence narrative wrappers around each event bullet
 *           so it reads like prose, not a database dump
 *
 * The LLM is forbidden from inventing facts. The prompt enumerates
 * the events + chapters as ground truth.
 */

import { type SagaSoul, buildSagaSoulBlock } from '../character-worker/saga-soul.js';

export interface GazetteSnapshot {
    sagaName: string;
    /** Per-saga tonal DNA (F) — colours the gazette's tagline/voice while the
     *  objective-reporter rules keep facts intact. Optional. */
    soul?: SagaSoul;
    /** 1-indexed narrative day. */
    day: number;
    /** Recent director / scene / character events. */
    events: GazetteEvent[];
    /** Recent POV chapter commitments. */
    chapters: GazetteChapter[];
    /** Optional stats. */
    treasuryEndless?: number;
    characterCount?: number;
    /**
     * The Showrunner's own plot analysis (弧線計畫 + latest 導演日誌), read from
     * director memory. This is the clear, validated UNDERSTANDING of what today's
     * events MEAN — used so the gazette reports plot with depth instead of
     * re-deriving meaning from raw events. NB: this text is ops-flavoured
     * (機械問題/danger 數字/0x 編號/巡檢) — the prompt MUST strip that noise; it's
     * a reading aid, never copied verbatim. */
    directorAnalysis?: { arcPlan?: string; latestReport?: string };
}

export interface GazetteEvent {
    kind: string;                  // "StoryletOpened" / "CharacterCalled" / ...
    /** Human-readable summary built by the compiler (factual). */
    summary: string;
    /** Names of characters involved, for cross-linking. */
    characterNames: string[];
    timestampMs: string;
}

export interface GazetteChapter {
    /** Character name + Sui id. */
    characterId: string;
    characterName: string;
    /** On-chain commitment id — used for /feed/chapter/{id} links. */
    commitmentId: string;
    /** Walrus blob id (we don't embed the full prose in the gazette;
     *  just headline + link via /api/blob/<blobId>). */
    blobId: string;
    /** First ~60 chars of the chapter, server-side truncated for teaser. */
    excerpt: string;
    committedAtMs: string;
}

export function buildSystemPrompt(soul?: SagaSoul, hasAnalysis = false): string {
    const situationLine = hasAnalysis
        ? '   - `## 今日局勢` 區塊：1 段（約 3-5 句），承「說書人手記」對劇情的理解，點出今天這幾樁事**背後的走向與看點**——誰在跟誰較勁、什麼快要翻盤、看官該盯著哪裡。這是公報的「實質分析」，用看戲人的話講門道，別只複述事件。'
        : '';
    const base = [
        '你是「公報」主編。公報是戲班一日對外的**免費頭版**——它的任務是把路人勾進來：',
        '**第三人稱客觀**、報紙頭版的口吻，先用頭條抓人，再把當日的章回當「下回分解」吊著。',
        ...(hasAnalysis
            ? [
                  '',
                  '我會附上一份「**說書人手記**」——這是說書人（戲班的敘事總管）對當前劇情的理解：主題、各條張力線的進展、埋下的伏筆。',
                  '**用它來讀懂今天這些事的意義與來龍去脈**，讓公報有縱深、講得出門道，而不是流水帳。它是你的理解依據，不是要照抄的稿子。',
              ]
            : []),
        '',
        '**鐵則**：',
        '1. **事實全在我給你的事件列表跟章回列表裡 — 你不可以發明任何事件**。說書人手記可以幫你理解事件的意義與關聯，但不可據它生出列表上沒有的新事件。',
        ...(hasAnalysis
            ? [
                  '2. **嚴禁把後台運維的黑話寫進公報**。公報是給看戲的人讀的，只寫戲裡的人與事。下列字眼一律不得出現：機械問題、blob／索引／編譯／上鏈、danger／atmosphere／氣壓的數字、0x 開頭的編號、巡檢、推進事件、結算／judge／ACT、心跳、種（下）關係、工具、direct_capabilities、danger+N。把這些都翻成戲裡的說法（例：「danger 120 超臨界」→「戲班裡的火氣眼看壓不住」）。',
              ]
            : []),
        '2. 你的輸出 = 一份完整 markdown 公報，依序包含：',
        '   - 標題行 `# {sagaName} · 公報 · 第 {N} 日`（直接照填，不要改）',
        '   - 一句短 tagline（你寫，10-25 字，民初白話風）',
        '   - `## 本日頭條` 區塊：**從事件列表挑一樁最有戲的**，寫 2-3 句頭版導言 —— 點出人物、',
        '     場景、衝突的引信，**結尾留一個懸念鈎子**（勾人、但不劇透收場）。這是漏斗的第一口。',
        situationLine,
        '   - `## 其餘動態` 區塊：把其他事件各改寫成 1 句完整敘述，保留人物姓名與場景。每條之間空一行。',
        '     （頭條那樁不要在這裡重複。）',
        '   - `## 連載預告` 區塊：先寫一句引導語（如「台前幕後各自怎麼想，這幾回正連載——」），',
        '     再每篇 POV 一條，格式：',
        '       `- **{character}**〈視角〉 {一句鈎子，≤18 字，用我給的摘要濃縮、不要照抄} —— [讀這一回 →](/feed/chapter/{commitmentId})`',
        '     每條之間不空行（緊湊如報紙索引）。鈎子要勾人但不劇透結局。',
        '   - 最後一行 CTA：`> 完整章回連載見 [梨園章回 →](/feed?mode=chapter)`',
        '   - `## 班內動態` 區塊：照我給的 stat 數值直接列出，不要包裝',
        '3. **不要長篇 recap 章回內文** — 連載預告那句鈎子最多 18 字；頭條導言最多 3 句。',
        `4. 篇幅約 ${hasAnalysis ? '350-550' : '250-450'} 字。不要灌水。`,
        '5. 風格：民初報紙頭版的口吻，乾、緊、有節奏感，頭條要有「想往下讀」的張力。',
        '',
        '**輸出**：純 markdown，不要 ```fence``` 包裹。直接從 `# ` 開始。',
    ].filter((s) => s !== '');
    // Saga soul colours the tagline / vernacular voice only — the hard rules above still
    // forbid inventing facts, so the gazette stays objective.
    const soulBlock = buildSagaSoulBlock(soul);
    return soulBlock ? `${base.join('\n')}\n${soulBlock}` : base.join('\n');
}

export function buildUserPrompt(s: GazetteSnapshot): string {
    const eventsBlock =
        s.events.length > 0
            ? s.events
                  .map(
                      (e, i) =>
                          `${i + 1}. [${e.kind}] ${e.summary}` +
                          (e.characterNames.length > 0
                              ? ` (角色: ${e.characterNames.join('、')})`
                              : ''),
                  )
                  .join('\n')
            : '（今日鏈上無事件）';

    const chaptersBlock =
        s.chapters.length > 0
            ? s.chapters
                  .map(
                      (c) =>
                          `- 角色: ${c.characterName} | commitmentId: ${c.commitmentId} | 摘要: ${c.excerpt}`,
                  )
                  .join('\n')
            : '（今日無 POV 章回 committed）';

    const stats: string[] = [];
    if (s.characterCount != null) stats.push(`- 戲班角色數: ${s.characterCount}`);
    if (s.treasuryEndless != null) stats.push(`- 班費: ${s.treasuryEndless} ENDLESS`);
    const statsBlock = stats.length > 0 ? stats.join('\n') : '（無數據）';

    const arcPlan = s.directorAnalysis?.arcPlan?.trim();
    const latestReport = s.directorAnalysis?.latestReport?.trim();
    const analysisBlock =
        arcPlan || latestReport
            ? [
                  '',
                  '# 說書人手記（你的劇情理解依據 — 用來讀懂事件的意義，不可照抄，不可把其中的後台運維字眼搬進公報）',
                  ...(arcPlan ? ['## 弧線計畫（當前主題 / 張力線 / 伏筆）', arcPlan.slice(0, 2400)] : []),
                  ...(latestReport ? ['## 最近一次心跳手記', latestReport.slice(0, 1000)] : []),
              ].join('\n')
            : '';

    return [
        `# Saga`,
        `- 名稱: ${s.sagaName}`,
        `- 第 ${s.day} 日`,
        analysisBlock,
        '',
        `# 今日鏈上事件（事實，不可省略）`,
        eventsBlock,
        '',
        `# 今日 POV 章回（每篇必須出現在「章回連結」區塊）`,
        chaptersBlock,
        '',
        `# 數據`,
        statsBlock,
        '',
        '請輸出完整公報 markdown。',
    ].join('\n');
}
