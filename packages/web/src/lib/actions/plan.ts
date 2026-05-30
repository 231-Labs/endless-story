'use server';

/**
 * N6 — character planning. The character updates its standing plan
 * (long-term goal + near-term intent + open subgoals), conditioned on its
 * memories + previous plan, and stores it back to MemWal (kind=plan, i=8).
 *
 * This is the PLAN step of the character loop (NARRATIVE_AGENTS.md §2). The
 * stored plan is recalled before the next decide/POV (see character-turn +
 * pov-core), making behaviour goal-directed and coherent across ticks
 * instead of purely reactive.
 *
 * Orchestration mirrors sleep/character-turn: recall (web/MemWal) →
 * updatePlan (runner LLM) → remember (web/MemWal).
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { characterAgent } from '@endless-story/runner';
import { resolveNetwork } from '@/lib/chain/network';
import { resolveRole } from '@/lib/chain/pov-core';
import {
    recallForCharacter,
    recallCurrentPlanText,
    rememberForCharacter,
} from '@/lib/chain/memory';
import { getWorldTimeSnapshot } from './world-time';

export interface RunPlanResult {
    ok: boolean;
    longTermGoal?: string;
    dailyPlanHint?: string;
    openSubgoals?: string[];
    planText?: string;
    /** Whether a previous plan was found + evolved. */
    hadPrevious?: boolean;
    remembered?: boolean;
    skipReason?: 'memory_unconfigured';
    error?: string;
}

export async function runPlanAction(
    characterId: string,
    opts?: { dryRun?: boolean },
): Promise<RunPlanResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId) return { ok: false, error: 'saga 尚未種子化' };

    const client = makeSuiClient({ network: resolveNetwork() });

    const [charRes, sagaRes, role, worldTime] = await Promise.all([
        read.character.getCharacter(client, characterId).catch(() => null),
        read.saga.getSaga(client, d.sagaId).catch(() => null),
        resolveRole(characterId).catch(() => null),
        getWorldTimeSnapshot().catch(() => null),
    ]);
    const name =
        (charRes?.json as unknown as { profile?: { name?: string } })?.profile?.name ?? '無名';
    const sagaName = (sagaRes?.json as unknown as { name?: string })?.name ?? '戲班';
    const dayLabel = worldTime
        ? `第 ${worldTime.day} 日 · ${worldTime.partOfDay}`
        : '某日';

    // Recall: what's on her mind + her previous plan.
    const [recalled, currentPlan] = await Promise.all([
        recallForCharacter(characterId, `${name} 目標 心事 處境 ${sagaName}`, 6),
        recallCurrentPlanText(characterId),
    ]);
    // If memory isn't configured, recall returns [] + null — planning is a
    // no-op (it needs to persist + be recalled to matter).
    if (recalled.length === 0 && currentPlan == null) {
        // Still allow a first plan from persona alone, but flag if MemWal is
        // off so the panel explains why nothing persists.
        // (recall [] can also mean a brand-new character — proceed.)
    }

    let result;
    try {
        result = await characterAgent.updatePlan({
            name,
            role: role ?? '—',
            sagaName,
            dayLabel,
            recalledMemories: recalled,
            currentPlan: currentPlan ?? undefined,
        });
    } catch (err) {
        return { ok: false, error: 'plan 失敗:' + (err instanceof Error ? err.message : '') };
    }

    if (opts?.dryRun) {
        return {
            ok: true,
            longTermGoal: result.longTermGoal,
            dailyPlanHint: result.dailyPlanHint,
            openSubgoals: result.openSubgoals,
            planText: result.planText,
            hadPrevious: currentPlan != null,
            remembered: false,
        };
    }

    const remembered = await rememberForCharacter(characterId, result.planText, {
        kind: 'plan',
        importance: 8,
    });

    return {
        ok: true,
        longTermGoal: result.longTermGoal,
        dailyPlanHint: result.dailyPlanHint,
        openSubgoals: result.openSubgoals,
        planText: result.planText,
        hadPrevious: currentPlan != null,
        remembered,
        skipReason: remembered ? undefined : 'memory_unconfigured',
    };
}
