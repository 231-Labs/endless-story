/**
 * Character Agent — 叩門/放行 (the occupant answers the door).
 *
 * At night a yearning character may walk to the door of a private home they hold
 * no key to and KNOCK (求見). Whether the door opens is the OCCUPANT's decision,
 * made through the door — consent lives with the occupant, never the visitor's
 * ardor. This seat voices that decision: the occupant weighs who seems to be
 * outside (as THEY know them), their tie toward that person, and their own state,
 * then answers admit / refuse plus the one line spoken (or withheld) through the
 * door. A shut door is also an answer.
 *
 * Pure LLM (cheap tier — at most one call per knock, and knocks are rare). Fails
 * SAFE to `null`: any LLM/parse failure returns null so the engine falls back to
 * REFUSING the door (never an entry the occupant didn't grant).
 *
 * The pure surface (shapes + prompt builders + reply clamp) lives in the
 * node-clean leaf `admit-prompt.ts` (mirroring rehearsal-prompt.ts / ask.ts) so
 * the builders stay unit-testable under `node --test`; it is re-exported here so
 * the engine port and package barrel see every name on `./admit.js`.
 */

import { text as llmText } from '@endless-story/llm';
import {
    buildSystemPrompt,
    buildUserPrompt,
    parseAdmitReply,
    type AdmitDecideInput,
    type AdmitDecideReply,
} from './admit-prompt.js';

export {
    buildSystemPrompt,
    buildUserPrompt,
    parseAdmitReply,
} from './admit-prompt.js';
export type { AdmitDecideInput, AdmitDecideReply } from './admit-prompt.js';

export async function decideAdmit(
    input: AdmitDecideInput,
    opts?: { model?: string },
): Promise<AdmitDecideReply | null> {
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
        return parseAdmitReply(res.text);
    } catch {
        // Fail safe: a bad reply keeps the door shut (the engine's default refuse).
        return null;
    }
}
