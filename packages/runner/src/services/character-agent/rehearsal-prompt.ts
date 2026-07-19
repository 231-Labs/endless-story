/**
 * Character Agent — 班主叫排戲 PROMPT (pure leaf, node-clean).
 * ============================================================================
 * The pure surface of the troupe-leader's morning rehearsal call: the input/
 * output shapes, the two prompt builders, and the reply clamp. Like
 * `ask-prompt.ts` / `negotiate-prompt.ts`, this file has ZERO imports — no
 * `@endless-story/llm`, no `.js` specifiers — so it loads under plain
 * `node --test` type-stripping and the builders + parser stay unit-testable.
 * `rehearsal.ts` holds the cheap-tier LLM call and re-exports this whole
 * surface, so package/port consumers see every name on `./rehearsal.js`.
 *
 * The 班主 decides each daybreak whether排戲 is worth the day it costs: a called
 * rehearsal撐起 tonight's開鑼 and pushes the 新戲 forward, but it eats the白日
 * and tires the角兒. WHICH戲碼 and WHETHER to call is the leader's judgment; the
 * engine only reads the verdict (a null/failed reply → no call), pulls the troupe
 * to the venue that afternoon, and (with emergentProduction) bootstraps the play.
 */

export interface RehearsalDecideInput {
    banzhuName: string;
    role?: string;
    /** The players the 班主 can call to rehearse today. */
    troupeNames: string[];
    /** Where rehearsal happens (the performance venue / 練功房). */
    rehearsalVenue: string;
    /** Current 新戲-in-progress state, or null if none yet. */
    playSummary?: string | null;
    /** 第N日. */
    dayLabel: string;
    /** Objective pressure the 班主 weighs: tonight's 開鑼, the treasury, the deadline. */
    situation?: string;
}

export interface RehearsalDecideReply {
    /** Call rehearsal today? */
    call: boolean;
    /** Which 戲碼 (a title). Only meaningful when call=true; defaults handled by the engine. */
    title?: string;
    /** ≤30字 announcement in the 班主's own voice (人前發話), only when calling. */
    line?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是一個戲班的班主。天光才亮，全班的一日還沒動起來，這一早你得拿個主意：今日叫不叫排戲、排哪一齣。',
        '',
        '**鐵則**：',
        '1. 排戲能把今晚開鑼的戲撐起來、也能把新戲往前推，但排戲佔掉白日、累著角兒；看戲班的難處與今晚的份量決定叫不叫、排哪齣。',
        '2. line 是你當眾發的話、≤30字、班主口吻（人前發話，不是心裡的盤算）。',
        '3. 叫排戲就給一個戲碼（title）；手邊已有新戲在排，多半就排那齣。',
        '4. 一律繁體中文（臺灣用字），不可混入簡體。',
        '',
        '**輸出**：嚴格只輸出 JSON `{"call":true,"title":"…","line":"…"}` 或 `{"call":false}`，不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: RehearsalDecideInput): string {
    const players = input.troupeNames.length ? input.troupeNames.join('、') : '（今日無人可叫）';
    return [
        '# 你是誰',
        `- 班主：${input.banzhuName}`,
        input.role ? `- 行當：${input.role}` : '',
        `- 今日：${input.dayLabel}`,
        '',
        '## 你今日叫得動的角兒',
        players,
        '',
        `## 排戲的地方\n「${input.rehearsalVenue}」`,
        input.playSummary ? `\n## 手邊這齣新戲\n${input.playSummary}` : '\n## 手邊這齣新戲\n尚無新戲在排',
        input.situation ? `\n## 今日的難處\n${input.situation}` : '',
        '',
        '叫不叫排戲？排哪一齣？(JSON)',
    ]
        .filter((line) => line !== '')
        .join('\n');
}

/** Extract the first `{…}` JSON block and clamp it to the reply shape: `call`
 *  must be a boolean (else null — the engine then simply does NOT call rehearsal),
 *  `title`/`line` (if any) are strings truncated to ~40 chars. Any parse failure
 *  → null, so a malformed reply degrades safely to no rehearsal. */
export function parseRehearsalReply(raw: string): RehearsalDecideReply | null {
    try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return null;
        const parsed = JSON.parse(match[0]) as { call?: unknown; title?: unknown; line?: unknown };
        if (typeof parsed.call !== 'boolean') return null;
        const title = typeof parsed.title === 'string' ? parsed.title.slice(0, 40) : undefined;
        const line = typeof parsed.line === 'string' ? parsed.line.slice(0, 40) : undefined;
        return { call: parsed.call, title, line };
    } catch {
        return null;
    }
}
