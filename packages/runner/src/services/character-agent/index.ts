/**
 * Character Agent (N1) — the character decides its own action in an event.
 *
 * This is the missing "Act/Decide" half of the actor: instead of admin
 * manually dealing/playing cards, the character agent perceives its hand
 * + the scene + its recalled memories, and CHOOSES a card. Pure LLM
 * decision; the caller (web action) does the chain read (hand/catalog) +
 * recall + the submit_action tx.
 *
 * See docs/NARRATIVE_AGENTS.md §2 (character loop) + N1.
 */

import { text as llmText } from '@endless-story/llm';
import {
    buildSystemPrompt,
    buildUserPrompt,
    type DecideInput,
    type HandCard,
} from './prompt.js';

export type { HandCard, DecideInput } from './prompt.js';

export interface DecideResult {
    /** Chosen catalog index (what submit_action takes). Always one of the
     *  hand's catalogIndex values (clamped if the LLM strays). */
    catalogIndex: number;
    /** First-person why, surfaced as the action's intent. */
    intent: string;
    reason?: string;
}

export async function decideCardPlay(
    input: DecideInput,
    opts?: { model?: string },
): Promise<DecideResult> {
    const valid = new Set(input.hand.map((c) => c.catalogIndex));
    const fallback = input.hand[0]?.catalogIndex ?? 0;
    if (input.hand.length === 0) {
        return { catalogIndex: 0, intent: '（無手牌）', reason: 'empty_hand' };
    }

    // 'cheap' tier: per-turn decision is high volume.
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    const res = await llm.chat({
        model,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
        maxTokens: 400,
        temperature: 0.85,
    });

    const parsed = parseDecision(res.text);
    const catalogIndex =
        parsed && valid.has(parsed.catalogIndex) ? parsed.catalogIndex : fallback;
    return {
        catalogIndex,
        intent: parsed?.intent?.trim() || pickLabel(input.hand, catalogIndex),
        reason: parsed?.reason,
    };
}

function pickLabel(hand: HandCard[], idx: number): string {
    return hand.find((c) => c.catalogIndex === idx)?.label ?? '出牌';
}

function parseDecision(
    raw: string,
): { catalogIndex: number; intent?: string; reason?: string } | null {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        const o = JSON.parse(m[0]) as {
            catalogIndex?: number | string;
            intent?: string;
            reason?: string;
        };
        const ci = Number(o.catalogIndex);
        if (!Number.isFinite(ci)) return null;
        return { catalogIndex: ci, intent: o.intent, reason: o.reason };
    } catch {
        return null;
    }
}
