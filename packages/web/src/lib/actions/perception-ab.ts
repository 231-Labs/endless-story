'use server';

/**
 * Perception A/B — the controlled, NON-DESTRUCTIVE comparison for the perceive step.
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
import { runPlanAction, type RunPlanResult } from './plan';
import { buildTickSituations, getDirectorBeat } from './tick-phases/perceive';
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
    /** A perception-EXCLUSIVE crisis term the ON plan cited but the OFF plan didn't —
     *  the objective signal that the broadcast crisis actually moved the plan. Null when
     *  there's no beat, or the ON plan ignored it (the bug this measures). */
    crisisEcho: string | null;
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

/** Run PLAN with one retry — the cheap LLM tier occasionally 500s (transient network). */
async function planWithRetry(characterId: string, situation?: string): Promise<RunPlanResult> {
    const first = await runPlanAction(characterId, { dryRun: true, situation });
    if (first.ok && first.planText) return first;
    return runPlanAction(characterId, { dryRun: true, situation });
}

/**
 * Did the ON plan echo a fact that ONLY perception carries (the director's crisis)?
 * Returns the longest distinctive CJK substring (≥2) of the beat that appears in the
 * ON plan but NOT the OFF plan — an objective, temperature-proof signal that the
 * broadcast crisis actually moved the plan. Null if no echo.
 */
function crisisEcho(beatText: string | undefined, planOff: string, planOn: string): string | null {
    if (!beatText) return null;
    const clean = beatText.replace(/[，。、；：！？「」『』（）\s]/g, '');
    let best: string | null = null;
    for (let n = 4; n >= 2; n--) {
        for (let i = 0; i + n <= clean.length; i++) {
            const t = clean.slice(i, i + n);
            if (planOn.includes(t) && !planOff.includes(t)) {
                if (!best || t.length > best.length) best = t;
            }
        }
        if (best) break; // prefer the longest n
    }
    return best;
}

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

    const beat = getDirectorBeat(d.sagaId);

    // For each character run PLAN twice — OFF then ON — both dry-run (no MemWal write,
    // no advance), each with one retry on transient LLM error. Bounded concurrency.
    const rows = await mapPool(slice, RECALL_CONCURRENCY, async (c): Promise<PerceptionAbRow> => {
        const briefing = briefingById.get(c.id) ?? '';
        const [off, on] = await Promise.all([
            planWithRetry(c.id),
            planWithRetry(c.id, briefing || undefined),
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
            crisisEcho: crisisEcho(beat?.text, planOff, planOn),
        };
    });

    return { ok: true, sagaName, dayLabel, rows, markdown: toMarkdown(sagaName, dayLabel, rows, beat?.text) };
}

function toMarkdown(sagaName: string, dayLabel: string, rows: PerceptionAbRow[], beatText?: string): string {
    const changedN = rows.filter((r) => r.changed).length;
    const echoN = rows.filter((r) => r.crisisEcho).length;
    const head = [
        `# 感知對照（dry-run · 世界未變）· ${sagaName} · ${dayLabel}`,
        `> 同一個當前狀態，每個角色各跑一次 PLAN：感知關 vs 感知開。唯一差別＝有沒有注入「當下處境」。`,
        `> 計畫有變（含溫度雜訊）：${changedN}/${rows.length} 人。`,
        beatText
            ? `> **客觀訊號** — 廣播危機「${beatText}」被回應（感知開引用、感知關沒有）：**${echoN}/${rows.length} 人**。這條不受溫度影響：感知關拿不到危機，所以引用＝感知確實驅動了計畫。`
            : `> （目前無廣播危機；想看最乾淨的客觀訊號，先在後台廣播一句危機再按。）`,
        '',
    ];
    const body = rows.map((r) => {
        const tag = r.crisisEcho
            ? ` — ✅ 回應危機（引用「${r.crisisEcho}」）`
            : r.changed
              ? ' — 計畫有變'
              : ' — 計畫未變';
        return [
            `## ${r.name}（${r.role}）${tag}`,
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
