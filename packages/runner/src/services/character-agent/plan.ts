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
import { driftsForRole, parsePlan, sanitizePlanForRole } from './parse.js';

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
     * PERCEIVE step the loop was missing (the perceive step, Step 1).
     */
    situation?: string;
    /**
     * This character's standing FEELINGS toward co-present others — directed
     * relationship edges rendered as 「對蘇映雪:戀慕很深…」. Until now plan perceived
     * the world (situation) but never its own heart, so it could only ever scheme over
     * stakes, never over people. We state the BOND, not the deed: whether to act on it
     * (把話說開 / 疏遠 / 邀同住 …) and how is deliberately left to the LLM — the point is
     * to watch whether an open plan grows a relational move on its own, unprompted.
     */
    relationshipPressure?: string[];
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
        '1. **承接舊計畫,但大事必轉向**:若下方有「你先前的打算」,在它的基礎上微調/推進,不要無故重來。**但「當下處境」裡若有〔山雨欲來〕的危機、〔風聲〕剛發生的事、或牽動你利害的人就在同場,這就是大事——你的眼下打算/未竟之事必須正面回應它(接招、趨避、或改變部署),不能照舊當沒看見。** 越是攸關你身家性命的事(尤其班主對戲班存亡),越要在計畫裡顯出來。',
        '2. **用你的記憶與性格定目標**:目標要像「這個人」會有的執念,不是泛泛的好聽話。處境是客觀的,但「你怎麼接這個招」要從你的過往與性格長出來——同一個危機,不同的人有不同的應法。',
        '2b. **關係也是你能投入的方向,不只是達成別的事的手段**:若下方有你的「牽掛」,你大可為了某個人去調整、甚至放下手上的盤算——為她而不爭、想多與她相處、想弄清她待你的心意、想把話跟她說開,把某個人放在物事(頭牌、戲份、輸贏)之前,都是合法的目標,不是軟弱。要不要這樣、放多重,照你自己的心去權衡,別把情分一律當成搶別的東西的工具。',
        '3. 三個層次:**長期目標**(數日~數月的執念,1 句)、**眼下打算**(這一兩日要做的事,1 句)、**未竟之事**(2-3 個具體小目標)。',
        '4. 第一人稱、具體、可被行動驗證。不要心靈雞湯、不要現代詞彙。',
        '5. **身份不得漂移**:行當不是「班主」時,不得自稱班主、老板、當家的、掌事人;只能從自己的行當與眼前利害長出目標。',
        '6. **舞台中心不是管理權力**:花旦/小生/名角可以在意壓軸、戲份、搭檔、台下目光,但不能決定誰紅誰涼、敲打全班或管束新角兒。',
        '',
        '**輸出**:嚴格只輸出一個 JSON 物件,例如',
        '`{"longTermGoal":"我要在這戲班掙到一個穩當小生位","dailyPlanHint":"先設法接住當家花旦下一折的搭戲","openSubgoals":["探明那花旦今日願不願與我搭戲","別讓挑剔的老斗看出我的底"]}`',
        '（上面只是格式示範，裡頭的角色稱呼是泛指，**不可當成真有其人寫進你的規劃**；只用你材料裡實際出現的人。）',
        '不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: PlanInput): string {
    // The objective situation goes FIRST: the character perceives the world, THEN
    // reads it through memory + persona. ACTION-oriented framing (NOT the POV
    // "describe, don't rewrite" frame) — PLAN must RESPOND to this reality, especially
    // a 〔山雨欲來〕crisis or 〔風聲〕just-happened event, not treat it as fixed scenery.
    const situationBlock = input.situation
        ? '\n## 當下處境（你此刻面對的真實 — 你的打算必須回應它，不能當沒看見照舊）\n' +
          input.situation +
          '\n（用你的記憶與性格去讀它：危機怎麼接、在場的人怎麼用、爭的東西怎麼搶——但不可假裝它沒發生。）'
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
    const relBlock =
        input.relationshipPressure && input.relationshipPressure.length > 0
            ? '\n## 你心裡的牽掛（你對在場這些人的情分；它會牽動你想怎麼走，但要不要動、怎麼動，是你自己的事）\n' +
              input.relationshipPressure.map((r) => `- ${r}`).join('\n')
            : '';
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
        relBlock,
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

/** Build a structured plan from a parsed reply, defaulting empty fields. */
function toCandidate(parsed: {
    longTermGoal?: string;
    dailyPlanHint?: string;
    openSubgoals?: string[];
}): { longTermGoal: string; dailyPlanHint: string; openSubgoals: string[] } {
    return {
        longTermGoal: parsed.longTermGoal?.trim() || '活下去,在這戲班站穩腳跟',
        dailyPlanHint: parsed.dailyPlanHint?.trim() || '把眼前這場戲演好',
        openSubgoals: (parsed.openSubgoals ?? [])
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .map((s) => s.trim())
            .slice(0, 3),
    };
}

/** Corrective turn for a drifted plan — name the over-reach, keep the ambition,
 *  redirect it to what the role can actually contest, ask for a same-format rewrite. */
export function buildRepairPrompt(role: string): string {
    return [
        `你剛才的規劃越了界:你的行當是「${role}」,不是班主、老板、當家的,`,
        '卻把目標放在掌管全班、決定誰紅誰涼、敲打或管束他人這類「只有班主才有的權」上。',
        '請**保留你原本的企圖心與執念**,但改用你這個行當真正能爭的東西來表達——',
        '名角能爭壓軸、戲份、搭檔、台下的目光與名聲,能在自己的戲路上勝過同儕;',
        '但不能去管整個戲班、不能定別人的死活、不能號令新角兒。',
        '重寫這份規劃:第一人稱、具體、可被行動驗證,維持同樣的 JSON 格式,不要 markdown、不要多餘文字。',
    ].join('\n');
}

export async function updatePlan(
    input: PlanInput,
    opts?: { model?: string },
): Promise<PlanResult> {
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    const userPrompt = buildUserPrompt(input);
    const res = await llm.chat({
        model,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: userPrompt }],
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

    let candidate = toCandidate(parsed);

    // Intent over-reach is a SELF-CHECK FAILURE, not a dead end: hand the model
    // its own drifted plan back with a correction and let it rewrite IN ROLE,
    // keeping its real ambition — rather than dropping straight into a monotone
    // template. The template (sanitizePlanForRole below) is only the last resort
    // if the repaired plan STILL over-reaches. One extra cheap call, only on
    // drift (now rare after the hasAuthorityDrift tightening).
    if (driftsForRole(input.role, candidate)) {
        try {
            const repair = await llm.chat({
                model,
                system: buildSystemPrompt(),
                messages: [
                    { role: 'user', content: userPrompt },
                    { role: 'assistant', content: res.text },
                    { role: 'user', content: buildRepairPrompt(input.role) },
                ],
                maxTokens: 400,
                temperature: 0.7,
            });
            const reparsed = parsePlan(repair.text);
            if (reparsed) {
                const repaired = toCandidate(reparsed);
                // Accept the rewrite only if it actually cleared the drift;
                // otherwise let the template catch it.
                if (!driftsForRole(input.role, repaired)) candidate = repaired;
            }
        } catch (err) {
            console.warn('[plan] authority-drift repair failed, falling back to template:', err);
        }
    }

    // Last resort: only rewrites to a role template if the (possibly repaired)
    // plan still drifts; a clean plan passes through untouched.
    const plan = sanitizePlanForRole(input, candidate);
    return { ...plan, planText: formatPlanText(plan) };
}
