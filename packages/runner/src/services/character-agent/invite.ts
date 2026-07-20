/**
 * Character Agent — 邀約 (the inviter offers tonight's word).
 *
 * The REVERSE of 叩門: by day, a character whose 愛/情/虧欠 want presses toward
 * someone CO-PRESENT may hand them a word — 今夜來我處 — a one-time 領入 to
 * their own private home. The seat voices whether the word is actually offered:
 * the inviter weighs their own pressing heart, the tie, the shared scene's ears,
 * and their nerve. Not offering is also an answer.
 *
 * Pure LLM (cheap tier — at most one call per invite-eligible pairing per day).
 * Fails SAFE to `null`: any LLM/parse failure returns null so the engine
 * swallows the word (never an opened door the inviter didn't voice).
 *
 * The pure surface lives in the node-clean leaf `invite-prompt.ts`; re-exported
 * here so the engine port and package barrel see every name on `./invite.js`.
 */

import { text as llmText } from '@endless-story/llm';
import {
    buildSystemPrompt,
    buildUserPrompt,
    parseInviteReply,
    type InviteDecideInput,
    type InviteDecideReply,
} from './invite-prompt.js';

export {
    buildSystemPrompt as buildInviteSystemPrompt,
    buildUserPrompt as buildInviteUserPrompt,
    parseInviteReply,
} from './invite-prompt.js';
export type { InviteDecideInput, InviteDecideReply } from './invite-prompt.js';

export async function decideInvite(
    input: InviteDecideInput,
    opts?: { model?: string },
): Promise<InviteDecideReply | null> {
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
        return parseInviteReply(res.text);
    } catch {
        // Fail safe: a bad reply swallows the word (the engine's default no-invite).
        return null;
    }
}
