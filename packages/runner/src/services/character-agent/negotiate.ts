/**
 * Character Agent — 斡旋 (establishment counterparty seat).
 *
 * When a written contract is countered overnight, the堂口 on the other side of
 * the table (華光影片社、申聲唱片行、申報報館…) answers as a PERSON with a real
 * ledger and a frame-authored 立場 — not a static acceptDemandsMatching table
 * (docs/narrative/CONTRACT_ESCROW.md §3). The split of authority is absolute:
 * the mechanical gate decides the NUMBERS (can the books bear it, does it break
 * the floor) — this seat only decides, inside the room the gate already allowed,
 * whether the concession is WORTH making and how the house says so out loud.
 *
 * Pure LLM (cheap tier — one call per pending counter at the day-end phase). The
 * engine writes the pre-formatted book facts (現銀/押著/跑道/在途義務) and, for a
 * money-counter, an askLine stating the delta ALREADY cleared the gate; this seat
 * READS them and never computes a number. Fails SAFE to `null`: any LLM/parse
 * failure returns null so the engine falls back to its deterministic authorization
 * path (a forced refuse would be a decision this seat isn't entitled to make).
 *
 * The pure surface (shapes + prompt builders + reply clamp) lives in the
 * node-clean leaf `negotiate-prompt.ts` (mirroring ask.ts / ask-prompt.ts) so the
 * builders stay unit-testable under `node --test`; it is re-exported here so the
 * engine port and package barrel see every name on `./negotiate.js`.
 */

import { text as llmText } from '@endless-story/llm';
import {
    buildSystemPrompt,
    buildUserPrompt,
    parseNegotiateReply,
    type NegotiateCounterInput,
    type NegotiateCounterReply,
} from './negotiate-prompt.js';

export {
    buildSystemPrompt,
    buildUserPrompt,
    parseNegotiateReply,
} from './negotiate-prompt.js';
export type { NegotiateCounterInput, NegotiateCounterReply } from './negotiate-prompt.js';

export async function negotiateCounter(
    input: NegotiateCounterInput,
    opts?: { model?: string },
): Promise<NegotiateCounterReply | null> {
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
        return parseNegotiateReply(res.text);
    } catch {
        // Fail safe: a bad reply means the engine falls back to its deterministic
        // authorization path — null, never a forced refuse.
        return null;
    }
}
