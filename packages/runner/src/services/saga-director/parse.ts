/**
 * Parse + validate LLM JSON response into typed DirectorCapability[].
 *
 * Defensive: LLMs occasionally wrap JSON in ```json fences or add
 * leading prose. We extract the first top-level `{ ... }` and parse
 * that.
 */

import type { DirectorCapability } from '../../types/capabilities.js';

export interface ParseResult {
    capabilities: DirectorCapability[];
    rationale: string;
    rawErrors: string[];
}

export function parseDirectorResponse(raw: string): ParseResult {
    const errs: string[] = [];
    const json = extractJson(raw);
    if (!json) {
        return {
            capabilities: [],
            rationale: '',
            rawErrors: ['failed to extract JSON object from LLM response'],
        };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (e) {
        return {
            capabilities: [],
            rationale: '',
            rawErrors: [`JSON.parse failed: ${(e as Error).message}`],
        };
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return { capabilities: [], rationale: '', rawErrors: ['response is not an object'] };
    }
    const obj = parsed as Record<string, unknown>;
    const rationale = typeof obj.rationale === 'string' ? obj.rationale : '';
    const rawList = Array.isArray(obj.capabilities) ? obj.capabilities : [];
    const capabilities: DirectorCapability[] = [];
    for (const [i, entry] of rawList.entries()) {
        const validated = validateCapability(entry, i, errs);
        if (validated) capabilities.push(validated);
    }
    return { capabilities, rationale, rawErrors: errs };
}

function extractJson(raw: string): string | null {
    // Strip ```json ... ``` fences if present
    const fence = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(raw);
    if (fence) return fence[1];
    // Find first { ... last }
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    return raw.slice(first, last + 1);
}

function validateCapability(
    entry: unknown,
    idx: number,
    errs: string[],
): DirectorCapability | null {
    if (typeof entry !== 'object' || entry === null) {
        errs.push(`[${idx}] not an object`);
        return null;
    }
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name : '';
    const input = (e.input ?? {}) as Record<string, unknown>;

    switch (name) {
        case 'open_storylet': {
            const templateId = strField(input, 'templateId', errs, idx);
            const sceneId = strField(input, 'sceneId', errs, idx);
            const characterIds = strArrField(input, 'characterIds', errs, idx);
            if (templateId && sceneId && characterIds && characterIds.length > 0) {
                return { kind: 'open_storylet', templateId, sceneId, characterIds };
            }
            return null;
        }
        case 'attribute_pressure': {
            const sceneId = strField(input, 'sceneId', errs, idx);
            const axis = strField(input, 'axis', errs, idx);
            const delta = numField(input, 'delta', errs, idx);
            if (
                sceneId &&
                (axis === 'atmosphere' || axis === 'danger' || axis === 'prosperity') &&
                delta !== null &&
                delta >= -20 &&
                delta <= 20
            ) {
                return { kind: 'attribute_pressure', sceneId, axis, delta };
            }
            return null;
        }
        case 'character_call': {
            const sceneId = strField(input, 'sceneId', errs, idx);
            const characterId = strField(input, 'characterId', errs, idx);
            const reason = typeof input.reason === 'string' ? input.reason : undefined;
            if (sceneId && characterId) {
                return { kind: 'character_call', sceneId, characterId, reason };
            }
            return null;
        }
        case 'relationship_seed': {
            const sceneId = strField(input, 'sceneId', errs, idx);
            const characterA = strField(input, 'characterA', errs, idx);
            const characterB = strField(input, 'characterB', errs, idx);
            const tone = strField(input, 'tone', errs, idx);
            const validTones = ['romance', 'tension', 'rivalry', 'wary', 'estrangement', 'mentorship'];
            if (sceneId && characterA && characterB && tone && validTones.includes(tone)) {
                return {
                    kind: 'relationship_seed',
                    sceneId,
                    characterA,
                    characterB,
                    tone: tone as 'romance' | 'tension' | 'rivalry' | 'wary' | 'estrangement' | 'mentorship',
                };
            }
            return null;
        }
        case 'advance_phase': {
            const sagaId = strField(input, 'sagaId', errs, idx);
            const nextPhase = strField(input, 'nextPhase', errs, idx);
            if (sagaId && nextPhase) {
                return { kind: 'advance_phase', sagaId, nextPhase };
            }
            return null;
        }
        default:
            errs.push(`[${idx}] unknown capability "${name}"`);
            return null;
    }
}

function strField(
    o: Record<string, unknown>,
    key: string,
    errs: string[],
    idx: number,
): string | null {
    const v = o[key];
    if (typeof v !== 'string' || v.length === 0) {
        errs.push(`[${idx}] missing/empty string field "${key}"`);
        return null;
    }
    return v;
}

function strArrField(
    o: Record<string, unknown>,
    key: string,
    errs: string[],
    idx: number,
): string[] | null {
    const v = o[key];
    if (!Array.isArray(v)) {
        errs.push(`[${idx}] missing array field "${key}"`);
        return null;
    }
    const out: string[] = [];
    for (const item of v) {
        if (typeof item !== 'string' || item.length === 0) continue;
        out.push(item);
    }
    return out;
}

function numField(
    o: Record<string, unknown>,
    key: string,
    errs: string[],
    idx: number,
): number | null {
    const v = o[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        errs.push(`[${idx}] missing numeric field "${key}"`);
        return null;
    }
    return v;
}
