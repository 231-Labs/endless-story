'use server';

/**
 * Server action — preview the 1 character that this voucher would mint.
 *
 * The gacha model: same `attribute_seed` → same rolled values → (modulo LLM
 * temperature) same character narrative. Once the user accepts, the rolled
 * values + LLM-generated profile flow into `redeem-voucher`.
 *
 * Flow:
 *   1. Verify the userPrompt was moderated (HMAC check)
 *   2. Roll attributes deterministically from voucher.attribute_seed
 *   3. Ask LLM to write narrative that matches the rolled values
 *   4. Return preview + the (still-locked) rolled values
 *
 * Phase 2 schema: hard-coded from `DEFAULT_ATTRIBUTE_SCHEMA`. Phase 3
 * will switch to a live World read.
 */

import { createTextClient } from '@endless-story/llm/text';
import type { ChatMessage } from '@endless-story/llm/text';
import {
    buildCharacterGenPrompt,
    buildCharacterRepairMessage,
    parseCharacterCandidate,
    validateCharacterCandidate,
    type CandidateViolation,
    type CharacterCandidate,
    type RolledAttribute,
} from '@endless-story/llm/prompts';
import { rollAttributesFromSeed } from '@endless-story/llm/seed';
import { DEFAULT_ATTRIBUTE_SCHEMA } from '../config/attribute-schema.js';
import { verifyPromptSignature } from './moderate-prompt.js';

export interface PreviewCharacterInput {
    /** Hex-encoded voucher attribute_seed (no 0x prefix). */
    attributeSeedHex: string;
    /** Moderated user prompt. */
    userPrompt: string;
    /** HMAC returned by `moderatePrompt`. */
    signature: string;
    /** Saga role intent text (off-chain Recruitment). */
    recruitmentIntent?: string;
    /** Hard gender requirement (male/female) — forces the candidate's gender. */
    requiredGender?: '男' | '女';
    /** Existing cast names in the saga (avoid name collision). */
    castNames?: string[];
    /** Atmosphere tags. */
    storyTags?: string[];
}

export interface PreviewCharacterResult {
    ok: boolean;
    error?: string;
    candidate?: CharacterCandidate;
    /** Server-locked rolled values (caller MUST pass these to redeem unchanged). */
    rolledValues?: RolledAttribute[];
}

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/^0x/, '').trim();
    if (clean.length % 2 !== 0) {
        throw new Error('attributeSeedHex: odd-length hex');
    }
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

export async function previewCharacter(input: PreviewCharacterInput): Promise<PreviewCharacterResult> {
    const promptOk = await verifyPromptSignature(input.userPrompt, input.signature);
    if (!promptOk) {
        return { ok: false, error: '描述簽章不符，請重新走審核。' };
    }

    let seed: Uint8Array;
    try {
        seed = hexToBytes(input.attributeSeedHex);
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'seed 格式錯誤' };
    }
    if (seed.length === 0) {
        return { ok: false, error: 'seed 為空' };
    }

    const rolledValues = rollAttributesFromSeed(seed, DEFAULT_ATTRIBUTE_SCHEMA);

    let client;
    try {
        client = createTextClient({ kind: 'primary' });
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : '預覽模組未設定' };
    }

    const built = buildCharacterGenPrompt({
        userPrompt: input.userPrompt,
        recruitmentIntent: input.recruitmentIntent,
        castNames: input.castNames,
        storyTags: input.storyTags,
        schemaKeys: DEFAULT_ATTRIBUTE_SCHEMA,
        rolledValues,
        requiredGender: input.requiredGender,
    });

    // Generate → verify → repair (NARRATIVE_AGENTS.md §12.0). The gen prompt's
    // rules are soft; deterministic checks catch gender drift / frailty tropes /
    // unprompted dark secrets, and a follow-up message asks the model to fix
    // exactly what's flagged. 1 initial + up to 2 repair rounds.
    const MAX_ATTEMPTS = 3;
    let messages: ChatMessage[] = [...built.messages];
    let candidate: CharacterCandidate | null = null;
    let violations: CandidateViolation[] = [];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        let text: string;
        try {
            const res = await client.chat({
                messages,
                maxTokens: built.maxTokens,
                // Repair rounds run cooler — we want obedient edits, not re-rolls.
                temperature: attempt === 0 ? 0.7 : 0.4,
            });
            text = res.text;
        } catch (err) {
            if (candidate) break; // keep the best parsed candidate we already have
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }

        const parsed = parseCharacterCandidate(text, rolledValues, input.requiredGender);
        if (!parsed) {
            if (attempt === MAX_ATTEMPTS - 1) break;
            messages = [
                ...messages,
                { role: 'assistant', content: text },
                {
                    role: 'user',
                    content:
                        '上一版不是合法 JSON。請重新輸出符合格式的 JSON 物件，不要任何前綴、說明或 markdown 代碼框。',
                },
            ];
            continue;
        }

        candidate = parsed;
        violations = validateCharacterCandidate(parsed, {
            userPrompt: input.userPrompt,
            requiredGender: input.requiredGender,
            schemaKeys: DEFAULT_ATTRIBUTE_SCHEMA,
        });
        if (violations.length === 0) break;
        if (attempt < MAX_ATTEMPTS - 1) {
            messages = [
                ...messages,
                { role: 'assistant', content: text },
                { role: 'user', content: buildCharacterRepairMessage(violations) },
            ];
        }
    }

    if (!candidate) {
        return { ok: false, error: 'LLM 回應無法解析為角色，請重試。' };
    }
    if (violations.length > 0) {
        // Out of repair budget — accept rather than block the player, but leave
        // a trace so prompt regressions surface in logs.
        console.warn(
            '[preview-character] accepted candidate with unresolved violations:',
            violations.map((v) => v.code).join(', '),
        );
    }

    return { ok: true, candidate, rolledValues };
}
