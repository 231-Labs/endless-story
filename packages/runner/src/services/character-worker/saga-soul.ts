/**
 * Saga soul — per-戲班 narrative flavour layered on top of the hardcoded
 * 梨園 genre baseline in the POV system prompt.
 *
 * The world is a 民初梨園 world, so the *craft* rules (limited POV, restrained
 * emotion, no inventing facts…) stay genre-fixed in `buildSystemPrompt`. What
 * varies per saga is its tonal DNA — its 本事 (premise), 事件氣質, 自然節律,
 * 離班規矩. Today every saga would share one voice because none of this reaches
 * generation; this block is how each troupe tilts the prose toward itself.
 *
 * Zero-dependency on purpose: the pure block builder is unit-testable without
 * pulling the prompt module's `@endless-story/shared` import (mirrors how
 * `role-traits.ts` is imported directly in tests).
 */

export interface SagaSoul {
    /** Saga display name (戲班名). Carried for other consumers (gazette /
     *  portrait); intentionally NOT rendered into the POV block — the user
     *  prompt already states 所屬. */
    sagaName?: string;
    /** Premise — on-chain `Saga.description`: 這個戲班在演什麼局. */
    premise?: string;
    /** 事件氣質 — 戲外的戲、衝突類型、敘事節奏 (richer, off-baseline; Tier 2). */
    naturePrompt?: string;
    /** 自然節律 — 日出開嗓 / 戌時封箱 / 月不出停戲一日 (Tier 2). */
    rhythmHints?: string;
    /** 離班規矩 — on-chain `Saga.departure_policy`. */
    departurePolicy?: string;
    /** 畫風 tone — portrait 用 (Tier 2); 不進 POV system prompt. */
    portraitTone?: string;
}

/**
 * Build the「戲班氣質」block appended to the POV system prompt.
 *
 * Returns '' when no tone-bearing field is present, so a soul-less saga yields
 * a byte-identical system prompt to before (graceful regression). `portraitTone`
 * is deliberately excluded — it shapes portraits, not prose.
 */
export function buildSagaSoulBlock(soul?: SagaSoul): string {
    if (!soul) return '';
    const lines: string[] = [];
    if (soul.premise?.trim()) {
        lines.push(`- 本事（這個戲班在演什麼局）：${soul.premise.trim()}`);
    }
    if (soul.naturePrompt?.trim()) {
        lines.push(`- 事件氣質：${soul.naturePrompt.trim()}`);
    }
    if (soul.rhythmHints?.trim()) {
        lines.push(`- 自然節律：${soul.rhythmHints.trim()}`);
    }
    if (soul.departurePolicy?.trim()) {
        lines.push(`- 離班規矩：${soul.departurePolicy.trim()}`);
    }
    if (lines.length === 0) return '';
    return [
        '',
        '**此戲班專屬氣質（疊在上面通用設定之上；與通用設定衝突時，以不違背梨園質地為前提，向此戲班傾斜）**：',
        ...lines,
    ].join('\n');
}
