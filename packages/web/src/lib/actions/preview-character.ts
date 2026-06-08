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
import {
    buildCharacterGenPrompt,
    parseCharacterCandidate,
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

    const { messages, maxTokens } = buildCharacterGenPrompt({
        userPrompt: input.userPrompt,
        recruitmentIntent: input.recruitmentIntent,
        castNames: input.castNames,
        storyTags: input.storyTags,
        schemaKeys: DEFAULT_ATTRIBUTE_SCHEMA,
        rolledValues,
        requiredGender: input.requiredGender,
    });

    let text: string;
    try {
        const res = await client.chat({ messages, maxTokens, temperature: 0.7 });
        text = res.text;
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    const candidate = parseCharacterCandidate(text, rolledValues);
    if (!candidate) {
        return { ok: false, error: 'LLM 回應無法解析為角色，請重試。' };
    }

    return { ok: true, candidate, rolledValues };
}
