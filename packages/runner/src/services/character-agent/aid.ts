/**
 * Character Agent — AID step (decideAid). Should I give some of my own money to someone — and
 * the give/no-give JUDGMENT is the LLM's, shaped by the character's personality and each bond,
 * NOT a hardcoded rule. The deterministic layer (parse + finalizeAid) only enforces hard safety
 * (recipient must be a real on-screen peer; running total ≤ funds, no overdraft — same rule as
 * the on-chain transfer_between_characters / applyTransfer primitive).
 *
 * The prompt builders + finalizer live in aid-prompt.ts (pure, no workspace deps) so the exact
 * prompt a character reasons over can be rendered + evaluated offline. This file adds the cheap
 * LLM call and the role-voice. The model call is injectable (`opts.judge`) so the eval harness
 * can drive it with a recorded stand-in (no key) or the real client.
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';
import { parseAid } from './parse.js';
import { buildSystemPrompt, buildUserPrompt, finalizeAid, type AidActionInput, type AidActionResult } from './aid-prompt.js';

export type {
    AidActionInput, AidActionResult, AidPeer, AidGift, AidMemo, AidManner, AidRelation, AidSituation, AidVitality,
} from './aid-prompt.js';
export { buildSystemPrompt, buildUserPrompt } from './aid-prompt.js';

/** A model stand-in: given (system, user) prompts, return the raw model text. The default hits
 *  the cheap-tier LLM; the eval passes a recorded judge so it can run with no API key. */
export type AidJudge = (system: string, user: string) => Promise<string>;

export interface DecideAidOptions {
    model?: string;
    judge?: AidJudge;
}

function liveJudge(model?: string): AidJudge {
    return async (system, user) => {
        const llm = llmText.createTextClient({ kind: 'cheap' });
        const res = await llm.chat({
            model: model ?? llm.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 420,
            temperature: 0.6,
        });
        return res.text;
    };
}

export async function decideAidAction(input: AidActionInput, opts?: DecideAidOptions): Promise<AidActionResult> {
    if (input.peers.length === 0) return { gifts: [], reason: '此刻無人可接濟' };
    if (input.funds <= 0) return { gifts: [], reason: '自己也是身無分文' };

    const system = buildSystemPrompt();
    const user = buildUserPrompt(input, roleHint(input.role));
    const judge = opts?.judge ?? liveJudge(opts?.model);
    const raw = await judge(system, user);

    // The model judges; finalizeAid only enforces hard safety (real peer + no overdraft).
    return finalizeAid(parseAid(raw), input);
}
