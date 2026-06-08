/**
 * Gacha pricing — pure math, shared by the admin form (auto-suggest)
 * and the batch re-pricing action. See docs/WHITEPAPER.md §1 for the derivation.
 *
 * Each of the 4 attribute axes is rolled UNIFORMLY on [0, ATTRIBUTE_MAX] and the
 * axes are independent (HKDF domain separation — see packages/llm/src/seed/roll.ts).
 * So for a requirement `attr >= m`, the per-axis hit probability is
 *   (MAX - m + 1) / (MAX + 1)
 * and the joint hit probability across required axes is their product. The number
 * of single draws until a hit is geometric, so E[draws] = 1 / p.
 *
 * The guaranteed bulk-buy sells "the expected grind you skip" + guarantee + instant, so the fair
 * anchor is basePrice × E[draws]; `margin` (< 1 = slight discount) nudges players
 * toward it and smooths revenue.
 */

import type { CharacterAttributes } from '@endless-story/shared';

export const ATTRIBUTE_MAX = 100;
export const DEFAULT_BULK_MARGIN = 0.85;

/** Expected number of single draws to satisfy `minAttributes` (∞ if impossible). */
export function expectedDrawsToMeet(
    minAttributes: Partial<CharacterAttributes> | undefined,
    max = ATTRIBUTE_MAX,
): number {
    let p = 1;
    for (const m of Object.values(minAttributes ?? {})) {
        if (typeof m === 'number' && m > 0) {
            const hit = (max - m + 1) / (max + 1);
            if (hit <= 0) return Infinity; // threshold above the ceiling — unrollable
            p *= hit;
        }
    }
    return p > 0 ? 1 / p : Infinity;
}

/**
 * Suggested bulk-buy price: basePrice × E[draws] × margin, rounded to `roundTo`, never
 * below basePrice (bulk-buy must not undercut a single draw).
 */
export function suggestedBulkPrice(
    basePrice: number,
    minAttributes: Partial<CharacterAttributes> | undefined,
    margin = DEFAULT_BULK_MARGIN,
    roundTo = 10,
): number {
    const e = expectedDrawsToMeet(minAttributes);
    if (!Number.isFinite(e)) return basePrice; // no requirements (E=1) or impossible
    const rounded = Math.round((basePrice * e * margin) / roundTo) * roundTo;
    return Math.max(basePrice, rounded);
}
