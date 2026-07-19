/**
 * Character Agent — 路遇 (roadside encounter) step.
 *
 * A cross-district journey physically passes the public throat of each district
 * (NARRATIVE_AGENTS §2: movement has a cost). If the traveller SEES someone on
 * that road, they decide — in the moment — whether to press on, nod in passing,
 * or STOP and take the encounter up (which abandons the errand they set out on).
 * This is the second half of movement agency: not just where you aim, but what
 * waylays you on the way.
 *
 * Pure LLM (cheap tier — only fires when a relevant person stands on the road,
 * so it is rare). Fails SAFE to `pass`: a hallucination or error just means the
 * traveller keeps walking and arrives as planned. Output is clamped to the three
 * legal acts.
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';

export interface TransitReactInput {
    /** The traveller. */
    name: string;
    role?: string;
    bodyFact?: string;
    /** The person seen on the road. */
    seenName: string;
    seenRole?: string;
    seenBodyFact?: string;
    /** How the traveller feels toward the person seen, in their own words. */
    tieToward?: string;
    /** Where the encounter happens (the district's public throat). */
    waypointName: string;
    /** Where the traveller set out from / was heading. */
    fromName: string;
    toName: string;
    /** The errand at stake — what is ABANDONED if they stop (a world fact, not a
     *  rule): the duty, the person they meant to reach, the thing they meant to do. */
    errand: string;
    clock?: string;
    isNight?: boolean;
}

export interface TransitReaction {
    /** pass = keep walking, arrive as planned; greet = a nod, still arrive;
     *  engage = stop here and take it up — the errand slips. */
    act: 'pass' | 'greet' | 'engage';
    /** One first-person line, only when engaging (or a warm greeting). */
    word?: string;
}

const ACTS = new Set(['pass', 'greet', 'engage']);

export function buildSystemPrompt(): string {
    return [
        '你正在趕路，半道上撞見了一個人。就這一瞬，你要決定：**照舊趕路**、**點頭招呼便過**、還是**停下來把這一刻接住**。',
        '',
        '**鐵則**：',
        '1. 停下來是有代價的——你原本要辦的事就這麼擱下了（趕不上、見不著、辦不成）。值不值得，看你對這個人、這件事的分量。',
        '2. 多數萍水相逢，點個頭或擦身而過就是了。唯有心裡真放不下的那個人、那樁事，才值得你把腳步停死在半路。',
        '3. word 用第一人稱、≤20字，只有招呼或停下時才寫；照舊趕路就不必。',
        '4. 提到別人時，姓名與第三人稱照給你的資料，不可改名、倒字、錯性別。',
        '5. 一律繁體中文（臺灣用字），不可混入簡體。',
        '',
        '**輸出**：嚴格只輸出一個 JSON，例如',
        '`{"act":"engage","word":"你且慢走，我正有話要問你"}` 或 `{"act":"greet","word":"這麼巧"}` 或 `{"act":"pass"}`。不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: TransitReactInput): string {
    const seenBody = input.seenBodyFact ? `〔身:${input.seenBodyFact}〕` : '';
    const tie = input.tieToward ? `〔你對TA:${input.tieToward}〕` : '';
    const seenRole = input.seenRole && input.seenRole !== '—' ? `(${input.seenRole})` : '';
    return [
        '# 你是誰',
        `- 姓名:${input.name}`,
        input.role ? `- 行當:${input.role}` : '',
        input.role ? `- 行當聲口:${roleHint(input.role)}` : '',
        input.bodyFact ? `- 身:${input.bodyFact}` : '',
        input.clock ? `- 此刻:${input.clock}${input.isNight ? '（入夜）' : ''}` : '',
        '',
        `## 你正在做的事`,
        `你打「${input.fromName}」往「${input.toName}」去——${input.errand}`,
        '',
        `## 半道上（${input.waypointName}）你撞見了`,
        `${input.seenName}${seenRole}${seenBody}${tie}`,
        '',
        '停、還是不停？(JSON)',
    ]
        .filter((line) => line !== '')
        .join('\n');
}

export async function transitReact(
    input: TransitReactInput,
    opts?: { model?: string },
): Promise<TransitReaction> {
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    try {
        const res = await llm.chat({
            model,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            maxTokens: 120,
            temperature: 0.8,
        });
        const match = res.text.match(/\{[\s\S]*\}/);
        if (!match) return { act: 'pass' };
        const parsed = JSON.parse(match[0]) as { act?: string; word?: string };
        if (!parsed.act || !ACTS.has(parsed.act)) return { act: 'pass' };
        const word = typeof parsed.word === 'string' ? parsed.word.slice(0, 40) : undefined;
        return { act: parsed.act as TransitReaction['act'], word: parsed.act === 'pass' ? undefined : word };
    } catch {
        // Fail safe: a bad reply just means the traveller walks on and arrives.
        return { act: 'pass' };
    }
}
