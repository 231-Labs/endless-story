/**
 * Storyteller — weave one tick's concurrent scene beats into a single 回
 * passage (§2.44–2.48: dramatic moments in detail, transitions in one line,
 * faithful to what happened, no invention). Carries a running thread from the
 * previous 時辰 (prevTail) so passages connect instead of each opening cold, and
 * varies its openings/transitions instead of leaning on a fixed 話本 crutch.
 *
 * It also PRESERVES the characters' actual telling lines as DIRECT quotes (「…」)
 * the way classical 章回 (紅樓/金瓶梅) interleave quoted speech — flattening every
 * exchange into 轉述 loses the words the reader came for. And it is fed each
 * participant's 身/sex (castBodies) so the weaver never slips a 坤生 (a woman) into
 * "男人" — the gender guard is DATA-DRIVEN (derived from each body phrase), never
 * name-cased.
 */

import { text as llmText } from '@endless-story/llm';
import { pronounFromBody } from '../character-agent/beat-prompt.js';

// Single source for the data-driven 他/她 derivation (character-agent's pure leaf);
// re-exported so scene-record consumers keep their existing import path.
export { pronounFromBody };

/** One participant's in-world 身/sex phrase, for the gender-correct weave/review. */
export interface CastBody {
    name: string;
    /** Short in-world 身/sex phrase, e.g. `女兒身，坤生`. */
    bodyFact?: string;
}

/** Compose the DATA-DRIVEN gender guard line for a set of participants (no names or
 *  pairings hardcoded — each present person's correct 他/她 comes from their bodyFact).
 *  Returns '' when there is nothing to guard. */
function castBodyNote(cast?: CastBody[]): string {
    if (!cast?.length) return '';
    const people = cast
        .filter((c) => c.name)
        .map((c) => `${c.name}是${pronounFromBody(c.bodyFact)}（${c.bodyFact ?? '身不詳'}）`);
    if (!people.length) return '';
    return (
        `\n【在場眾人的身（用對代詞、別寫錯性別）】${people.join('、')}——` +
        '照這個寫，坤生／女子縱然台上扮男、氣度英挺，落筆也不可寫成「男人」；男子亦不可寫成「她」。'
    );
}

export interface WeaveTickInput {
    /** Clock label, e.g. 黃昏. */
    clock: string;
    /** Beat lines, each prefixed with its scene, e.g. `[後台] 柳生春：…`. */
    lines: string[];
    /** Optional saga tone line (profile-sourced). */
    tone?: string;
    /** The last ~1-2 sentences of the PREVIOUS 時辰's woven chapter, so this passage
     *  can 承上啟下 (carry on naturally) instead of every 時辰 opening cold. */
    prevTail?: string;
    /** The scene participants' 身/sex facts, so the weaver keeps every person's gender
     *  and pronoun correct (a 坤生 is never rendered "男人"). DATA, not name-casing. */
    castBodies?: CastBody[];
    /** WHY each participant came together this 時辰 — their own reason for being here, in
     *  the order they moved. This is the extra context that lets the weaver render the
     *  scene's CAUSALITY (who sought whom, and why) as ONE coherent passage with 前因後果,
     *  instead of stitching disconnected beats. BACKGROUND ONLY: it is each person's inner
     *  reckoning, never something that happened — the prose still narrates only the actual
     *  beats, and must not treat a private plan as an event. */
    context?: string[];
}

