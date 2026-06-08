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
    /** Walrus blob id (we don't embed the full prose in the gazette;
     *  just headline + link via /api/blob/<blobId>). */
    blobId: string;
    /** First ~60 chars of the chapter, server-side truncated for teaser. */
    excerpt: string;
    committedAtMs: string;
}

export function buildSystemPrompt(soul?: SagaSoul): string {
    const base = [
        '你是「公報」編輯。一份公報是戲班一日的對外通報，**第三人稱客觀**、簡潔有節奏感，不是文學連載。',
        '',
        '**鐵則**：',
        '1. **事實全在我給你的事件列表跟章回列表裡 — 你不可以發明任何事件**。',
        '2. 你的輸出 = 一份完整 markdown 公報，包含：',
        '   - 標題行 `# {sagaName} · 公報 · 第 {N} 日`（直接照填，不要改）',
        '   - 一句短 tagline（你寫，10-25 字，民初白話風）',
        '   - `## 今日事` 區塊：把每個事件改寫成 1-2 句敘述（不是 bullet 標題，是完整一句話），保留人物姓名與場景。每條事件之間空一行。',
        '   - `## 章回連結` 區塊：每篇 POV 一條，格式：',
        '       `- **{character}**〈視角〉 {一句鈎子，≤18 字，用我給的摘要濃縮、不要照抄} —— [讀全文 →](/api/blob/{blobId})`',
        '     每條之間不空行（緊湊如報紙索引）。鈎子要勾人但不劇透結局。',
        '   - `## 班內動態` 區塊：照我給的 stat 數值直接列出，不要包裝',
        '3. **不要長篇 recap 章回內文** — 章回連結那句鈎子最多 18 字。',
        '4. 篇幅約 200-400 字。不要灌水。',
        '5. 風格：民初報紙快訊的口吻，乾、緊、有節奏感。',
        '',
        '**輸出**：純 markdown，不要 ```fence``` 包裹。直接從 `# ` 開始。',
    ];
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
                          `- 角色: ${c.characterName} | blobId: ${c.blobId} | 摘要: ${c.excerpt}`,
                  )
                  .join('\n')
            : '（今日無 POV 章回 committed）';

    const stats: string[] = [];
    if (s.characterCount != null) stats.push(`- 戲班角色數: ${s.characterCount}`);
    if (s.treasuryEndless != null) stats.push(`- 班費: ${s.treasuryEndless} ENDLESS`);
    const statsBlock = stats.length > 0 ? stats.join('\n') : '（無數據）';

    return [
        `# Saga`,
        `- 名稱: ${s.sagaName}`,
        `- 第 ${s.day} 日`,
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
