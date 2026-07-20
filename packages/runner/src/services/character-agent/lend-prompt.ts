/**
 * Character Agent — 告借/應借 PROMPT (pure leaf, node-clean).
 * ============================================================================
 * The pure surface of the lend decision: the input/output shapes, the two
 * prompt builders, and the reply clamp. Like `admit-prompt.ts` / `ask-prompt.ts`
 * / `rehearsal-prompt.ts`, this file has ZERO imports — no `@endless-story/llm`,
 * no `.js` specifiers — so it loads under plain `node --test` type-stripping and
 * the builders + parser stay unit-testable. `lend.ts` holds the cheap-tier LLM
 * call and re-exports this whole surface, so package/port consumers see every
 * name on `./lend.js`.
 *
 * 告借/應借: 借錢是兩造的事——錢動之前，出借的人先點頭；婉拒也是一句回答。A
 * co-present cast member is ASKED for a personal loan (the beat's `borrow`
 * command); this seat voices the LENDER's answer. The engine only READS the
 * verdict: a lend moves the money NOW and records a real 欠條 (a bill chased by
 * the daily settle); a refusal (or a null/failed reply) moves nothing — the ask
 * itself still happened on the page.
 */

export interface LendDecideInput {
    /** The lender — the one who decides. */
    lenderName: string;
    lenderRole?: string;
    /** The lender's own spendable purse, whole 圓 (floor) — the number the seat
     *  reads, never computes. */
    lenderBalanceYuan: number;
    /** 相識分寸: the borrower AS THE LENDER knows them (perceivedName from the
     *  lender's side). */
    borrowerName: string;
    borrowerRole?: string;
    /** The sum asked for, whole 圓. */
    amountYuan: number;
    /** 約定還期（幾日內還）。 */
    dueDays: number;
    /** The borrower's stated 緣故, if any. */
    memo?: string;
    /** The lender's CURRENT view of / tie toward the borrower, in the lender's
     *  own words. May be undefined — 平常來往 without a recorded feeling. */
    tieTowardBorrower?: string;
    /** 舊帳: what this borrower ALREADY owes the lender (open 欠條 total, whole
     *  圓). 0/absent = nothing outstanding. */
    existingDebtYuan?: number;
}

export interface LendDecideReply {
    /** Lend? true = hand the money over now against a dated 欠條; false = 婉拒. */
    lend: boolean;
    /** What the lender says as they agree or decline, ≤40字 — may be empty. */
    line?: string;
}

export function buildSystemPrompt(): string {
    return [
        '有人當面向你開口告借銀錢——借不借，由你。',
        '',
        '**鐵則**：',
        '1. 應借（lend=true）是把你自己的現錢即刻交到對方手上，換一紙到期要還的欠條；婉拒（lend=false）也是一句回答，不算失禮。',
        '2. 掂量的是你自己的家底、與這人的情分、開口的緣故，還有TA名下有沒有未清的舊帳——舊帳未清又來告借，尋常是要多想一想的。',
        '3. line 是你當面應下或婉拒的那一句（或無言的神色），≤40字，可空。',
        '4. 一律繁體中文（臺灣用字），不可混入簡體。',
        '',
        '**輸出**：嚴格只輸出 JSON `{"lend": true, "line": "…"}` 或 `{"lend": false, "line": "…"}`，不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: LendDecideInput): string {
    return [
        '# 你是誰',
        `- 姓名：${input.lenderName}`,
        input.lenderRole && input.lenderRole !== '—' ? `- 行當：${input.lenderRole}` : '',
        `- 你身上現有：約 ${input.lenderBalanceYuan} 圓`,
        '',
        '## 開口的人',
        `${input.borrowerName}（${input.borrowerRole ?? '—'}）當面向你告借 ${input.amountYuan} 圓，約定 ${input.dueDays} 日內還${input.memo ? `；緣故：${input.memo}` : '，沒說緣故'}。`,
        `你對此人的看法：${input.tieTowardBorrower ?? '不深，平常來往'}`,
        input.existingDebtYuan ? `此人名下已欠著你 ${input.existingDebtYuan} 圓未清。` : '',
        '',
        '借不借由你：應了，錢即刻過手、欠條記到帳上，到期照例催討；婉拒也是一句回答。(JSON)',
    ]
        .filter((line) => line !== '')
        .join('\n');
}

/** Extract the first `{…}` JSON block and clamp it to the reply shape: `lend`
 *  must be a boolean (else null — the engine then REFUSES the loan), `line`
 *  (if any) is a string truncated to 40 chars. Any parse failure → null, so a
 *  malformed reply degrades safely to a refused loan. */
export function parseLendReply(raw: string): LendDecideReply | null {
    try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return null;
        const parsed = JSON.parse(match[0]) as { lend?: unknown; line?: unknown };
        if (typeof parsed.lend !== 'boolean') return null;
        const line = typeof parsed.line === 'string' && parsed.line.trim() ? parsed.line.trim().slice(0, 40) : undefined;
        return { lend: parsed.lend, line };
    } catch {
        return null;
    }
}