export async function weaveTickChapter(input: WeaveTickInput): Promise<string | null> {
    if (input.lines.length === 0) return null;
    try {
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system:
                '你是說書人。把這一個時段裡幾個場景併發發生的事，編成一段章回（話本口吻、含蓄、情到深處可濃）。' +
                '戲劇處寫細、過場一句帶過。**忠於素材裡發生的事，不新增情節、不替人物編對白。**' +
                // Keep the characters' real words as DIRECT quotes — a 章回 lives on its spoken lines.
                '\n【對白】素材裡人物真正說出口的那些要緊話、傳神話，要**照原話留成引語「…」織進正文**，' +
                '別把人物的話全化成「他說他如何如何」的轉述——紅樓、金瓶梅都是有血有肉的直接對白。' +
                '只留素材裡真有的話，不許替人物新編一句台詞；沒說出口的別加引號。' +
                (input.prevTail
                    ? `\n【承上】上一段收在：「${input.prevTail}」。這一段要順著那口氣接下去、有承轉，別當作全新的一天從頭起。`
                    : '') +
                // The participants' reasons for converging — lets the passage carry 前因後果.
                (input.context?.length
                    ? `\n【眾人為何到此（背景，照這個順序把這一段寫成一個有前因後果的連貫場景）】\n${input.context.join('\n')}\n` +
                      '這些是各人心裡的盤算，只作背景幫你把場面寫連貫；正文仍只寫素材裡真正發生的事，不許把某人的盤算當成已發生的情節。'
                    : '') +
                '\n【筆法】開頭與轉場要變化，別每段都用「且說」「話說」「與此同時／那廂」這類固定套語起頭或轉場——可從一個人、一個動作、一件物、一句話、或直接接上文起。同一段裡別反覆套用同一個詞或比喻。' +
                castBodyNote(input.castBodies) +
                (input.tone ? `\n底色：${input.tone}` : '') +
                '\n輸出一段純散文（不要標題、不要 JSON）。',
            messages: [{ role: 'user', content: `【${input.clock}】素材：\n${input.lines.join('\n')}` }],
            // A woven passage runs about the length of its material. The old fixed 850
            // covered ordinary ticks but TRUNCATED long register scenes (an 11-beat 床
            // scene lost its last two beats mid-sentence) — scale with input, bounded.
            maxTokens: Math.max(850, Math.min(2400, Math.round(input.lines.join('').length * 0.9))),
            temperature: 0.85,
        });
        const text = res.text?.trim();
        return text || null;
    } catch (err) {
        console.warn('[weave-tick] failed:', err instanceof Error ? err.message : err);
        return null;
    }
}

// ── Chapter-level self-check / repair (gender + logic guard over the WOVEN 回) ────
export interface ReviewChapterInput {
    /** Pinned era facts (anti-anachronism). */
    worldPremise: string;
    /** The participants whose 身/sex the woven passage must keep correct (data-driven). */
    cast: CastBody[];
    /** The already-woven 章回 prose. */
    chapter: string;
}

export interface ReviewChapterReply {
    /** The corrected prose (same events, gender/pronoun/logic repaired). */
    chapter: string;
}

/**
 * CHAPTER-LEVEL SELF-CHECK — re-reads a fully-woven 章回 and repairs hard errors the
 * per-beat reviewScene cannot see once beats are melted into prose: a 坤生 (woman)
 * called "男人", wrong-gender pronouns (他/她 flipped), obvious logic slips, and
 * anachronism against the era facts. It returns the SAME passage, same events, only
 * the errors fixed — it never rewrites the story or invents lines. GENERAL: the
 * participants' bodyFacts drive the gender check; nothing is name-cased. One cheap
 * LLM call per woven chapter; on any failure the caller keeps the original prose.
 */
export async function reviewChapter(input: ReviewChapterInput): Promise<ReviewChapterReply | null> {
    const chapter = input.chapter?.trim();
    if (!chapter) return null;
    try {
        const pronouns = input.cast
            .filter((c) => c.name)
            .map((c) => `${c.name}＝${pronounFromBody(c.bodyFact)}（${c.bodyFact ?? '身不詳'}）`)
            .join('、');
        const client = llmText.createTextClient({ kind: 'cheap' });
        const res = await client.chat({
            model: client.defaultModel,
            system:
                '你是這一段章回的校訂人。重讀整段織好的章回，只把明顯的錯處改掉，改後仍是同一段、同樣的事、' +
                '同樣的人、同樣的情節走向——不許重寫故事、不許新增或刪改情節、不許替人物添對白。要修的：' +
                '①把人物的性別寫錯（尤其把坤生／女子寫成「男人」，縱然她台上扮男、氣度英挺，她仍是女子）；' +
                '②代詞用錯（他／她張冠李戴）；' +
                '③明顯的邏輯矛盾（前後對不上、誰在誰不在弄反）；' +
                '④時代錯亂（違反下面的世道鐵則）。' +
                '沒有錯處就原樣照抄整段。只輸出改後的純散文，不要標題、不要 JSON、不要說明。',
            messages: [
                {
                    role: 'user',
                    content:
                        `【世道鐵則】${input.worldPremise}\n\n` +
                        `【在場的人（性別代詞：${pronouns || '（無）'}）】\n\n` +
                        `【要校訂的章回】\n${chapter}\n\n` +
                        '把上面這段校訂好，回同一段散文。',
                },
            ],
            maxTokens: 900,
            temperature: 0.3,
        });
        const out = res.text?.trim();
        return { chapter: out || chapter };
    } catch {
        return { chapter };
    }
}
