/**
 * Character Agent — WANT RIPPLE: after a scene's exchange, judge who offstage or
 * onstage was genuinely stirred — tighten/loosen an existing want or plant ONE
 * genuinely-new short thread (never a restatement; §2.38 mutate fix). Pure LLM
 * (cheap tier); the caller applies deltas via want-core.
 */

import { text as llmText } from '@endless-story/llm';

export interface RippleJudgeInput {
    sceneName: string;
    /** The scene's beats, e.g. `柳生春：把扇子擱下…`. */
    beats: string[];
    /** Every candidate: name + their live want descriptions. */
    roster: Array<{ characterId: string; name: string; wants: string[] }>;
}

export interface RippleJudgeDelta {
    characterId: string;
    shift: 'tighten' | 'loosen' | 'none';
    newThread?: string;
    layer?: string;
    target?: string;
}

function extractJson(raw: string): Record<string, unknown> | null {
    const blocks = raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            return JSON.parse(blocks[i]) as Record<string, unknown>;
        } catch {
            /* try an earlier block */
        }
    }
    return null;
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export async function judgeRipples(input: RippleJudgeInput): Promise<RippleJudgeDelta[]> {
    if (input.roster.length === 0 || input.beats.length === 0) return [];
    const rosterLines = input.roster
        .map((r) => `${r.name}：${r.wants.join('；') || '（暫無心事）'}`)
        .join('\n');
    try {
        const client = llmText.createTextClient({ kind: 'cheap' });
        const res = await client.chat({
            model: client.defaultModel,
            system:
                `【${input.sceneName}】剛剛這場來回，判斷牽動了誰：讓誰的心事更緊(tighten)/更鬆(loosen)，` +
                '或替誰牽出**一件全新、簡短**的心事(newThread，≤18字，且不是把舊心事換句話說)。' +
                '只報真被牽動的(0~3 人)，沒有就回空陣列。\n各人現有心事：\n' +
                rosterLines +
                '\n輸出 JSON：{"ripples":[{"name":"誰","shift":"tighten/loosen/none","newThread":"≤18字或省略","layer":"層","target":"若指向某人"}]}。不要 markdown。',
            messages: [{ role: 'user', content: input.beats.join('\n') }],
            maxTokens: 260,
            temperature: 0.5,
        });
        const obj = extractJson(res.text);
        const arr = Array.isArray(obj?.ripples) ? (obj!.ripples as unknown[]) : [];
        const byName = new Map(input.roster.map((r) => [r.name, r.characterId]));
        const out: RippleJudgeDelta[] = [];
        for (const item of arr.slice(0, 3)) {
            const e = item as Record<string, unknown>;
            const characterId = byName.get(s(e.name));
            if (!characterId) continue;
            const shift = s(e.shift);
            out.push({
                characterId,
                shift: shift === 'tighten' || shift === 'loosen' ? shift : 'none',
                newThread: s(e.newThread) || undefined,
                layer: s(e.layer) || undefined,
                target: s(e.target) || undefined,
            });
        }
        return out;
    } catch {
        return [];
    }
}
