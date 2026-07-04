/**
 * Saga soul: per-troupe tonal DNA layered on the genre baseline in the POV
 * system prompt (craft rules stay genre-fixed in `buildSystemPrompt`).
 * Zero-dependency on purpose so the pure block builder is unit-testable
 * without the prompt module's imports.
 */

/**
 * How close characters may get on the page. Orthogonal to `toneRegister`
 * (colour only): the A/B harness showed a warm register alone can't flip the
 * prose — only relaxing the craft rules (`tender`) does. `restrained`/undefined
 * = genre default, byte-identical to before. `consummate` additionally permits
 * an explicit classical literary-erotic register, gated in the block wording to
 * private, mutually confessed pairs; adult literary content, opt-in only.
 */
export type EmotionalStance = 'restrained' | 'tender' | 'consummate';

export interface SagaSoul {
    /** Display name, carried for other consumers; deliberately NOT rendered
     *  into the POV block. */
    sagaName?: string;
    /** World-tier genre/style line replacing the hardcoded default; unset =
     *  engine default (byte-identical prose). */
    genreBase?: string;
    /** Premise — on-chain `Saga.description`: what this troupe is staging. */
    premise?: string;
    /** Event temperament: off-stage drama, conflict type, narrative pace (Tier 2). */
    naturePrompt?: string;
    /** Emotional colour of the narration only; craft rules stay fixed. Empty =
     *  baseline default (byte-identical). */
    toneRegister?: string;
    /** See {@link EmotionalStance}. Rendered by a dedicated block in
     *  `buildSystemPrompt` (not here) so it can override the craft rules.
     *  Undefined = `restrained` (no injection, regression-safe). */
    emotionalStance?: EmotionalStance;
    /** Natural rhythm, e.g. open at sunrise / pack up at dusk (Tier 2). */
    rhythmHints?: string;
    /** Departure policy — on-chain `Saga.departure_policy`. */
    departurePolicy?: string;
    /** Portrait art direction (Tier 2); not fed into the POV system prompt. */
    portraitTone?: string;
}

/**
 * Troupe-temperament block appended to the POV system prompt. Returns '' when
 * no tone-bearing field is present (byte-identical regression); `portraitTone`
 * is deliberately excluded.
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
    if (soul.toneRegister?.trim()) {
        lines.push(
            `- 文字色調（敘述的情緒底色與明暗；只調氛圍，仍守上面的克制鐵則，暖不等於濫情）：${soul.toneRegister.trim()}`,
        );
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
