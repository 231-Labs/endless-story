/**
 * Character Agent (N1) — the character chooses its own card for an event. Pure LLM;
 * the caller (web action) does the chain reads + recall + the submit_action tx.
 * See docs/narrative/NARRATIVE_AGENTS.md §2 (character loop) + N1.
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
export { decideGovernanceAction, buildStanding } from './governance.js';
export type {
    DecideGovernanceInput,
    GovernanceProposal,
    GovernanceResult,
    ManagerBond,
} from './governance.js';
export { decideProposalAction } from './proposal.js';
export type { DecideProposalInput, ProposalResult, ProposalScope } from './proposal.js';
export { materializeMention } from './materialize.js';
export type { MaterializeInput, DormantEntity, DormantKind } from './materialize.js';
export { activateDormant } from './activate.js';
export type { ActivateInput, ActivatedCharacter } from './activate.js';
export { deriveGenesisWants, deriveAftermathWant } from './want-genesis.js';
export type { DeriveWantsInput, GenesisWant, AftermathInput } from './want-genesis.js';
export { actBeat, judgeWantResolved, judgeSceneIntimacy } from './beat.js';
export type { SceneIntimacyRating } from './beat.js';
export type { ActBeatInput, BeatResult, BeatForcing, JudgeResolveInput, ResolveVerdict } from './beat.js';
export { judgeRipples } from './want-ripple.js';
export type { RippleJudgeInput, RippleJudgeDelta } from './want-ripple.js';
export {
    buildAskSystemPrompt,
    buildAskUserPrompt,
    askKindLabel,
} from './ask.js';

export interface DecideResult {
    /** Always one of the hand's catalogIndex values (clamped if the LLM strays). */
    catalogIndex: number;
    /** First-person why (the private thought). */
    intent: string;
    /** In-scene spoken/acted line, max 24 chars; distinct from the private intent. */
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
