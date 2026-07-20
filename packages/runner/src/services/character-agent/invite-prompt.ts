/**
 * Character Agent — 邀約 PROMPT (pure leaf, node-clean).
 * ============================================================================
 * The pure surface of the invite decision: input/output shapes, prompt builders,
 * reply clamp. Like `admit-prompt.ts`, ZERO imports — loads under plain
 * `node --test` type-stripping; `invite.ts` holds the cheap-tier LLM call and
 * re-exports this surface.
 *
 * 邀約: the REVERSE of 叩門. A character with a pressing 愛/情/虧欠 want toward
 * someone CO-PRESENT by day may hand them a word — 「今夜得空，來我處坐坐」——
 * a one-time 領入 (grantAccess oneTime) to their own private home, so the pair
 * can form tonight WITHOUT a door standing between them. Whether the word is
 * offered is the INVITER's decision (their heart, their nerve, their propriety);
 * whether it is USED tonight remains entirely the invitee's move choice. Not
 * offering is also an answer — a want can stay swallowed.
 */

export interface InviteDecideInput {
    /** The inviter — the one whose heart is pressing and whose home it is. */
    inviterName: string;
    inviterRole?: string;
    inviterGender?: string;
    /** 相識分寸: the target AS THE INVITER knows them. */
    targetName: string;
    targetRole?: string;
    /** The inviter's own live want toward the target — their OWN heart, verbatim. */
    wantDesc: string;
    /** The inviter's current view of / tie toward the target, in their own words. */
    tieTowardTarget?: string;
    /** Where the two stand right now (a shared, likely public scene). */
    sceneName: string;
    /** The inviter's own private home the word would open (for tonight, once). */
    homeName: string;
    /** Clock label, e.g. '晡時'. */
    clockLabel?: string;
}

export interface InviteDecideReply {
    /** Offer the word? true = 遞話（今夜來我處）; false = swallow it. */
    invite: boolean;
    /** The line actually said (or a beat of what was almost said), ≤40字, may be empty. */
    line?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你心裡壓著一樁對眼前人的心事。此刻同在一處——要不要遞句話，請他今夜來你處坐坐，由你。',
        '',
        '**鐵則**：',
        '1. 遞話（invite=true）是把你的私處向他敞開一夜——這句話一出口就收不回；不遞（invite=false）也是一種回答，心事可以再嚥回去。',
        '2. 看的是你的心有多壓不住、你們的情分到了哪一步、旁邊有沒有人聽著、你拉不拉得下這個臉。',
        '3. line 是你真正說出口的那一句（或話到嘴邊的半句），≤40字，可空。',
        '4. 一律繁體中文（臺灣用字），不可混入簡體。',
        '',
        '**輸出**：嚴格只輸出 JSON `{"invite": true, "line": "…"}` 或 `{"invite": false, "line": "…"}`，不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: InviteDecideInput): string {
    return [
        '# 你是誰',
        `- 姓名：${input.inviterName}`,
        input.inviterRole && input.inviterRole !== '—' ? `- 行當：${input.inviterRole}` : '',
        input.inviterGender ? `- 身：${input.inviterGender}` : '',
        `- 此刻：${input.clockLabel ?? '晡時'}，你與${input.targetName}同在「${input.sceneName}」`,
        '',
        '## 你的心事',
        `- 對${input.targetName}（${input.targetRole ?? '—'}）：${input.wantDesc}`,
        `- 你對此人的看法：${input.tieTowardTarget ?? '說不清'}`,
        '',
        `要不要遞句話，請他今夜來你處（「${input.homeName}」）坐坐？遞話是把私處敞開一夜；不遞也是一種回答。(JSON)`,
    ]
        .filter((line) => line !== '')
        .join('\n');
}

/** Extract the first `{…}` JSON block and clamp: `invite` must be a boolean
 *  (else null — the engine then swallows the word), `line` truncated to 40.
 *  Any parse failure → null: a malformed reply degrades to no invite. */
export function parseInviteReply(raw: string): InviteDecideReply | null {
    try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return null;
        const parsed = JSON.parse(match[0]) as { invite?: unknown; line?: unknown };
        if (typeof parsed.invite !== 'boolean') return null;
        const line = typeof parsed.line === 'string' && parsed.line.trim() ? parsed.line.trim().slice(0, 40) : undefined;
        return { invite: parsed.invite, line };
    } catch {
        return null;
    }
}
