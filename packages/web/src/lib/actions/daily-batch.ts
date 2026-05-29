'use server';

/**
 * Daily batch orchestrator — one "tick of life" for the saga.
 *
 * This is the Phase 2 scheduler core, driven manually by an admin button
 * (and reusable by a future standalone CLI loop). One run:
 *   1. (optional) advance the World tick — Layer-1 narrative time moves
 *   2. read the new World time → derive 第 N 日 / 時辰
 *   3. list the saga's characters (all, or subscribed-only)
 *   4. for each, generate a day/part-aware POV chapter (sequential —
 *      one admin keypair can't sign in parallel without object-version
 *      conflicts on the shared cap)
 *
 * Phase 3 will thread MemWal recall (memory tail) + remember (anchor the
 * new chapter into the character's memory store) through pov-core.
 */

import type { Character } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { runPovForCharacter } from '@/lib/chain/pov-core';
import { charactersApi, subscriptionsApi } from '@/lib/api/index';
import {
    advanceTickAction,
    getWorldTimeSnapshot,
    type WorldTimeSnapshot,
} from './world-time';

export interface DailyBatchInput {
    /** Advance one tick before generating. Default true. */
    advance?: boolean;
    /** 'all' = every character (forceRun bypasses subscriber gate);
     *  'subscribed' = only characters with ≥1 subscriber. Default 'all'. */
    mode?: 'all' | 'subscribed';
    /** Cap characters processed (LLM cost guard). Default 6. */
    maxCharacters?: number;
    /** Dry-run: produce prose but don't anchor anything. */
    dryRun?: boolean;
}

export interface DailyBatchCharResult {
    characterId: string;
    name: string;
    ok: boolean;
    anchored: boolean;
    skipReason?: string;
    commitmentId?: string;
    digest?: string;
    error?: string;
    /** Generated POV prose (shown in the panel — esp. for dry-run review). */
    chapter?: string;
    /** MemWal memories recalled into this prompt (0 when not configured). */
    recalledCount?: number;
}

export interface DailyBatchResult {
    ok: boolean;
    advanced: boolean;
    worldTime?: WorldTimeSnapshot;
    results: DailyBatchCharResult[];
    error?: string;
}

export async function runDailyBatchAction(
    input: DailyBatchInput = {},
): Promise<DailyBatchResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, advanced: false, results: [], error: 'saga 尚未種子化' };
    }

    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            advanced: false,
            results: [],
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    // 1. Advance tick (unless caller opted out or this is a dry-run —
    //    dry-runs shouldn't mutate chain state).
    let advanced = false;
    const shouldAdvance = (input.advance ?? true) && !input.dryRun;
    if (shouldAdvance) {
        const adv = await advanceTickAction();
        advanced = adv.ok;
        // Non-fatal: if advance fails we still generate for the current day.
    }

    // 2. World time → day / part-of-day.
    const worldTime = (await getWorldTimeSnapshot()) ?? undefined;
    const dayLabel = worldTime ? `第 ${worldTime.day} 日 · ${worldTime.partOfDay}` : '某日';

    // 3. Character list (saga-scoped).
    let characters: Character[] = await charactersApi
        .listSagaCharacters(d.sagaId)
        .catch(() => []);
    if (characters.length === 0) {
        // Fallback: some deployments don't tag saga on the mapper yet.
        characters = await charactersApi.listCharacters().catch(() => []);
    }

    // 4. Optional subscriber filter.
    const mode = input.mode ?? 'all';
    if (mode === 'subscribed') {
        const gated: Character[] = [];
        for (const c of characters) {
            const subs = await subscriptionsApi.listSubscribers(c.id).catch(() => []);
            if (subs.length > 0) gated.push(c);
        }
        characters = gated;
    }

    const cap = input.maxCharacters ?? 6;
    const slice = characters.slice(0, cap);

    // 5. Sequential POV generation.
    const results: DailyBatchCharResult[] = [];
    for (const c of slice) {
        const trigger = `${dayLabel} — 戲班又過了一段光景。把你此刻的心境、所見、未說出口的念頭，寫成一段獨白。`;
        const r = await runPovForCharacter(admin, c.id, {
            triggerNarrative: trigger,
            forceRun: mode === 'all',
            dryRun: input.dryRun,
        });
        results.push({
            characterId: c.id,
            name: c.name,
            ok: r.ok,
            anchored: r.anchored,
            skipReason: r.skipReason,
            commitmentId: r.commitmentId,
            digest: r.digest,
            error: r.error,
            chapter: r.chapter,
            recalledCount: r.recalledCount,
        });
    }

    return {
        ok: results.some((r) => r.ok) || results.length === 0,
        advanced,
        worldTime,
        results,
    };
}
