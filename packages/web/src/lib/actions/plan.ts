'use server';

/**
 * N6 — character planning (NARRATIVE_AGENTS.md §2 PLAN step). Updates the
 * standing plan from memories + previous plan and stores it back to MemWal
 * (kind=plan, i=8), where the next decide/POV recalls it.
 * Orchestration: recall (MemWal) → updatePlan (runner LLM) → remember (MemWal).
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
    hadPrevious?: boolean;
    remembered?: boolean;
    /** 'unchanged' = plan identical to the stored one, so no new memory was written. */
    skipReason?: 'memory_unconfigured' | 'unchanged';
    error?: string;
}

export async function runPlanAction(
    characterId: string,
    opts?: { dryRun?: boolean; rosterContext?: string[]; situation?: string; relationshipPressure?: string[] },
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

    const [recalledRaw, currentPlanRaw] = await Promise.all([
        recallForCharacter(characterId, `${name} 目標 心事 處境 ${sagaName}`, 6),
        recallCurrentPlanText(characterId),
    ]);
    const effectiveRole = role ?? '—';
    const recalled = recalledRaw.filter((m) => !hasAuthorityRoleDrift(m, effectiveRole));
    const currentPlan = hasAuthorityRoleDrift(currentPlanRaw, effectiveRole)
        ? null
        : currentPlanRaw;
    if (recalled.length === 0 && currentPlan == null) {
        // Empty recall can mean MemWal is off OR a brand-new character — proceed either way.
    }

    let result;
    try {
        result = await characterAgent.updatePlan({
            name,
            role: effectiveRole,
            sagaName,
            dayLabel,
            recalledMemories: recalled,
            currentPlan: currentPlan ?? undefined,
            situation: opts?.situation,
            rosterContext: opts?.rosterContext,
            relationshipPressure: opts?.relationshipPressure,
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

    // Don't append an identical plan every tick — it bloats the memory store
    // without changing behaviour (plans are recalled latest-first).
    const normalize = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();
    const unchanged = currentPlanRaw != null && normalize(currentPlanRaw) === normalize(result.planText);

    const remembered = unchanged
        ? false
        : await rememberForCharacter(characterId, result.planText, {
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
        skipReason: unchanged ? 'unchanged' : remembered ? undefined : 'memory_unconfigured',
    };
}

function hasAuthorityRoleDrift(text: string | null | undefined, role: string): boolean {
    if (!text) return false;
    if (role.includes('班主')) return false;
    return /班主|老闆|老板|當家|掌事|東家/.test(text);
}
