/**
 * Character Agent — 祈願 PROMPT (pure leaf, node-clean).
 * ============================================================================
 * The pure surface of a character's SPOKEN prayer at a temple: the input shape,
 * the two prompt builders, and the reply clamp. Like `rehearsal-prompt.ts` /
 * `ask-prompt.ts`, this file has ZERO imports — no `@endless-story/llm`, no `.js`
 * specifiers — so it loads under plain `node --test` type-stripping and the
 * builders + parser stay unit-testable. `speak-prayer.ts` holds the cheap-tier
 * LLM call and re-exports this whole surface, so package/port consumers see every
 * name on `./speak-prayer.js`.
 *
 * A prayer is a DELIBERATE SPOKEN utterance the character makes at a physical
 * temple — 角色真的來求、對神明說出口的話 — NOT an internal unspoken want. The voice
 * is first-person, in-character, addressed to 神明: 含蓄、民國語感、≤40字
 * (e.g.「城隍老爺在上，信女柳氏，只求那一紙契約莫奪了我的名字」).
 */

export interface SpeakPrayerInput {
    name: string;
    /** Public persona / bio — colours the voice. */
    persona: string;
    role?: string;
    /** The 心願 that drove this visit (the want, in the character's own words). */
    want: { desc: string; layer: string; target?: string };
    /** Part-of-day label (清晨/黃昏/…) — 廟宇 stays open late. */
    clock: string;
    /** The temple the character came to. */
    templeName: string;
    /** The 神明 addressed, when the temple names one (城隍老爺/觀音菩薩/…). */
    deity?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你替一個民國上海戲園裡的人，寫下 TA 此刻站在廟裡、對神明親口說出的一句祈願。',
        '這是 TA 真的來求、對神明說出口的話——不是心裡的獨白、不是旁白，是出聲的禱告。',
        '',
        '**鐵則**：',
        '1. 第一人稱、對神明說話的口吻（先稱神明，再說所求）；像 TA 會在香案前低聲說的話。',
        '2. 含蓄、民國語感、舊白話；不點破數字、不寫現代腔、不寫設定說明。',
        '3. 只求一件事——把 TA 心裡那樁最掛記的，化成對神明的一句所求，別鋪陳來龍去脈。',
        '4. 全句 ≤40 字，一律繁體中文（臺灣用字），不可混入簡體。',
        '5. 比喻要長自 TA 的行當與性子，別人人一套帳房話。',
        '',
        '**輸出**：嚴格只輸出 JSON `{"prayer":"…"}`，不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: SpeakPrayerInput): string {
    const addressee = input.deity ? `「${input.deity}」` : '神明';
    return [
        '# 你是誰',
        `- ${input.name}${input.role ? `（${input.role}）` : ''}：${input.persona}`,
        '',
        '# 你此刻站在哪',
        `- ${input.templeName}，${input.clock}時分，香案前。你要對 ${addressee} 說出所求。`,
        '',
        '# 你心裡最掛記的那樁（把它化成對神明的一句所求）',
        `- ${input.want.desc}${input.want.target ? `（心裡掛著${input.want.target}）` : ''}`,
        '',
        `此刻，你（${input.name}）對 ${addressee} 親口說出的一句祈願是？(JSON)`,
    ].join('\n');
}

/** Pull the spoken prayer out of the reply: prefer `{"prayer":"…"}`, else fall
 *  back to the raw text. Strip markdown / wrapping quotes / 「」, collapse
 *  whitespace, cap at 40 chars. Empty ⇒ null, so a malformed reply degrades to
 *  the engine's deterministic framing. */
export function parsePrayer(raw: string): string | null {
    let line = '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
        try {
            const parsed = JSON.parse(match[0]) as { prayer?: unknown };
            if (typeof parsed.prayer === 'string') line = parsed.prayer;
        } catch {
            line = '';
        }
    }
    if (!line) line = raw;
    line = line
        .replace(/```[a-z]*|```/gi, '')
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .replace(/^["'「『]+|["'」』]+$/g, '')
        .trim();
    if (!line) return null;
    return line.slice(0, 40);
}
