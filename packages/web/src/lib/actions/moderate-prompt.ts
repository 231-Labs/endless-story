'use server';

/**
 * Server action — moderate a user's character description before it
 * enters the storyteller pipeline.
 *
 * Returns the moderation verdict + a signed HMAC the client carries
 * forward to subsequent steps (preview-character / generate-portrait)
 * so they can verify the prompt was actually moderated.
 *
 * Fails open on LLM unavailability ONLY if MODERATION_ALLOW_UNCONFIGURED=1
 * is set; otherwise returns `{ ok: false, reason: 'moderation unavailable' }`.
 */

import { createHmac } from 'node:crypto';
import { createTextClient } from '@endless-story/llm/text';
import {
    USER_PROMPT_MAX,
    USER_PROMPT_MIN,
    buildModerationPrompt,
    parseModerationResult,
} from '@endless-story/llm/prompts';

export interface ModeratePromptResult {
    ok: boolean;
    reason?: string;
    /** HMAC of the prompt; downstream actions verify before LLM call. */
    signature?: string;
}

function signPrompt(prompt: string): string {
    const secret = process.env.RECRUITMENT_MOD_SECRET ?? 'dev-moderation-secret-replace-me';
    return createHmac('sha256', secret).update(prompt).digest('hex');
}

export async function moderatePrompt(userPrompt: string): Promise<ModeratePromptResult> {
    const trimmed = userPrompt.trim();
    if (trimmed.length < USER_PROMPT_MIN) {
        return { ok: false, reason: '請先寫下你想描述的角色。' };
    }
    if (trimmed.length > USER_PROMPT_MAX) {
        return { ok: false, reason: `描述太長（上限 ${USER_PROMPT_MAX} 字），請精簡。` };
    }

    let client;
    try {
        client = createTextClient({ kind: 'cheap' });
    } catch (err) {
        if (process.env.MODERATION_ALLOW_UNCONFIGURED === '1') {
            return { ok: true, signature: signPrompt(trimmed) };
        }
        return { ok: false, reason: err instanceof Error ? err.message : '審核模組未設定' };
    }

    const { messages, maxTokens } = buildModerationPrompt({ userPrompt: trimmed });
    try {
        const res = await client.chat({ messages, maxTokens });
        const verdict = parseModerationResult(res.text);
        if (verdict.verdict === 'ok') {
            return { ok: true, signature: signPrompt(trimmed) };
        }
        if (verdict.verdict === 'not_ok') {
            return { ok: false, reason: verdict.reason ?? '此描述未通過審核，請改寫。' };
        }
        // Parse failed — conservative reject so the model can't accidentally let
        // unmoderated text through on a glitch.
        return { ok: false, reason: '審核暫時無法判讀回應，請重試或精簡描述。' };
    } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Verify a signature came from `moderatePrompt`. Used by downstream actions
 * (preview-character, generate-portrait) before touching expensive APIs.
 */
export async function verifyPromptSignature(prompt: string, signature: string): Promise<boolean> {
    const expected = signPrompt(prompt.trim());
    // Constant-time-ish compare (best-effort in JS without crypto.timingSafeEqual import)
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
        diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
}
