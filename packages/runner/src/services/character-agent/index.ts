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
import { parseDecision } from './parse.js';

export type { HandCard, DecideInput } from './prompt.js';
export {
    buildSystemPrompt as buildActSystemPrompt,
    buildUserPrompt as buildActUserPrompt,
} from './prompt.js';
export { updatePlan, formatPlanText } from './plan.js';
export type { PlanInput, PlanResult } from './plan.js';
export {
    buildSystemPrompt as buildPlanSystemPrompt,
    buildUserPrompt as buildPlanUserPrompt,
} from './plan.js';
export { decideMove } from './move.js';
export type { MoveDecideInput, MoveDecideResult, MoveSceneOption } from './move.js';
export {
    buildSystemPrompt as buildMoveSystemPrompt,
    buildUserPrompt as buildMoveUserPrompt,
} from './move.js';
export { decideSocialAction } from './social.js';
export type {
    SocialActionInput,
    SocialActionResult,
    SocialSceneMate,
} from './social.js';
export {
    buildSystemPrompt as buildSocialSystemPrompt,
    buildUserPrompt as buildSocialUserPrompt,
} from './social.js';
export { decideAidAction } from './aid.js';
export type {
    AidActionInput,
    AidActionResult,
    AidPeer,
    AidGift,
    AidRelation,
    AidSituation,
    AidMemo,
    AidManner,
    AidVitality,
} from './aid.js';
export {
    buildSystemPrompt as buildAidSystemPrompt,
    buildUserPrompt as buildAidUserPrompt,
} from './aid.js';
export { decideAskAction } from './ask.js';
export type {
    AskActionInput,
    AskActionResult,
    AskCandidate,
    AskKind,
    AskRelation,
    AskVitality,
} from './ask.js';
export { decideConfessAction } from './confess.js';
export type { DecideConfessInput, ConfessResult } from './confess.js';
export {
    buildAskSystemPrompt,
    buildAskUserPrompt,
    askKindLabel,
} from './ask.js';

export interface DecideResult {
    /** Chosen catalog index (what submit_action takes). Always one of the
     *  hand's catalogIndex values (clamped if the LLM strays). */
    catalogIndex: number;
    /** First-person why, surfaced as the action's intent (the INNER thought). */
    intent: string;
    /** What the character SAYS / DOES on stage as they play — the in-scene line
     *  (台詞 or 身段帶白), ≤24字. The visible, showable evidence they're alive;
     *  distinct from `intent` (the private why). */
    line?: string;
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
        line: parsed?.line?.trim() || undefined,
        reason: parsed?.reason,
    };
}

function pickLabel(hand: HandCard[], idx: number): string {
    return hand.find((c) => c.catalogIndex === idx)?.label ?? '出牌';
}
