/**
 * Character Agent — ASK step (decideAsk). The "pull" side of money: a character in need decides
 * whether to ask someone for help, whom, how much, and how. The judgment is the LLM's; the
 * deterministic layer (finalizeAsk) only enforces hard shape (a real, non-self target + positive
 * amount). The granting side is decideAid (the asker is surfaced to the target as a needy peer).
 *
 * Mirror of decideAidAction: build prompts → cheap LLM (injectable judge) → parseAsk → finalize.
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';
import { parseAsk } from './parse.js';
import { buildSystemPrompt, buildUserPrompt, finalizeAsk, type AskActionInput, type AskActionResult } from './ask-prompt.js';

export type {
    AskActionInput, AskActionResult, AskCandidate, AskKind, AskRelation, AskVitality,
} from './ask-prompt.js';
export { buildSystemPrompt as buildAskSystemPrompt, buildUserPrompt as buildAskUserPrompt, askKindLabel } from './ask-prompt.js';

/** A model stand-in: (system, user) → raw model text. Default hits the cheap-tier LLM. */
export type AskJudge = (system: string, user: string) => Promise<string>;

export interface DecideAskOptions {
    model?: string;
    judge?: AskJudge;
}

function liveJudge(model?: string): AskJudge {
    return async (system, user) => {
        const llm = llmText.createTextClient({ kind: 'cheap' });
        const res = await llm.chat({
            model: model ?? llm.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 240,
            temperature: 0.6,
        });
        return res.text;
    };
}

export async function decideAskAction(input: AskActionInput, opts?: DecideAskOptions): Promise<AskActionResult> {
    if (input.candidates.length === 0) return { doAsk: false, reason: '此刻無人可求' };

    const system = buildSystemPrompt();
    const user = buildUserPrompt(input, roleHint(input.role));
    const judge = opts?.judge ?? liveJudge(opts?.model);
    const raw = await judge(system, user);

    return finalizeAsk(parseAsk(raw), input);
}
