/**
 * Memory consolidation — the "sleep" step of the character loop (N2).
 *
 * Generative-Agents reflection, MemWal-native: at rest, the character
 * recalls its scattered low-density memories (raw observations + POV
 * chapter fragments) and COMPRESSES them into 1-2 high-density interior
 * conclusions. The dense reflections are then stored back as anchored
 * memories (importance 7-9) so future recall surfaces meaning, not noise —
 * and the next sleep won't re-chew them.
 *
 * This file is the pure-LLM compressor only. The web action does the
 * MemWal recall (scattered material) + remember (anchored output) + the
 * on-chain reflection::submit, mirroring how character-agent splits decide
 * (LLM here) from read/act (web). See docs/narrative/NARRATIVE_AGENTS.md §2 REFLECT.
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';

export interface ConsolidateInput {
    name: string;
    role: string;
    sagaName: string;
    /** The scattered low-density memories to digest (newest-first). */
    scattered: string[];
}

export interface ConsolidateResult {
    /** 1-2 high-density first-person reflections (empty if nothing worth keeping). */
    reflections: string[];
}

export function buildSystemPrompt(): string {
    return [
        '你是一個戲園角色,此刻夜深、卸了妝、獨自一人,腦中翻起這些日子的零碎記憶。',
        '入睡前,你會**把零碎的見聞沉澱、壓縮成一兩條真正重要的內心結論或領悟**。',
        '',
        '**鐵則**:',
        '1. 這是「沉澱」不是「複述」:捨棄瑣碎、重複、無關緊要的;只留下**改變了你、或你放不下的**。',
        '2. 用**第一人稱**,寫成你對自己說的內心話,帶你的行當聲口與性格。',
        '3. 每條是一個**高密度的領悟/判斷/情緒結論**(不是流水帳),≤60 字。',
        '4. 最多 2 條,寧少勿濫;若這些記憶實在沒什麼好沉澱的,就只輸出 1 條,或空陣列。',
        '5. 不要發明沒發生過的事;只能從給你的記憶裡淬煉。',
        '',
        '**輸出**:嚴格只輸出一個 JSON 陣列(字串),例如',
        '`["我終於明白,我留在這個班子,不是為了戲,是為了她。", "那夜的火光我忘不掉 —— 我現在連燈籠都不敢多看。"]`',
        '不要 markdown、不要多餘文字、不要物件,只要字串陣列。',
    ].join('\n');
}

export function buildUserPrompt(input: ConsolidateInput): string {
    const memBlock = input.scattered
        .map((m, i) => `${i + 1}. ${m.slice(0, 200)}`)
        .join('\n');
    return [
        `# 你是誰`,
        `- 姓名:${input.name}`,
        `- 行當:${input.role}`,
        `- 行當聲口:${roleHint(input.role)}`,
        `- 所屬:${input.sagaName}`,
        '',
        `## 這些日子翻起的零碎記憶(由新到舊)`,
        memBlock,
        '',
        '請把它們沉澱成一兩條你真正記得住的內心結論(JSON 字串陣列)。',
    ].join('\n');
}

/**
 * Compress scattered memories into 1-2 dense reflections. 'primary' tier —
 * the output becomes long-lived memory a reader may eventually see, so
 * quality matters (unlike the per-turn decide step, which is 'cheap').
 */
export async function consolidateMemories(
    input: ConsolidateInput,
    opts?: { model?: string },
): Promise<ConsolidateResult> {
    const scattered = input.scattered.filter((s) => s.trim());
    if (scattered.length === 0) return { reflections: [] };

    const llm = llmText.createTextClient({ kind: 'primary' });
    const model = opts?.model ?? llm.defaultModel;
    const res = await llm.chat({
        model,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt({ ...input, scattered }) }],
        maxTokens: 500,
        temperature: 0.8,
    });

    const reflections = parseReflections(res.text)
        .map((r) => r.trim())
        .filter(Boolean)
        .slice(0, 2);
    return { reflections };
}

function parseReflections(raw: string): string[] {
    // Prefer a JSON array; tolerate the LLM wrapping it in prose/markdown.
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) {
        try {
            const arr = JSON.parse(m[0]) as unknown;
            if (Array.isArray(arr)) {
                return arr.filter((x): x is string => typeof x === 'string');
            }
        } catch {
            /* fall through to line parsing */
        }
    }
    // Fallback: split non-empty lines, strip list/quote markers.
    return raw
        .split('\n')
        .map((l) => l.replace(/^[\s\-*\d.、"「」]+/, '').replace(/["「」]+$/, '').trim())
        .filter((l) => l.length >= 4)
        .slice(0, 2);
}
