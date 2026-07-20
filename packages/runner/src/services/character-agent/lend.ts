/**
 * Character Agent — 告借/應借 (the asked lender answers a borrow).
 *
 * 借錢是兩造的事——錢動之前，出借的人先點頭；婉拒也是一句回答。When a beat's
 * `borrow` command names a co-present cast member, the engine asks THIS seat for
 * the lender's answer before any money moves: the lender weighs their own purse,
 * the tie toward the asker, the stated 緣故 and any 舊帳 already standing, then
 * answers lend / refuse plus the one line spoken (or withheld) on the spot.
 *
 * Pure LLM (cheap tier — at most one call per ask, and asks are rare). Fails
 * SAFE to `null`: any LLM/parse failure returns null so the engine falls back
 * to REFUSING the loan (never a loan the lender didn't grant).
 *
 * The pure surface (shapes + prompt builders + reply clamp) lives in the
 * node-clean leaf `lend-prompt.ts` (mirroring admit-prompt.ts / ask.ts) so
 * the builders stay unit-testable under `node --test`; it is re-exported here so
 * the engine port and package barrel see every name on `./lend.js`.
 */

import { text as llmText } from '@endless-story/llm';
import {
    buildSystemPrompt,
    buildUserPrompt,
    parseLendReply,
    type LendDecideInput,
    type LendDecideReply,
} from './lend-prompt.js';

export {
    buildSystemPrompt,
    buildUserPrompt,
    parseLendReply,
} from './lend-prompt.js';
export type { LendDecideInput, LendDecideReply } from './lend-prompt.js';

export async function decideLend(
    input: LendDecideInput,
    opts?: { model?: string },
): Promise<LendDecideReply | null> {
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    try {
        const res = await llm.chat({
            model,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            maxTokens: 120,
            temperature: 0.7,
        });
        return parseLendReply(res.text);
    } catch {
        // Fail safe: a bad reply refuses the loan (the engine's default).
        return null;
    }
}
