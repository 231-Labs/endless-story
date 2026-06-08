/**
 * Saga soul — per-troupe narrative flavour layered on top of the hardcoded
 * opera-world genre baseline in the POV system prompt.
 *
 * The world is an early-Republic opera world, so the *craft* rules (limited POV,
 * restrained emotion, no inventing facts…) stay genre-fixed in `buildSystemPrompt`.
 * What varies per saga is its tonal DNA — premise, event temperament, natural
 * rhythm, departure policy. Today every saga would share one voice because none
 * of this reaches generation; this block is how each troupe tilts the prose toward itself.
 *
 * Zero-dependency on purpose: the pure block builder is unit-testable without
 * pulling the prompt module's `@endless-story/shared` import (mirrors how
 * `role-traits.ts` is imported directly in tests).
 */

export interface SagaSoul {
    /** Saga display name. Carried for other consumers (gazette /
     *  portrait); intentionally NOT rendered into the POV block — the user
     *  prompt already states the affiliation. */
    sagaName?: string;
    /** Premise — on-chain `Saga.description`: what this troupe is staging. */
    premise?: string;
    /** Event temperament — off-stage drama, conflict type, narrative pace (richer, off-baseline; Tier 2). */
    naturePrompt?: string;
    /** Natural rhythm — e.g. open at sunrise / pack up at dusk / no show on a moonless night (Tier 2). */
    rhythmHints?: string;
    /** Departure policy — on-chain `Saga.departure_policy`. */
    departurePolicy?: string;
    /** Art-style tone — for portraits (Tier 2); not fed into the POV system prompt. */
    portraitTone?: string;
}

/**
 * Build the troupe-temperament block appended to the POV system prompt.
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
