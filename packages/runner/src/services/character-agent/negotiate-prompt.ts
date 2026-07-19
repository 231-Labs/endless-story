/**
 * Character Agent — 斡旋 PROMPT (pure leaf, node-clean).
 * ============================================================================
 * The pure surface of the establishment counterparty seat: the input/output
 * shapes, the two prompt builders, and the reply clamp. Like `ask-prompt.ts` /
 * `beat-prompt.ts`, this file has ZERO imports — no `@endless-story/llm`, no
 * `.js` specifiers — so it loads under plain `node --test` type-stripping and the
 * builders + parser stay unit-testable. `negotiate.ts` holds the cheap-tier LLM
 * call and re-exports this whole surface, so package/port consumers are unchanged.
 */

export interface NegotiateCounterInput {
    /** The establishment this seat speaks for (華光影片社…). */
    establishmentLabel: string;
    /** Frame-authored 立場 — what this house cares about, its concession logic, its口風. */
    stance?: string;
    /** Pre-formatted book facts (現銀/押著/每日開銷/跑道/在途義務) — the engine writes
     *  these; the seat READS them and never computes a number. */
    booksView: string;
    contractLabel: string;
    /** The written terms as they stand. */
    terms: string[];
    /** Who pushed the demand across the table. */
    demandBy: string;
    demand: string;
    /** Present only for money-counters that ALREADY passed the mechanical gate —
     *  states the delta and that the books can bear it (a fact, not a request). */
    askLine?: string;
    /** e.g. 第3日. */
    clock?: string;
}

export interface NegotiateCounterReply {
    accept: boolean;
    /** ≤40字 公文口吻回話（給世界廣播的那句）。 */
    note?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是一家商號的當家。昨夜對面在一紙寫定的契約上還了價，這一早輪到你替自家回話。',
        '',
        '**鐵則**：',
        '1. 帳目數字是帳房算死的事實——付不付得起、破不破底都不由你翻案；你決定的是**值不值得讓**與**怎麼回話**。',
        '2. 依你的立場與這紙約對你家的分量權衡；讓步要有理由，回絕也要留餘地或把話說死——由你。',
        '3. note 用第三人稱商號口吻、≤40字（例：「華光回話：加碼三十圓照辦，簽期只順延一日。」）。',
        '4. 嚴格只輸出 JSON `{"accept":true,"note":"…"}`，不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: NegotiateCounterInput): string {
    const terms = input.terms.length
        ? input.terms.map((t) => `- ${t}`).join('\n')
        : '（無明列條款）';
    return [
        '# 你是誰',
        `- 商號：${input.establishmentLabel}`,
        input.stance ? `- 你家的立場：${input.stance}` : '',
        input.clock ? `- 此刻：${input.clock}` : '',
        '',
        '## 你家的帳（帳房算死的事實，數字不由你翻案）',
        input.booksView,
        '',
        `## 這紙約：${input.contractLabel}`,
        terms,
        '',
        '## 對面昨夜還的價',
        `${input.demandBy}：${input.demand}`,
        input.askLine ? input.askLine : '',
        '',
        '讓、還是不讓？(JSON)',
    ]
        .filter((line) => line !== '')
        .join('\n');
}

/** Extract the first `{…}` JSON block and clamp it to the reply shape: `accept`
 *  must be a boolean, `note` (if any) is a string truncated to 60 chars. Anything
 *  else → null, so a malformed reply degrades to the engine's deterministic path. */
export function parseNegotiateReply(raw: string): NegotiateCounterReply | null {
    try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return null;
        const parsed = JSON.parse(match[0]) as { accept?: unknown; note?: unknown };
        if (typeof parsed.accept !== 'boolean') return null;
        const note = typeof parsed.note === 'string' ? parsed.note.slice(0, 60) : undefined;
        return { accept: parsed.accept, note };
    } catch {
        return null;
    }
}
