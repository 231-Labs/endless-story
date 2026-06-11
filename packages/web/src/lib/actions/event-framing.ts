/**
 * Event framing (flag-gated) — let the LLM director NAME the incident.
 *
 * `selectContention` (deterministic) decides WHICH tension to stage; that stays
 * pure and testable — we never hand the *selection* to the LLM. But the human
 * incident line ("今晚誰壓軸…") was a hard-coded keyword→string map
 * (`event-planner.framingForStatement`). This module hands only that MEANING
 * layer to the LLM: given the chosen contention + the cast in the room, it
 * writes the one-line framing. Pure narration — no chain, no conservation risk.
 *
 * SAFETY: every call falls back to the deterministic label
 * (`framingForStatement`) on ANY problem (flag off → never called; LLM
 * unconfigured / errors / returns junk → `sanitizeFraming` rejects → fallback).
 * So turning the flag on can only ever *improve* the framing, never break the
 * tick. Default off (`llmFraming` tick input).
 *
 * Server-only module (calls the LLM); NOT a 'use server' action — invoked from
 * the tick loop, same as event-spine.ts.
 */

import { createTextClient } from '@endless-story/llm/text';
import { sanitizeFraming } from './event-framing-core';

export { sanitizeFraming };

export interface FrameIncidentInput {
    /** the desire statement that drove the pick (carries the contested thing). */
    statement?: string;
    /** deterministic label from `framingForStatement` — the fallback. */
    fallback: string;
    /** names of the cast in the room (for a grounded line). */
    cast: string[];
    /** scene where it surfaces. */
    sceneName: string;
}

/**
 * Return an LLM-authored framing line for the chosen contention, or the
 * deterministic `fallback` on any failure. Never throws.
 */
export async function frameIncident(input: FrameIncidentInput): Promise<string> {
    try {
        const client = createTextClient({ kind: 'cheap' });
        const cast = input.cast.filter(Boolean).slice(0, 6).join('、') || '戲班眾人';
        const res = await client.chat({
            system:
                '你是民國戲曲世界的場記。給定一樁正在發生的衝突，用一句不超過二十字的中文，' +
                '點出此刻檯面上的張力與利害。只回那一句白描，不要引號、不要句末標點、不要解釋或人名清單。',
            messages: [
                {
                    role: 'user',
                    content:
                        `場景：${input.sceneName || '戲班'}\n` +
                        `在場：${cast}\n` +
                        `衝突主題：${input.statement ?? input.fallback}\n` +
                        `（既有說法可參考但不要照抄）：${input.fallback}`,
                },
            ],
            maxTokens: 64,
            temperature: 0.85,
        });
        return sanitizeFraming(res.text, input.fallback);
    } catch {
        return input.fallback;
    }
}
