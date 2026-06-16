/**
 * Character Agent — PLAN step (N6).
 *
 * Between ticks the character updates a standing plan: a long-term goal, a
 * near-term intent ("what I mean to do next"), and a few open subgoals. The
 * plan is conditioned on persona + recalled memories + the current situation
 * + the PREVIOUS plan, so goals carry across ticks and evolve instead of
 * resetting. Stored back to MemWal (kind=plan, i=8) and recalled before the
 * next decide/POV — this is what makes behaviour goal-directed and coherent
 * over time rather than purely reactive.
 *
 * Pure LLM (cheap tier — runs per character per tick). The web action does
 * the recall (memories + prior plan) + remember. See NARRATIVE_AGENTS.md §2
 * PLAN.
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';
import { parsePlan, sanitizePlanForRole } from './parse.js';

export interface PlanInput {
    name: string;
    role: string;
    sagaName: string;
    /** "day N · time-of-day" for time-grounding. */
    dayLabel: string;
    /** MemWal-recalled memories (three-factor) — what's on her mind. */
    recalledMemories: string[];
    /** The previous plan text (recalled), if any — the thing we evolve. */
    currentPlan?: string;
    /** Optional: a short line on what just happened (recent events). */
    recentSituation?: string;
    /**
     * The OBJECTIVE「當下處境」block — what this character can perceive RIGHT NOW
     * (same-scene presence, contested stakes, what just resolved). Pre-rendered +
     * perception-scoped on the web side (chain/situation-core + tick-phases/perceive).
     * Objective fact to be INTERPRETED through memory + persona, never restated — the
     * PERCEIVE step the loop was missing (docs/PERCEPTION_PLAN.md Step 1).
     */
    situation?: string;
    /** Public saga roster lines: name / role / scene. Not private memory. */
    rosterContext?: string[];
}

export interface PlanResult {
    longTermGoal: string;
    dailyPlanHint: string;
    openSubgoals: string[];
    /** Formatted block stored in MemWal + injected into prompts. */
    planText: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是一個戲園角色,此刻在心裡盤算「我想要什麼、接下來要怎麼走」。這是你的**規劃**,不是行動。',
        '',
        '**鐵則**:',
        '1. **承接舊計畫**:若下方有「你先前的打算」,就在它的基礎上微調/推進,不要每次重來。除非發生大事才轉向。',
        '2. **用你的記憶與性格定目標**:目標要像「這個人」會有的執念,不是泛泛的好聽話。',
        '3. 三個層次:**長期目標**(數日~數月的執念,1 句)、**眼下打算**(這一兩日要做的事,1 句)、**未竟之事**(2-3 個具體小目標)。',
        '4. 第一人稱、具體、可被行動驗證。不要心靈雞湯、不要現代詞彙。',
        '5. **身份不得漂移**:行當不是「班主」時,不得自稱班主、老板、當家的、掌事人;只能從自己的行當與眼前利害長出目標。',
        '6. **舞台中心不是管理權力**:花旦/小生/名角可以在意壓軸、戲份、搭檔、台下目光,但不能決定誰紅誰涼、敲打全班或管束新角兒。',
        '',
        '**輸出**:嚴格只輸出一個 JSON 物件,例如',
        '`{"longTermGoal":"我要在這戲班掙到一個穩當小生位","dailyPlanHint":"先設法接住孟雲屏下一折戲","openSubgoals":["探明孟雲屏今日願不願搭戲","別讓關北生看出我的底"]}`',
        '不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: PlanInput): string {
    // The objective situation goes FIRST: the character perceives the world, THEN
    // reads it through memory + persona. Framed「只可詮釋、不可改寫」so the plan reacts
    // to what's真實 happening this tick instead of self-replicating an old goal.
    const situationBlock = input.situation
        ? '\n## 當下處境（客觀事實 — 你此刻能感知到的人事；只可用你的記憶與性格去詮釋、不可改寫或當沒看見）\n' +
          input.situation
        : '';
    const memBlock =
        input.recalledMemories.length > 0
            ? '\n## 你心底翻起的記憶\n' +
              input.recalledMemories.map((m, i) => `${i + 1}. ${m.slice(0, 160)}`).join('\n')
            : '';
    const planBlock = input.currentPlan
        ? `\n## 你先前的打算(在此基礎上推進)\n${input.currentPlan}`
        : '';
    const sitBlock = input.recentSituation ? `\n## 近來發生\n${input.recentSituation}` : '';
    const rosterBlock =
        input.rosterContext && input.rosterContext.length > 0
            ? '\n## 同 saga 公開名冊（只作公開身份與位置，不代表你私下熟識）\n' +
              input.rosterContext.map((r) => `- ${r}`).join('\n')
            : '';
    return [
        `# 你是誰`,
        `- 姓名:${input.name}`,
        `- 行當:${input.role}`,
        `- 行當聲口:${roleHint(input.role)}`,
        `- 所屬:${input.sagaName}`,
        `- 此刻:${input.dayLabel}`,
        situationBlock,
        memBlock,
        planBlock,
        sitBlock,
        rosterBlock,
        '',
        '請輸出你此刻的規劃(JSON)。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

/** Render the structured plan into the text we store + inject into prompts. */
export function formatPlanText(p: {
    longTermGoal: string;
    dailyPlanHint: string;
    openSubgoals: string[];
}): string {
    const subgoals =
        p.openSubgoals.length > 0
            ? p.openSubgoals.map((s) => `- ${s}`).join('\n')
            : '- （暫無）';
    return [
        `[長期目標] ${p.longTermGoal}`,
        `[眼下打算] ${p.dailyPlanHint}`,
        `[未竟之事]`,
        subgoals,
    ].join('\n');
}

export async function updatePlan(
    input: PlanInput,
    opts?: { model?: string },
): Promise<PlanResult> {
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    const res = await llm.chat({
        model,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
        maxTokens: 400,
        temperature: 0.8,
    });

    const parsed = parsePlan(res.text);
    // Fall back to the prior plan (or a neutral one) when the model returns
    // nothing usable — never wipe a standing goal on a parse miss.
    if (!parsed) {
        return {
            longTermGoal: '',
            dailyPlanHint: '',
            openSubgoals: [],
            planText:
                input.currentPlan ??
                formatPlanText({
                    longTermGoal: '活下去,在這戲班站穩腳跟',
                    dailyPlanHint: '把眼前這場戲演好',
                    openSubgoals: [],
                }),
        };
    }
    const plan = sanitizePlanForRole(input, {
        longTermGoal: parsed.longTermGoal?.trim() || '活下去,在這戲班站穩腳跟',
        dailyPlanHint: parsed.dailyPlanHint?.trim() || '把眼前這場戲演好',
        openSubgoals: (parsed.openSubgoals ?? [])
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .map((s) => s.trim())
            .slice(0, 3),
    });
    return { ...plan, planText: formatPlanText(plan) };
}
