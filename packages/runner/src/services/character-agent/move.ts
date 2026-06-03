/**
 * Character Agent — MOVE step (autonomous movement).
 *
 * Between ticks an idle character decides whether to stay or walk to another
 * scene, conditioned on its PLAN (where it's trying to get) + who/what is in
 * each reachable scene. This is the second half of the character action
 * space (docs/NARRATIVE_AGENTS.md §2): 出牌 ✅ + 移動. A character chasing
 * "搭上某位名角的搭檔位" will drift toward that character's scene.
 *
 * Pure LLM (cheap tier — per character per tick). The web action reads the
 * scenes + does the move_character tx. Output is clamped to a reachable
 * scene id, so a stray hallucination just becomes "stay".
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';

export interface MovePresentCharacter {
    id: string;
    name: string;
    role: string;
}

export interface MoveSceneOption {
    sceneId: string;
    name: string;
    description?: string;
    /** Characters currently in this scene (for social pull). */
    presentCharacters: MovePresentCharacter[];
    /** Legacy alias; callers should prefer presentCharacters. */
    presentNames?: string[];
}

export interface MoveDecideInput {
    name: string;
    role: string;
    /** Current plan text (N6) — the lever for goal-directed movement. */
    planHint?: string;
    currentSceneName: string;
    /** Scenes the character could walk to (current scene excluded). */
    options: MoveSceneOption[];
}

export interface MoveDecideResult {
    move: boolean;
    /** Target scene id — one of options[].sceneId, or undefined when staying. */
    targetSceneId?: string;
    reason?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是一個戲園角色,此刻不在戲中,可以選擇**留在原地**或**走到另一個場景**。',
        '',
        '**鐵則**:',
        '1. **用你的目標與打算決定要不要走、走去哪** —— 想搭上某人就往那人所在處去;想避開某人就遠離。',
        '2. 不是每刻都要走。沒有理由就**留下**(move=false)。無謂亂走不可信。',
        '3. 只能走到「可去的場景」清單裡的其中一個;不能發明場景。',
        '4. reason 用第一人稱、≤30 字,寫出你**為什麼**走(或留)。',
        '',
        '**輸出**:嚴格只輸出一個 JSON 物件,例如',
        '`{"move": true, "targetSceneId": "0x123…", "reason": "我得去後台找那位花旦,搭檔位不能斷"}`',
        '或 `{"move": false, "reason": "戲還沒散,我守在後台"}`。不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: MoveDecideInput): string {
    const opts = input.options
        .map((o) => {
            const present = o.presentCharacters.length > 0
                ? o.presentCharacters
                      .map((p) => `${p.name}${p.role && p.role !== '—' ? `(${p.role})` : ''}`)
                      .join('、')
                : (o.presentNames ?? []).join('、');
            const who = present ? `在場:${present}` : '無人';
            const desc = o.description ? ` —— ${o.description.slice(0, 40)}` : '';
            return `- sceneId=${o.sceneId} 「${o.name}」(${who})${desc}`;
        })
        .join('\n');
    return [
        `# 你是誰`,
        `- 姓名:${input.name}`,
        `- 行當:${input.role}`,
        `- 行當聲口:${roleHint(input.role)}`,
        input.planHint ? `\n## 你的目標與打算\n${input.planHint}` : '',
        '',
        `## 你此刻所在`,
        `「${input.currentSceneName}」`,
        '',
        `## 你可以走到的場景`,
        opts || '（無處可去）',
        '',
        '請決定留下或移動(JSON)。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

export async function decideMove(
    input: MoveDecideInput,
    opts?: { model?: string },
): Promise<MoveDecideResult> {
    if (input.options.length === 0) return { move: false, reason: '無處可去' };

    const valid = new Set(input.options.map((o) => o.sceneId));
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    const res = await llm.chat({
        model,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
        maxTokens: 200,
        temperature: 0.8,
    });

    const parsed = parseMove(res.text);
    if (!parsed || !parsed.move || !parsed.targetSceneId || !valid.has(parsed.targetSceneId)) {
        return { move: false, reason: parsed?.reason };
    }
    return { move: true, targetSceneId: parsed.targetSceneId, reason: parsed.reason };
}

function parseMove(
    raw: string,
): { move?: boolean; targetSceneId?: string; reason?: string } | null {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        const o = JSON.parse(m[0]) as {
            move?: boolean;
            targetSceneId?: string;
            reason?: string;
        };
        return o;
    } catch {
        return null;
    }
}
