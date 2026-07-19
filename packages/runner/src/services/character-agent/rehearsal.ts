/**
 * Character Agent — 班主叫排戲 (the troupe-leader's morning rehearsal call).
 *
 * Each daybreak the 班主 decides whether排戲 earns the day it costs: a called
 * rehearsal撐起 tonight's開鑼 (a full house is earned in daylight) and pushes the
 * 新戲 forward, but it eats the白日 and tires the角兒. WHETHER to call and WHICH
 * 戲碼 is the leader's judgment; the engine only READS the verdict — a call sets
 * the day's rehearsal, announces it to the troupe, pulls the players to the venue
 * that afternoon, and (with emergentProduction) bootstraps the play.
 *
 * Pure LLM (cheap tier — one call per day-start for the single 班主). Fails SAFE
 * to `null`: any LLM/parse failure returns null so the engine falls back to NOT
 * calling rehearsal (never a forced call it isn't entitled to make).
 *
 * The pure surface (shapes + prompt builders + reply clamp) lives in the
 * node-clean leaf `rehearsal-prompt.ts` (mirroring ask.ts / negotiate.ts) so the
 * builders stay unit-testable under `node --test`; it is re-exported here so the
 * engine port and package barrel see every name on `./rehearsal.js`.
 */

import { text as llmText } from '@endless-story/llm';
import {
    buildSystemPrompt,
    buildUserPrompt,
    parseRehearsalReply,
    type RehearsalDecideInput,
    type RehearsalDecideReply,
} from './rehearsal-prompt.js';

export {
    buildSystemPrompt,
    buildUserPrompt,
    parseRehearsalReply,
} from './rehearsal-prompt.js';
export type { RehearsalDecideInput, RehearsalDecideReply } from './rehearsal-prompt.js';

export async function decideRehearsal(
    input: RehearsalDecideInput,
    opts?: { model?: string },
): Promise<RehearsalDecideReply | null> {
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
        return parseRehearsalReply(res.text);
    } catch {
        // Fail safe: a bad reply means the engine simply does not call rehearsal.
        return null;
    }
}
