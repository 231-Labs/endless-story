'use server';

/**
 * Perception A/B — the controlled, NON-DESTRUCTIVE comparison for docs/PERCEPTION_PLAN.md.
 *
 * Why this and not "run 5 ticks off then 5 ticks on": every real tick MUTATES shared
 * state (advance time, write plans to MemWal, move, resolve, anchor) — so sequential
 * arms run on different worlds and aren't a controlled comparison. Instead, at ONE
 * frozen live state we run the PLAN step twice per character — perception OFF vs ON —
 * in dry-run (no advance, no chain write, no MemWal write). Each character is its own
 * control; the ONLY difference is whether the objective 當下處境 was injected.
 *
 * This measures the IMMEDIATE causal effect (does perception change the plan / make it
 * cite what just happened). The multi-tick "no longer stalls" claim needs a resettable
 * devnet replay or the offline sim — see the plan §6/§8.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import type { Character } from '@endless-story/shared';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { fetchOnChainScenesForSaga } from '@/lib/chain/scene-read';
import { buildSagaRoster, type SagaRosterEntry } from '@/lib/chain/roster';
import { charactersApi } from '@/lib/api/index';
import { isShadowDead } from '@/lib/economy/saga-economy';
import { getWorldTimeSnapshot } from './world-time';
import { runPlanAction } from './plan';
import { buildTickSituations } from './tick-phases/perceive';
import { mapPool, RECALL_CONCURRENCY } from './tick-phases/support';

export interface PerceptionAbRow {
    characterId: string;
    name: string;
    role: string;
    /** the objective 當下處境 briefing (only the ON arm sees this). */
    briefing: string;
    /** PLAN text with perception OFF. */
    planOff: string;
    /** PLAN text with perception ON. */
    planOn: string;
    /** true when the two plans differ verbatim (a coarse changed/unchanged flag). */
    changed: boolean;
}

export interface PerceptionAbResult {
    ok: boolean;
    sagaName: string;
    dayLabel: string;
    rows: PerceptionAbRow[];
    /** ready-to-copy markdown block (paste it for judgement). */
    markdown: string;
    error?: string;
}

export interface PerceptionAbOptions {
    /** cap characters compared (LLM cost guard). Default 6. */
    maxCharacters?: number;
    /** exact character ids to compare, in order. */
    characterIds?: string[];
}

const norm = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

export async function runPerceptionAbAction(opts: PerceptionAbOptions = {}): Promise<PerceptionAbResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId) return blank('saga 尚未種子化');

    let client;
    try {
        client = getAdminContext().client;
    } catch {
        client = makeSuiClient({ network: resolveNetwork() });
    }
    const cap = Math.max(1, Math.min(opts.maxCharacters ?? 6, 12));
    const requestedIds = opts.characterIds ?? [];

    const [sagaRes, worldTime] = await Promise.all([
        read.saga.getSaga(client, d.sagaId).catch(() => null),
        getWorldTimeSnapshot().catch(() => null),
    ]);
    const sagaName = (sagaRes?.json as unknown as { name?: string })?.name ?? '戲班';
    const dayLabel = worldTime ? `第 ${worldTime.day} 日 · ${worldTime.partOfDay}` : '某日';

    let characters: Character[] = await charactersApi.listSagaCharacters(d.sagaId).catch(() => []);
    if (characters.length === 0) characters = await charactersApi.listCharacters().catch(() => []);
    if (characters.length === 0) return blank('讀不到角色');

    const alive = characters.filter((c) => !isShadowDead(d.sagaId, c.id));
    const slice =
        requestedIds.length > 0
            ? requestedIds.map((id) => alive.find((c) => c.id === id)).filter((c): c is Character => Boolean(c)).slice(0, cap)
            : alive.slice(0, cap);
    if (slice.length === 0) return blank('沒有可比對的在世角色');

    const scenes = await fetchOnChainScenesForSaga(d.sagaId).catch(() => []);
    const roster = await buildSagaRoster(d.sagaId, { characters, scenes }).catch(() => [] as SagaRosterEntry[]);
    const roleById = new Map(roster.map((r) => [r.id, r.role || '—']));

    // The objective 當下處境 per character at THIS frozen state (read-only).
    const briefingById = await buildTickSituations({
        client,
        packageId: d.packageId,
        sagaId: d.sagaId,
        slice,
        roster,
        roleById,
    }).catch(() => new Map<string, string>());

    // For each character run PLAN twice — OFF then ON — both dry-run (no MemWal write,
    // no advance). Bounded concurrency to respect the shared SEAL/Walrus budget.
    const rows = await mapPool(slice, RECALL_CONCURRENCY, async (c): Promise<PerceptionAbRow> => {
        const briefing = briefingById.get(c.id) ?? '';
        const [off, on] = await Promise.all([
            runPlanAction(c.id, { dryRun: true }),
            runPlanAction(c.id, { dryRun: true, situation: briefing || undefined }),
        ]);
        const planOff = off.planText ?? `（plan 失敗：${off.error ?? '—'}）`;
        const planOn = on.planText ?? `（plan 失敗：${on.error ?? '—'}）`;
        return {
            characterId: c.id,
            name: c.name,
            role: roleById.get(c.id) ?? '—',
            briefing,
            planOff,
            planOn,
            changed: norm(planOff) !== norm(planOn),
        };
    });

    return { ok: true, sagaName, dayLabel, rows, markdown: toMarkdown(sagaName, dayLabel, rows) };
}

function toMarkdown(sagaName: string, dayLabel: string, rows: PerceptionAbRow[]): string {
    const changedN = rows.filter((r) => r.changed).length;
    const head = [
        `# 感知對照（dry-run · 世界未變）· ${sagaName} · ${dayLabel}`,
        `> 同一個當前狀態，每個角色各跑一次 PLAN：感知關 vs 感知開。唯一差別＝有沒有注入「當下處境」。`,
        `> 計畫有變：${changedN}/${rows.length} 人。請判斷感知開的計畫是否「引用了感知關拿不到的事實」（剛結算的事件、同場誰、爭什麼）。`,
        '',
    ];
    const body = rows.map((r) => {
        return [
            `## ${r.name}（${r.role}）${r.changed ? ' — 計畫有變' : ' — 計畫未變'}`,
            `**當下處境（只有感知開看得到）**`,
            r.briefing.trim() ? r.briefing.trim() : '（此刻無特別處境可感知）',
            '',
            `**PLAN · 感知關**`,
            r.planOff.trim(),
            '',
            `**PLAN · 感知開**`,
            r.planOn.trim(),
            '',
            '---',
        ].join('\n');
    });
    return [...head, ...body].join('\n');
}

function blank(error: string): PerceptionAbResult {
    return { ok: false, sagaName: '戲班', dayLabel: '—', rows: [], markdown: '', error };
}
