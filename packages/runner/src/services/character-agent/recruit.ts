/**
 * Character Agent — 復核座席 (the 班主 reviews a minted candidate).
 *
 * A user mints a character (命名權＋seed 權); before the world admits them the
 * 班主 puts the candidate through three gates — 正典 (era/worldview fit), 文風
 * (name + prose fit the 梨園 register), 安全 (no 擦邊/real-person/hate) — and on
 * accept 拓寫s the user's material into engine cast format while preserving at
 * least one user sentence verbatim in memories (the 擁有感錨點; verify with
 * `hasVerbatimAnchor`). A refusal carries one 班主-voiced line of reason.
 *
 * Pure LLM (cheap tier — 1–2 calls per mint, and mints are rare). Fails SAFE to
 * `null`: any LLM/parse failure returns null so the mint flow treats the
 * candidate as NOT admitted (and may offer a free retry — product policy).
 *
 * The pure surface (shapes + prompt builders + reply clamp + anchor verifier)
 * lives in the node-clean leaf `recruit-prompt.ts` (mirroring admit/lend/invite)
 * so it stays unit-testable under `node --test`; it is re-exported here so the
 * engine port and package barrel see every name on `./recruit.js`.
 */

import { text as llmText } from '@endless-story/llm';
import {
    buildSystemPrompt,
    buildUserPrompt,
    parseRecruitReply,
    type RecruitDecideInput,
    type RecruitDecideReply,
} from './recruit-prompt.js';

export {
    buildSystemPrompt as buildRecruitSystemPrompt,
    buildUserPrompt as buildRecruitUserPrompt,
    parseRecruitReply,
    hasVerbatimAnchor,
} from './recruit-prompt.js';
export type {
    RecruitCandidate,
    RecruitDecideInput,
    RecruitDecideReply,
    RecruitExpandedSeed,
} from './recruit-prompt.js';

export async function decideRecruit(
    input: RecruitDecideInput,
    opts?: { model?: string },
): Promise<RecruitDecideReply | null> {
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    try {
        const res = await llm.chat({
            model,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            maxTokens: 900,
            temperature: 0.7,
        });
        return parseRecruitReply(res.text);
    } catch {
        // Fail safe: a bad reply admits nobody (the mint flow may retry).
        return null;
    }
}
