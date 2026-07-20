/**
 * Character Agent — 叩門/放行 PROMPT (pure leaf, node-clean).
 * ============================================================================
 * The pure surface of the door-answer decision: the input/output shapes, the two
 * prompt builders, and the reply clamp. Like `ask-prompt.ts` / `negotiate-prompt.ts`
 * / `rehearsal-prompt.ts`, this file has ZERO imports — no `@endless-story/llm`,
 * no `.js` specifiers — so it loads under plain `node --test` type-stripping and
 * the builders + parser stay unit-testable. `admit.ts` holds the cheap-tier LLM
 * call and re-exports this whole surface, so package/port consumers see every
 * name on `./admit.js`.
 *
 * 叩門/放行: the occupant of a private home decides, THROUGH the door, whether to
 * admit a night knocker. Consent lives with the occupant, never the visitor's
 * ardor — a shut door is also an answer. The engine only READS the verdict: an
 * admit mints a one-time 放行 (grantAccess oneTime, consumed on entry); a refusal
 * (or a null/failed reply) leaves the door shut and the knocker outside.
 */

export interface AdmitDecideInput {
    /** The occupant — the one who decides. */
    occupantName: string;
    occupantRole?: string;
    occupantGender?: string;
    /** The occupant's current body-state (乏/飢/緒) — a worn-out host answers differently. */
    occupantState?: { fatigue: number; hunger: number; mood: number };
    /** 相識分寸: the knocker AS THE OCCUPANT knows them (perceivedName from the
     *  occupant's side) — a stranger at the door at night reads as 深夜生人. */
    knockerName: string;
    knockerRole?: string;
    /** Clock label, e.g. '入夜' / '深宵'. */
    clockLabel?: string;
    /** The private home the occupant sits alone in. */
    sceneName: string;
    /** The occupant's CURRENT view of / tie toward the knocker, in the occupant's
     *  own words. May be undefined — a stranger at the door at night! */
    tieTowardKnocker?: string;
    isNight?: boolean;
}

export interface AdmitDecideReply {
    /** Open the door? true = 放行 (let them into your private space); false = keep it shut. */
    admit: boolean;
    /** What the occupant says/does through the door, ≤40字 — may be empty (a shut
     *  door needs no words). */
    line?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是深宅裡獨處的人。有人深夜來叩你的門——開不開，由你。',
        '',
        '**鐵則**：',
        '1. 放行（admit=true）是把人讓進你的私處；不開（admit=false）也是一種回答。全看你對來人的情分、此刻的身心與分寸，不是規矩替你決定。',
        '2. 不熟的深夜生人，尋常是不開的；心裡有牽掛、有虧欠、有盼著的那個人，才值得起身開門。',
        '3. line 是你隔著門說的那一句（或無言的動靜），≤40字，可空。',
        '4. 一律繁體中文（臺灣用字），不可混入簡體。',
        '',
        '**輸出**：嚴格只輸出 JSON `{"admit": true, "line": "…"}` 或 `{"admit": false, "line": "…"}`，不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: AdmitDecideInput): string {
    const state = input.occupantState
        ? `乏${input.occupantState.fatigue}／飢${input.occupantState.hunger}／緒${input.occupantState.mood}`
        : '';
    return [
        '# 你是誰',
        `- 姓名：${input.occupantName}`,
        input.occupantRole && input.occupantRole !== '—' ? `- 行當：${input.occupantRole}` : '',
        input.occupantGender ? `- 身：${input.occupantGender}` : '',
        `- 此刻：${input.clockLabel ?? '深夜'}，你獨自在「${input.sceneName}」`,
        state ? `- 你此刻的狀態：${state}` : '',
        '',
        '## 門外',
        `有人叩門——聽動靜像是${input.knockerName}（${input.knockerRole ?? '—'}）。`,
        `你對此人的看法：${input.tieTowardKnocker ?? '不熟，深夜生人'}`,
        '',
        '門開不開由你：放行是把人讓進你的私處；不開也是一種回答。(JSON)',
    ]
        .filter((line) => line !== '')
        .join('\n');
}

/** Extract the first `{…}` JSON block and clamp it to the reply shape: `admit`
 *  must be a boolean (else null — the engine then keeps the door SHUT), `line`
 *  (if any) is a string truncated to 40 chars. Any parse failure → null, so a
 *  malformed reply degrades safely to a refused door. */
export function parseAdmitReply(raw: string): AdmitDecideReply | null {
    try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return null;
        const parsed = JSON.parse(match[0]) as { admit?: unknown; line?: unknown };
        if (typeof parsed.admit !== 'boolean') return null;
        const line = typeof parsed.line === 'string' && parsed.line.trim() ? parsed.line.trim().slice(0, 40) : undefined;
        return { admit: parsed.admit, line };
    } catch {
        return null;
    }
}
