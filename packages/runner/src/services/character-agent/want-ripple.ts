/**
 * Character Agent — WANT RIPPLE: after a scene's exchange, judge which witness
 * was genuinely stirred — tighten/loosen an existing want or plant ONE
 * genuinely-new short thread (never a restatement; §2.38 mutate fix). Pure LLM
 * (cheap tier); the caller applies deltas via want-core.
 */

import { text as llmText } from '@endless-story/llm';
import { extractJsonLoose, wasTruncated } from '../../infra/json-loose.ts';

export interface RippleJudgeInput {
    sceneName: string;
    /** The scene's beats, e.g. `柳生春：把扇子擱下…`. */
    beats: string[];
    /** Complete witness set for this event. Off-scene characters are forbidden. */
    roster: Array<{ characterId: string; name: string; wants: string[] }>;
}

export interface RippleJudgeDelta {
    characterId: string;
    shift: 'tighten' | 'loosen' | 'none';
    newThread?: string;
    layer?: string;
    target?: string;
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
                '或替誰牽出**一件全新、簡短**的心事(newThread，≤18字，且不是把舊心事換句話說)。心事是掛在心上的念想，不是動作描述。' +
                '下面名單就是這件事的完整在場者；只能替名單裡、真正看見這些逐拍的人判斷，絕不可替場外人傳心或生念。' +
                '只能根據逐拍明寫的動作、話語與此人已有心事；不可憑空造出逐拍沒有的物件、消息、承諾或後續。' +
                '只報真被牽動的(0~3 人)，沒有就回空陣列。\n各人現有心事：\n' +
                rosterLines +
                '\n輸出 JSON：{"ripples":[{"name":"誰","shift":"tighten/loosen/none","newThread":"一件具體的新心事","layer":"層","target":"若指向某人"}]}。沒有新心事時必須完全省去 newThread 欄位，不可填「省略」「無」或其他佔位字。不要 markdown。',
            messages: [{ role: 'user', content: input.beats.join('\n') }],
            // 至多三人，每人 name/shift/newThread(≤18字)/layer/target 五欄；
            // 260 只夠兩人半，第三人常被剪掉（而空陣列是合法答案，看不出少了誰）。
            maxTokens: 600,
            temperature: 0.5,
        });
        const obj = extractJsonLoose(res.text);
        if (wasTruncated(obj)) {
            console.warn(`[want-ripple] 回話被剪斷，已撿回可用的部分（${input.sceneName}）`);
        }
        if (!obj) {
            // 空陣列是合法答案（沒人被牽動），解析不到不是——兩者要分得清。
            console.warn(
                `[want-ripple] ${input.sceneName} 的牽動判不出來（回話開頭：${res.text.slice(0, 120).replace(/\s+/g, ' ')}）`,
            );
        }
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
                newThread: /^(省略|無|沒有|不新增|none|null|n\/?a)$/i.test(s(e.newThread))
                    ? undefined
                    : s(e.newThread) || undefined,
                layer: s(e.layer) || undefined,
                target: s(e.target) || undefined,
            });
        }
        return out;
    } catch {
        return [];
    }
}
