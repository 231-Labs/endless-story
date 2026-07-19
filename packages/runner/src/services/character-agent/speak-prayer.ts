/**
 * Character Agent — 祈願 (a character's SPOKEN prayer at a temple).
 *
 * A prayer is a DELIBERATE SPOKEN utterance the character makes at a physical
 * temple — 角色真的來求、對神明說出口的話 — NOT an internal unspoken want. This
 * returns a first-person, in-character prayer addressed to 神明 (含蓄、民國語感、
 * ≤40字); the engine collects it on the 願牆 and voices it at the temple.
 *
 * Pure LLM (cheap tier — one call per prayer). Fails SAFE to `null`: any
 * LLM/parse failure returns null so the engine falls back to its DETERMINISTIC
 * framing (framePrayerFallback) — a prayer is still voiced, just plainer.
 *
 * The pure surface (input shape + prompt builders + reply clamp) lives in the
 * node-clean leaf `speak-prayer-prompt.ts` (mirroring rehearsal.ts) so the
 * builders stay unit-testable under `node --test`; it is re-exported here so the
 * engine port and package barrel see every name on `./speak-prayer.js`.
 */

import { text as llmText } from '@endless-story/llm';
import {
    buildSystemPrompt,
    buildUserPrompt,
    parsePrayer,
    type SpeakPrayerInput,
} from './speak-prayer-prompt.js';

export {
    buildSystemPrompt,
    buildUserPrompt,
    parsePrayer,
} from './speak-prayer-prompt.js';
export type { SpeakPrayerInput } from './speak-prayer-prompt.js';

export async function speakPrayer(
    input: SpeakPrayerInput,
    opts?: { model?: string },
): Promise<string | null> {
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    try {
        const res = await llm.chat({
            model,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            maxTokens: 100,
            temperature: 0.85,
        });
        return parsePrayer(res.text);
    } catch {
        // Fail safe: a bad reply means the engine voices its deterministic prayer.
        return null;
    }
}
