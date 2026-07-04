/**
 * Storyteller — weave one tick's concurrent scene beats into a single 回
 * passage (§2.44–2.48: dramatic moments in detail, transitions in one line,
 * scenes joined by 與此同時/那廂; faithful to what happened, no invention).
 */

import { text as llmText } from '@endless-story/llm';

export interface WeaveTickInput {
    /** Clock label, e.g. 黃昏. */
    clock: string;
    /** Beat lines, each prefixed with its scene, e.g. `[後台] 柳生春：…`. */
    lines: string[];
    /** Optional saga tone line (profile-sourced). */
    tone?: string;
}

export async function weaveTickChapter(input: WeaveTickInput): Promise<string | null> {
    if (input.lines.length === 0) return null;
    try {
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system:
                '你是說書人。把這一個時段裡幾個場景併發發生的事，編成一段章回（話本口吻、含蓄、情到深處可濃）。' +
                '戲劇處寫細、過場一句帶過、不同場景用「與此同時／那廂」轉。**忠於素材裡發生的事，不新增情節、不替人物編對白。**' +
                (input.tone ? `\n底色：${input.tone}` : '') +
                '\n輸出一段純散文（不要標題、不要 JSON）。',
            messages: [{ role: 'user', content: `【${input.clock}】素材：\n${input.lines.join('\n')}` }],
            maxTokens: 700,
            temperature: 0.85,
        });
        const text = res.text?.trim();
        return text || null;
    } catch (err) {
        console.warn('[weave-tick] failed:', err instanceof Error ? err.message : err);
        return null;
    }
}
