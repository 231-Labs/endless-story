/**
 * Dream Moderator LLM — server-side gatekeeper for owner-injected dreams.
 *
 * Two jobs:
 *   1. Block content that violates world setting (modern slang, NSFW,
 *      direct OOC commands like "kill X"), or threatens the saga's
 *      integrity (admin-level meta references).
 *   2. Re-write approved content into a coherent dream FRAGMENT in
 *      the saga's voice (early-Republic vernacular + poetic imagery for spring-snow).
 *
 * The runner doesn't enforce — it just labels. Callers decide what to
 * do with reject vs approve. For demo we drop rejected dreams (no
 * chain write, no payment). Future: refund mechanic with grace period.
 */

import { text as llmText } from '@endless-story/llm';

export interface ModerateDreamInput {
    rawText: string;
    /** Character context — name + role + saga era — shapes the
     *  optimisation voice. */
    characterName: string;
    sagaName: string;
    /** Optional era / style hint (e.g. "early-Republic Shanghai opera house"). */
    eraHint?: string;
    model?: string;
}

export interface ModerateDreamResult {
    status: 'accepted' | 'rejected';
    /** Moderator-rewritten dream fragment (only set if accepted). */
    optimizedText?: string;
    /** Importance score the moderator assigned (0-10, default 8). */
    importance?: number;
    /** Why rejected (only set when rejected). */
    rejectReason?: string;
}

const SYSTEM_PROMPT = [
    '你是「夢境審稿員」。一位戲班角色的擁有者想要往他的記憶中注入一段夢境，',
    '你的工作是審核 + 改寫，讓夢境合理融入世界。',
    '',
    '**輸出格式**（純 JSON，不要 markdown fence）：',
    '{',
    '  "status": "accepted" | "rejected",',
    '  "optimizedText": "<改寫後的夢境片段，僅 accepted 時填，60-200 字>",',
    '  "importance": <0-10，默認 8>,',
    '  "rejectReason": "<僅 rejected 時填，一句話說明>"',
    '}',
    '',
    '**rejected 條件**（任一觸發即拒）：',
    '- 違反世界設定（如民初角色夢到電腦、太空船等）',
    '- 明顯 NSFW 或暴力細節',
    '- OOC 指令式語句（「讓 X 去殺 Y」「她必須愛上 Z」）',
    '- 試圖讓角色脫離戲班 / 自殺 / 違反 saga 的劇情底線',
    '',
    '**accepted 改寫規則**：',
    '- 保留原文意圖的「情緒核心」（如思念、不安、欣喜）',
    '- 用意象包裝：戲服、油彩、雪、河風、燈籠、舊照片、布鞋 等民初戲園符號',
    '- 不寫對白、不寫具體因果，夢境應該是斷裂的、感官的、詩意的',
    '- 字數 60-200 字，太短不夠分量、太長破壞夢境感',
    '- importance 大多給 8。情感強烈（如重大思念、深沉恐懼）給 9。輕薄玩鬧給 6-7',
].join('\n');

export function buildDreamModeratorSystemPrompt(): string {
    return SYSTEM_PROMPT;
}

export function buildDreamModeratorUserPrompt(input: ModerateDreamInput): string {
    return [
        `# 角色`,
        `- 姓名：${input.characterName}`,
        `- 所屬：${input.sagaName}`,
        input.eraHint ? `- 時代設定：${input.eraHint}` : '',
        '',
        `# 擁有者原文`,
        input.rawText,
        '',
        '請審核 + 改寫，輸出 JSON。',
    ]
        .filter(Boolean)
        .join('\n');
}

export async function moderateDream(input: ModerateDreamInput): Promise<ModerateDreamResult> {
    // Cheap tier — moderation doesn't need creative writing power.
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const modelId = input.model ?? llm.defaultModel;

    const response = await llm.chat({
        model: modelId,
        system: buildDreamModeratorSystemPrompt(),
        messages: [{ role: 'user', content: buildDreamModeratorUserPrompt(input) }],
        maxTokens: 800,
        temperature: 0.6,
    });

    return parseModeratorResponse(response.text);
}

function parseModeratorResponse(raw: string): ModerateDreamResult {
    const json = extractJson(raw);
    if (!json) {
        return { status: 'rejected', rejectReason: 'moderator LLM did not produce valid JSON' };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (e) {
        return {
            status: 'rejected',
            rejectReason: `moderator JSON parse failed: ${(e as Error).message}`,
        };
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return { status: 'rejected', rejectReason: 'moderator output not an object' };
    }
    const obj = parsed as Record<string, unknown>;
    const status = obj.status === 'accepted' ? 'accepted' : 'rejected';
    if (status === 'rejected') {
        return {
            status: 'rejected',
            rejectReason:
                typeof obj.rejectReason === 'string' ? obj.rejectReason : '未通過審核',
        };
    }
    const optimizedText = typeof obj.optimizedText === 'string' ? obj.optimizedText : '';
    if (!optimizedText || optimizedText.length < 30) {
        return {
            status: 'rejected',
            rejectReason: '改寫結果過短或缺失',
        };
    }
    const importance =
        typeof obj.importance === 'number' && obj.importance >= 0 && obj.importance <= 10
            ? Math.round(obj.importance)
            : 8;
    return { status: 'accepted', optimizedText, importance };
}

function extractJson(raw: string): string | null {
    const fence = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(raw);
    if (fence) return fence[1];
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    return raw.slice(first, last + 1);
}
