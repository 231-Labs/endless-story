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

/**
 * Emotional STANCE — how close characters are allowed to get on the page.
 * Orthogonal to `toneRegister` (which only colours mood/words): stance governs the
 * BODY of the scene — whether they may approach, say it plainly, and land on a settled
 * warm beat, or must keep the restrained "half-inch apart, hook left open" posture.
 *
 * The A/B harness proved this is the load-bearing knob: a warm `toneRegister` alone
 * still ended every scene on "swallowed it back", because the craft rules (情緒只能靠
 * 閃避錯看流露 / 不要直接表白 / 結尾留未決鉤子) sit earlier and outweigh it. Only
 * relaxing those — `tender` — actually flips the prose from distance to closeness.
 *
 * `restrained` (or undefined) = the genre default, byte-identical to before — so the
 * delivery line's prose is untouched unless a saga/scene opts in.
 *
 * `consummate` = the highest rung: relaxes restraint ALL the way and, WHEN the prose
 * itself confirms the pair are 已互許 + 只你二人在私處, permits an explicit 古典艷情
 * (紅樓/金瓶 literary-erotic) register — 寬衣/肌膚/雲雨, 綺麗婉轉、濃而不淫. The gate is
 * baked into the block's wording (private + confessed only), so it self-限 to earned,
 * private consummation and stays at 親暱 elsewhere. Adult literary content; opt-in only.
 */
export type EmotionalStance = 'restrained' | 'tender' | 'consummate';

export interface SagaSoul {
    /** Saga display name. Carried for other consumers (gazette /
     *  portrait); intentionally NOT rendered into the POV block — the user
     *  prompt already states the affiliation. */
    sagaName?: string;
    /** Premise — on-chain `Saga.description`: what this troupe is staging. */
    premise?: string;
    /** Event temperament — off-stage drama, conflict type, narrative pace (richer, off-baseline; Tier 2). */
    naturePrompt?: string;
    /** Prose tonal register — the emotional COLOUR / brightness of the narration
     *  (e.g. warm-bustling 暖亮 vs desolate 蒼涼 vs plain-daily 清淡). Tilts the mood
     *  ONLY; the genre craft rules (restraint, no cliché, no big words) stay fixed in
     *  `buildSystemPrompt`. Empty = inherit the baseline's restrained, faintly-cold
     *  default — so a soul-less saga is byte-identical to before. */
    toneRegister?: string;
    /** Emotional stance — see {@link EmotionalStance}. Governs closeness, not colour.
     *  Rendered NOT by `buildSagaSoulBlock` but by a dedicated stance block in
     *  `buildSystemPrompt`, because it must be positioned to override the craft rules.
     *  Undefined = `restrained` = genre default (no injection, regression-safe). */
    emotionalStance?: EmotionalStance;
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
