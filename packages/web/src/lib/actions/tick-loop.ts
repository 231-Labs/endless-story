'use server';

/**
 * N4 — autonomous tick loop. One press = the saga lives one tick on its own.
 *
 * This is the integrative step (docs/NARRATIVE_AGENTS.md §6): it chains the
 * pieces N1–N3 + R-era services into a single self-driving pass, in order:
 *
 *   1. ADVANCE   World tick moves (narrative time) — unless dry-run.
 *   2. PLAN      Each character updates a standing goal (MemWal plan).
 *   3. MOVE      Idle characters walk toward goals / relevant cast.
 *   4. DRAMA     Derive scarce-resource tension (deterministic).
 *   5. SOCIAL    Same-scene observe / talk / idle; writes subjective memory.
 *   6. ACT       Characters in open events play their own hand.
 *   7. PRODUCE   Each character writes a day-aware POV chapter.
 *   8. REFLECT   Periodic sleep (N2): consolidate scattered memories.
 *   9. NARRATE   Compile the objective gazette for the day.
 *
 * Sequential throughout — one admin keypair can't sign in parallel without
 * object-version conflicts on the shared StorytellerCap. Demo driver is the
 * SchedulerPanel button; a standalone CLI can call this on an interval.
 *
 * Dry-run produces POV prose only (steps that mutate chain are skipped),
 * matching the existing daily-batch "preview" semantics.
 */

import { Transaction } from '@mysten/sui/transactions';
import type { Character, ChapterProvenance } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { runPovForCharacter, anchorPovChaptersBatch } from '@/lib/chain/pov-core';
import { deriveAndCommitDramaBeat, tensionFraction } from '@/lib/chain/drama';
import { drainMemoryWarnings } from '@/lib/chain/memory';
import { fetchOnChainScenesForSaga } from '@/lib/chain/scene-read';
import { buildSagaRoster, type SagaRosterEntry } from '@/lib/chain/roster';
import { charactersApi } from '@/lib/api/index';
import { advanceTickAction, getWorldTimeSnapshot } from './world-time';
import { isShadowDead } from '@/lib/economy/saga-economy';
import { runSleepAction } from './sleep';
import { runPlanAction } from './plan';
import { compileGazetteAction } from './compile-gazette';
import { generateEventMomentAction } from './generate-event-moment';
import { after } from 'next/server';
import type {
    TickLoopInput,
    TickActResult,
    TickPovResult,
    TickPlanResult,
    TickResolveResult,
    TickMoveResult,
    TickSocialResult,
    TickAskResult,
    TickGiveResult,
    TickSettleResult,
    TickSleepResult,
    TickGazetteResult,
    TickDramaResult,
    TickStoryletResult,
    TickLoopResult,
} from './tick-loop-types';

// Re-exported so existing consumers (api/tick/route.ts, SchedulerPanel) keep importing from here.
export type {
    TickLoopInput,
    TickActResult,
    TickPovResult,
    TickPlanResult,
    TickResolveResult,
    TickMoveResult,
    TickSocialResult,
    TickAskResult,
    TickGiveResult,
    TickSettleResult,
    TickSleepResult,
    TickGazetteResult,
    TickDramaResult,
    TickStoryletResult,
    TickLoopResult,
} from './tick-loop-types';

import {
    RECALL_CONCURRENCY,
    normalizeCharacterIds,
    TickMemoryContext,
    buildRosterContextById,
    publicTagsWithRole,
    mapPool,
} from './tick-phases/support';
import {
    runMovePhase,
    applyMoveResultsToScenes,
    applyMoveResultsToRoster,
} from './tick-phases/move';
import { runSocialPhase } from './tick-phases/social';
import { runAskPhase } from './tick-phases/ask';
import { runGivePhase } from './tick-phases/give';
import { runSettlePhase } from './tick-phases/settle';
import { runActPhase } from './tick-phases/act';

/** Map the top drama tension to a readable scene-incident framing for a storylet.
 *  Deterministic — no LLM. The template id doubles as the on-chain StoryletOpened
 *  template_id; the label is the human framing fed into involved characters' POV. */
function storyletFraming(statement?: string): { templateId: string; label: string } {
    const s = statement ?? '';
    if (s.includes('頭牌') || s.includes('spotlight'))
        return { templateId: 'contention:spotlight', label: '今晚誰壓軸、誰站台心的暗潮浮上了檯面' };
    if (s.includes('唱片') || s.includes('recording') || s.includes('灌錄'))
        return { templateId: 'contention:recording', label: '首張唱片該由誰來灌，成了繞不開的話題' };
    if (s.includes('搭戲') || s.includes('partnership'))
        return { templateId: 'contention:partnership', label: '誰與誰搭戲的盤算，在這一場裡較上了勁' };
    return { templateId: 'storylet:tension', label: '一樁懸而未決的較量，在這一場裡發酵' };
}

export async function runTickLoopAction(input: TickLoopInput = {}): Promise<TickLoopResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return {
            ok: false,
            advanced: false,
            plans: [],
            moves: [],
            socials: [],
            asks: [],
            gives: [],
            acts: [],
            resolves: [],
            povs: [],
            sleeps: [],
            error: 'saga 尚未種子化',
        };
    }
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            advanced: false,
            plans: [],
            moves: [],
            socials: [],
            asks: [],
            gives: [],
            acts: [],
            resolves: [],
            povs: [],
            sleeps: [],
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    const dryRun = input.dryRun ?? false;
    drainMemoryWarnings(); // discard stale warnings from previous local dev requests
    const memoryContext = new TickMemoryContext();
    const cap = input.maxCharacters ?? 6;
    const requestedIds = normalizeCharacterIds(input.characterIds);
    const t0 = Date.now();
    const since = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
    const tlog = (m: string) => console.log(`[tick ${since()}] ${m}`);
    tlog(`◆ 開始一輪${dryRun ? '（dry-run）' : ''}`);

    // 1. ADVANCE (chain mutation — skipped on dry-run).
    let advanced = false;
    if ((input.advance ?? true) && !dryRun) {
        const adv = await advanceTickAction();
        advanced = adv.ok;
    }
    const worldTime = (await getWorldTimeSnapshot()) ?? undefined;
    const dayLabel = worldTime ? `第 ${worldTime.day} 日 · ${worldTime.partOfDay}` : '某日';
    tlog(`⏱  ${advanced ? '已推進 → ' : ''}${dayLabel}`);

    // Character roster (saga-scoped, with fallback).
    let characters: Character[] = await charactersApi.listSagaCharacters(d.sagaId).catch(() => []);
    if (characters.length === 0) {
        characters = await charactersApi.listCharacters().catch(() => []);
    }
    if (requestedIds.length > 0) {
        const byId = new Map(characters.map((c) => [c.id, c]));
        const missing = requestedIds.filter((id) => !byId.has(id));
        if (missing.length > 0) {
            const fetched = await Promise.all(
                missing.map((id) => charactersApi.getCharacter(id).catch(() => null)),
            );
            for (const c of fetched) {
                if (c && !byId.has(c.id)) {
                    characters.push(c);
                    byId.set(c.id, c);
                }
            }
        }
    }
    const nameById = new Map(characters.map((c) => [c.id, c.name]));
    // The economy shadow can mark a character dead (vitality → 0); drop them from the acting set
    // so death actually retires them from the stage (they keep their persisted state for settle).
    const alive = characters.filter((c) => !isShadowDead(d.sagaId, c.id));
    const slice =
        requestedIds.length > 0
            ? requestedIds
                  .map((id) => alive.find((c) => c.id === id))
                  .filter((c): c is Character => Boolean(c))
                  .slice(0, cap)
            : alive.slice(0, cap);
    const scenes = await fetchOnChainScenesForSaga(d.sagaId).catch(() => []);
    const roster = await buildSagaRoster(d.sagaId, { characters, scenes }).catch(
        () => [] as SagaRosterEntry[],
    );
    let activeScenes = scenes;
    let activeRoster = roster;
    let rosterById = new Map(activeRoster.map((r) => [r.id, r]));
    let roleById = new Map(activeRoster.map((r) => [r.id, r.role || '—']));
    let rosterContextById = buildRosterContextById(slice, activeRoster);
    tlog(`登場 ${slice.length} 角色：${slice.map((c) => c.name).join('、')}`);

    // 2. PLAN — each character updates its standing goal first (N6), so the
    //    fresh plan is recalled by the decide/POV steps below. PLAN does NO
    //    Sui signing (MemWal reads + writes only). Run with BOUNDED
    //    concurrency: each plan SEAL-decrypts a recall, and the shared SEAL
    //    key server / Walrus aggregator 429s under an all-at-once burst.
    const plans: TickPlanResult[] = [];
    if (input.plan ?? true) {
        tlog(`① 規劃 ${slice.length} 角色…`);
        const settled = await mapPool(slice, RECALL_CONCURRENCY, async (c) => {
            try {
                const p = await runPlanAction(c.id, {
                    dryRun,
                    rosterContext: rosterContextById.get(c.id),
                });
                tlog(`   · 規劃 ${c.name} ✓`);
                return { c, p };
            } catch (err) {
                tlog(`   · 規劃 ${c.name} ✗`);
                return {
                    c,
                    p: { ok: false, error: err instanceof Error ? err.message : String(err) },
                };
            }
        });
        for (const { c, p } of settled) {
            if (p.ok && p.planText) memoryContext.setPlan(c.id, p.planText);
            plans.push({
                characterId: c.id,
                name: c.name,
                ok: p.ok,
                longTermGoal: p.longTermGoal,
                dailyPlanHint: p.dailyPlanHint,
                hadPrevious: p.hadPrevious,
                error: p.ok ? undefined : p.error,
            });
        }
    }

    // 2.5 MOVE — idle characters walk toward their goals (autonomous
    //    movement completes the N1 action space). Batched into one PTB.
    const moves: TickMoveResult[] = [];
    if (input.move ?? true) {
        tlog(`② 自主移動…`);
        try {
            moves.push(
                ...(await runMovePhase({
                    admin,
                    sagaId: d.sagaId,
                    capId: d.storytellerCapId,
                    slice,
                    scenes: activeScenes,
                    nameById,
                    rosterById,
                    roleById,
                    memoryContext,
                    dryRun,
                })),
            );
            tlog(`   移動 ${moves.filter((m) => m.ok && m.toSceneId).length} 人${dryRun ? '（預演）' : ''}`);
            if (moves.some((m) => m.ok && m.toSceneId)) {
                activeScenes = applyMoveResultsToScenes(activeScenes, moves);
                activeRoster = applyMoveResultsToRoster(activeRoster, activeScenes, moves);
                rosterById = new Map(activeRoster.map((r) => [r.id, r]));
                roleById = new Map(activeRoster.map((r) => [r.id, r.role || '—']));
                rosterContextById = buildRosterContextById(slice, activeRoster);
            }
        } catch (err) {
            console.warn('[tick-loop] move phase failed:', err);
        }
    }

    // 2.7 DRAMA — derive each character's tension over scarce, CONTESTED
    //    on-chain resources (DR-6), and commit a self-verifying beat. The
    //    SUPPLY (who holds the slot) is on chain; the DEMAND (how badly each
    //    character aches for it) is recomputed deterministically here. The
    //    returned hints steer decide + POV toward what each character LACKS,
    //    not just what the scene offers. Dormant no-op until resource.move is
    //    deployed + resources instantiated — never blocks the tick.
    let dramaHints: Record<string, string> = {};
    let drama: TickDramaResult | undefined;
    if (slice.length > 0) {
        try {
            const r = await deriveAndCommitDramaBeat({
                sagaId: d.sagaId,
                cast: slice.map((c) => ({
                    id: c.id,
                    name: c.name,
                    tags: publicTagsWithRole(c, roleById.get(c.id)),
                })),
                signer: dryRun ? undefined : admin.signer, // dry-run = derive, don't anchor
            });
            dramaHints = r.hints;
            drama = {
                active: r.active,
                resourceCount: r.resourceCount,
                skipped: r.skipped,
                commitmentId: r.commitmentId,
                top: r.tensions.slice(0, 6).map((t) => ({
                    characterId: t.agentId,
                    name: nameById.get(t.agentId),
                    statement: t.statement,
                    tension: tensionFraction(t.value),
                })),
            };
            if (r.active) {
                tlog(
                    `②′ 張力推導：${r.resourceCount} 個爭用資源 · ${Object.keys(r.hints).length} 人有張力${r.commitmentId ? ' · 已上鏈承諾' : ''}`,
                );
            }
        } catch (err) {
            console.warn('[tick-loop] drama phase failed:', err);
        }
    }

    // 2.75 STORYLET — give the day a dramatic SPINE. When drama tension is live
    //   and a scene holds ≥2 of the cast, the director opens ONE storylet there
    //   (open_storylet → StoryletOpened), framing the top contested resource as a
    //   scene incident. This is the discrete EVENT the POV phase then anchors to,
    //   so chapters narrate "X happened today" from each angle instead of an ambient
    //   slice. Deterministic (no LLM); admin-signed so it stays serial.
    let storylet: TickStoryletResult | undefined;
    if ((input.storylet ?? true) && drama?.active && slice.length > 0) {
        const byScene = new Map<string, Character[]>();
        for (const c of slice) {
            const sid = rosterById.get(c.id)?.currentSceneId;
            if (!sid) continue;
            const arr = byScene.get(sid);
            if (arr) arr.push(c);
            else byScene.set(sid, [c]);
        }
        const busiest = [...byScene.entries()]
            .filter(([, cs]) => cs.length >= 2)
            .sort((a, b) => b[1].length - a[1].length)[0];
        if (busiest) {
            const [sid, cs] = busiest;
            const sceneName =
                rosterById.get(cs[0].id)?.currentSceneName ??
                activeScenes.find((s) => s.id === sid)?.name ??
                '戲班';
            const framing = storyletFraming(drama?.top?.[0]?.statement);
            storylet = {
                sceneId: sid,
                sceneName,
                templateId: framing.templateId,
                label: framing.label,
                characterIds: cs.map((c) => c.id),
                names: cs.map((c) => c.name),
                opened: false,
            };
            if (!dryRun) {
                try {
                    const txb = new Transaction();
                    txb.add(
                        endlessTx.director.openStorylet({
                            cap: d.storytellerCapId,
                            saga: d.sagaId,
                            templateId: framing.templateId,
                            sceneId: sid,
                            characterIds: storylet.characterIds,
                        }),
                    );
                    const res = await admin.client.signAndExecuteTransaction({
                        transaction: txb,
                        signer: admin.signer,
                        options: { showEffects: true },
                    });
                    storylet.opened = res.effects?.status?.status === 'success';
                    storylet.digest = res.digest;
                    await admin.client.waitForTransaction({ digest: res.digest }).catch(() => {});
                } catch (err) {
                    storylet.error = err instanceof Error ? err.message : String(err);
                }
            }
            tlog(
                `②‴ 開戲：${sceneName} · ${framing.label}（${storylet.names.join('、')}）` +
                    `${dryRun ? '（預演）' : storylet.opened ? ' ✓上鏈' : ' ✗'}`,
            );
        }
    }

    // 2.76 EVENT MOMENT — render the storylet's multi-character moment scene image in
    //   the BACKGROUND (img2img off each participant's anchor → faces don't drift),
    //   append as kind=4 to every participant + tag the source event tx. Never
    //   blocks the tick (after()); only on live runs where the storylet anchored.
    if ((input.eventImage ?? true) && !dryRun && storylet?.opened && storylet.characterIds.length >= 2) {
        const st = storylet;
        after(async () => {
            try {
                const r = await generateEventMomentAction({
                    characterIds: st.characterIds,
                    sceneName: st.sceneName,
                    label: st.label,
                    eventTx: st.digest,
                });
                console.log(
                    `[tick-loop] event moment (${st.templateId}): appended=${r.appended}` +
                        (r.skipped ? ` skipped=${r.skipped}` : '') +
                        (r.error ? ` error=${r.error}` : ''),
                );
            } catch (err) {
                console.warn('[tick-loop] event moment failed:', err);
            }
        });
    }

    // 2.8 SOCIAL — idle, same-scene lightweight observation / talk. This
    // writes subjective observations/relationship memories (unless dry-run),
    // which the next POV can recall without turning Director facts into
    // private feelings.
    const socials: TickSocialResult[] = [];
    if (slice.length > 0) {
        tlog(`②″ 輕量互動…`);
        try {
            socials.push(
                ...(await runSocialPhase({
                    sagaId: d.sagaId,
                    slice,
                    scenes: activeScenes,
                    rosterById,
                    roleById,
                    memoryContext,
                    dramaHints,
                    dryRun,
                })),
            );
            tlog(`   互動 ${socials.filter((s) => s.ok && s.kind !== 'idle').length} 件${dryRun ? '（預演）' : ''}`);
        } catch (err) {
            console.warn('[tick-loop] social phase failed:', err);
        }
    }

    // 2.9 GIVE — a solvent character may aid a same-scene peer in need
    // (decideAidAction; the give/no-give judgment is the LLM's). The balance
    // MOVE is deferred to the on-chain economy (D1) / settle shadow (D5); for
    // now this records the gift as relationship-tone memory + a scene line.
    // 2.85 ASK — needy characters open their mouth to ask a solvent same-scene character for
    // help (the "pull" side). The asks are handed to GIVE so the chosen giver sees an explicit
    // request; the grant is GIVE's decideAid.
    const charactersById = new Map(characters.map((c) => [c.id, c]));
    const asks: TickAskResult[] = [];
    let asksByGiver = new Map<string, import('./tick-phases/give').IncomingAsk[]>();
    if (slice.length > 0) {
        tlog(`②⁗ 求助…`);
        try {
            const askPhase = await runAskPhase({
                sagaId: d.sagaId,
                slice,
                charactersById,
                scenes: activeScenes,
                rosterById,
                roleById,
                memoryContext,
                dryRun,
            });
            asks.push(...askPhase.results);
            asksByGiver = askPhase.asksByGiver;
            tlog(`   求助 ${asks.filter((a) => a.ok && a.asked).length} 件${dryRun ? '（預演）' : ''}`);
        } catch (err) {
            console.warn('[tick-loop] ask phase failed:', err);
        }
    }

    const gives: TickGiveResult[] = [];
    if (slice.length > 0) {
        tlog(`②‴ 接濟…`);
        try {
            gives.push(
                ...(await runGivePhase({
                    sagaId: d.sagaId,
                    slice,
                    charactersById,
                    scenes: activeScenes,
                    rosterById,
                    roleById,
                    memoryContext,
                    asksByGiver,
                    dryRun,
                })),
            );
            tlog(`   接濟 ${gives.filter((g) => g.ok && g.gave).length} 件${dryRun ? '（預演）' : ''}`);
        } catch (err) {
            console.warn('[tick-loop] give phase failed:', err);
        }
    }

    // 2.95 SETTLE — advance the off-chain economy to today (treasury-funded wages → cost →
    // vitality → death) and apply this tick's ACCEPTED gifts as real transfers. This is the rail
    // the GIVE phase's deferred gifts were waiting for; the shadow persists (process-local).
    let settle: TickSettleResult | undefined;
    if (!dryRun && slice.length > 0) {
        tlog(`②⁗ 結算…`);
        try {
            settle = await runSettlePhase({
                sagaId: d.sagaId,
                characters,
                gives,
                today: worldTime?.day ?? 1,
                dryRun,
            });
            tlog(`   結算 ${settle.settledCount} 人 · 發薪 ${settle.wagesPaid} · 轉帳 ${settle.transfersApplied}${settle.dead.length ? ` · 殞 ${settle.dead.length}` : ''}`);
        } catch (err) {
            console.warn('[tick-loop] settle phase failed:', err);
        }
    }

    // 3. ACT — characters play their own hands in open events; events that
    //    everyone has acted in auto-resolve (judge). Chain mutation → serial
    //    (single StorytellerCap, no parallel signing).
    const acts: TickActResult[] = [];
    const resolves: TickResolveResult[] = [];
    if (!dryRun) {
        tlog(`③ 出牌決策 + 收尾…`);
        try {
            const phase = await runActPhase(
                admin,
                d.sagaId,
                d.storytellerCapId,
                nameById,
                input.autoResolve ?? true,
                dramaHints,
                rosterContextById,
                memoryContext,
            );
            acts.push(...phase.acts);
            resolves.push(...phase.resolves);
            tlog(`   出牌 ${acts.filter((a) => a.ok).length} · 收尾 ${resolves.filter((r) => r.ok).length}`);
        } catch (err) {
            // Non-fatal: a failed ACT phase shouldn't block POV/narrate.
            console.warn('[tick-loop] act phase failed:', err);
        }
    }

    // ── OBJECTIVE per-scene beat ledger (POV consistency) ──────────────
    // Project this tick's observable acts (talk lines, arrivals/exits, card
    // plays) onto the scene they happened in. Every same-scene character's POV
    // then receives the SAME facts, so their chapters interpret one shared
    // reality instead of independently inventing contradictory ones. Private
    // observations are excluded — those stay subjective in each MemWal.
    const beatsByScene = new Map<string, Array<{ actorId: string; text: string }>>();
    const pushBeat = (sceneId: string | undefined, actorId: string, text: string) => {
        if (!sceneId) return;
        const list = beatsByScene.get(sceneId);
        if (list) list.push({ actorId, text });
        else beatsByScene.set(sceneId, [{ actorId, text }]);
    };
    for (const m of moves) {
        if (!m.ok || !m.toSceneId) continue;
        pushBeat(m.toSceneId, m.characterId, `${m.name}自他處走了進來`);
        pushBeat(m.fromSceneId, m.characterId, `${m.name}往${m.toSceneName ?? '別處'}去了`);
    }
    for (const s of socials) {
        if (!s.ok || s.kind !== 'talk' || !s.line) continue;
        const sceneId = rosterById.get(s.characterId)?.currentSceneId;
        pushBeat(sceneId, s.characterId, `${s.name}${s.targetName ? `對${s.targetName}` : ''}說：「${s.line}」`);
    }
    for (const a of acts) {
        if (!a.ok || !a.cardLabel) continue;
        const sceneId = rosterById.get(a.characterId)?.currentSceneId;
        pushBeat(sceneId, a.characterId, `${a.name ?? '某人'}打出〔${a.cardLabel}〕${a.intent ? `（${a.intent}）` : ''}`);
    }

    const povs: TickPovResult[] = [];
    if (input.pov ?? true) {
        // 4. PRODUCE — POV chapter per character WITH A NARRATABLE BEAT this tick.
        //    Event-driven cadence: only characters in this tick's storylet or
        //    event get a chapter, so an "episode" = one event's multi-POV coverage
        //    (followable, not per-tick filler). `povAll` forces every character.
        //    Dry-run does NO chain writes → generate concurrently; a real run
        //    anchors via commitment::commit (Sui signing) → serial.
        const narratable = new Set<string>();
        if (storylet) for (const id of storylet.characterIds) narratable.add(id);
        for (const a of acts) if (a.ok) narratable.add(a.characterId);
        const povSlice = (input.povAll ?? false)
            ? slice
            : slice.filter((c) => narratable.has(c.id));
        const mapPov = (c: Character, r: Awaited<ReturnType<typeof runPovForCharacter>>): TickPovResult => ({
            characterId: c.id,
            name: c.name,
            ok: r.ok,
            anchored: r.anchored,
            skipReason: r.skipReason,
            chapter: r.chapter,
            recalledCount: r.recalledCount,
            digest: r.digest,
            error: r.error,
        });
        // Generate chapters with BOUNDED concurrency (each recalls memory →
        // SEAL decrypt; an unbounded burst 429s the key server), then — for a
        // real run — anchor them ALL IN ONE PTB (one signature). Generation is
        // the slow part (primary LLM); the anchor is now a single transaction.
        // Per-item try/catch so one bad recall (e.g. aggregator DNS blip) can't
        // reject the whole batch and kill the tick.
        tlog(
            povSlice.length === 0
                ? '④ POV 略過（本 tick 無事件牽動角色；要每人都出章用 povAll）'
                : `④ POV 生成 ${povSlice.length} 篇（事件相關角色；慢，每篇一段 LLM）…`,
        );
        const generated = await mapPool(povSlice, RECALL_CONCURRENCY, async (c) => {
            try {
                const sceneId = rosterById.get(c.id)?.currentSceneId;
                const sceneBeats = sceneId
                    ? (beatsByScene.get(sceneId) ?? [])
                          .filter((b) => b.actorId !== c.id)
                          .map((b) => b.text)
                    : [];
                // EVENT-anchored trigger: today's storylet in this character's
                // scene + their own event plays. Falls back to the ambient line.
                const triggerParts: string[] = [];
                if (storylet && storylet.sceneId === sceneId) {
                    const others = storylet.names.filter((n) => n !== c.name);
                    triggerParts.push(
                        `在${storylet.sceneName}，${storylet.label}` +
                            (others.length ? `（同場還有${others.join('、')}）` : ''),
                    );
                }
                const myTalk = socials.find(
                    (s) => s.characterId === c.id && s.kind === 'talk' && s.line,
                );
                if (myTalk) {
                    triggerParts.push(
                        `你方才${myTalk.targetName ? `對${myTalk.targetName}` : ''}說過「${myTalk.line}」`,
                    );
                }
                for (const a of acts) {
                    if (a.characterId === c.id && a.ok && a.cardLabel) {
                        triggerParts.push(`你打出了〔${a.cardLabel}〕${a.intent ? `（${a.intent}）` : ''}`);
                    }
                }
                const trigger =
                    triggerParts.length > 0
                        ? `${dayLabel} — 今日，${triggerParts.join('；')}。請從你的視角，寫此刻你身在其中的一個具體場面：你看見誰、做了什麼、最在意什麼。不要複述事件，只寫你眼中的這一刻。`
                        : `${dayLabel} — 戲班又過了一段光景。請截取這個角色在此刻的一個具體場面：身在何處、看見誰或避開誰、手上正在做什麼、眼下有什麼利害。`;
                const r = await runPovForCharacter(admin, c.id, {
                    triggerNarrative: trigger,
                    forceRun: true,
                    dryRun: true,
                    dramaHint: dramaHints[c.id],
                    sceneBeats: sceneBeats.length > 0 ? sceneBeats : undefined,
                    rosterContext: rosterContextById.get(c.id),
                    recentMemorySnippets: await memoryContext.recent(
                        c.id,
                        trigger,
                        4,
                        'pov',
                    ),
                    relationshipHints: await memoryContext.relationshipHints(c.id, 5),
                    planHint: await memoryContext.plan(c.id),
                    skipMemoryRecall: true,
                });
                tlog(`   · POV ${c.name} ✓ (${r.chapter?.length ?? 0} 字)`);
                return { c, r };
            } catch (err) {
                tlog(`   · POV ${c.name} ✗`);
                return {
                    c,
                    r: {
                        ok: false,
                        chapter: '',
                        anchored: false,
                        recalledCount: 0,
                        error: err instanceof Error ? err.message : String(err),
                    } satisfies Awaited<ReturnType<typeof runPovForCharacter>>,
                };
            }
        });
        if (dryRun) {
            for (const { c, r } of generated) povs.push(mapPov(c, r));
        } else {
            const toAnchor = generated.filter(({ r }) => r.chapter.trim());
            for (const { c, r } of generated) {
                if (!r.chapter.trim()) povs.push(mapPov(c, r)); // generation failed
            }
            if (toAnchor.length > 0) tlog(`   章回上鏈（${toAnchor.length} 篇，一個 PTB）…`);
            const batch = await anchorPovChaptersBatch(
                admin,
                d.sagaId,
                toAnchor.map(({ c, r }) => {
                    const cSceneId = rosterById.get(c.id)?.currentSceneId;
                    // The on-chain event this chapter narrates (when the storylet
                    // opened in this character's scene) — its tx digest is the proof.
                    const ev = storylet && storylet.sceneId === cSceneId ? storylet : undefined;
                    const provenance: ChapterProvenance = {
                        v: 1,
                        day: worldTime?.day,
                        sceneId: cSceneId,
                        sceneName: rosterById.get(c.id)?.currentSceneName,
                        povCharacterId: c.id,
                        ...(ev
                            ? {
                                  eventKind: 'storylet',
                                  eventTemplate: ev.templateId,
                                  eventLabel: ev.label,
                                  eventTx: ev.digest,
                                  involvedIds: ev.characterIds,
                              }
                            : {}),
                    };
                    return { characterId: c.id, chapter: r.chapter, provenance };
                }),
            );
            const byChar = new Map(batch.map((b) => [b.characterId, b]));
            for (const { c, r } of toAnchor) {
                const b = byChar.get(c.id);
                povs.push({
                    characterId: c.id,
                    name: c.name,
                    ok: b?.anchored ?? false,
                    anchored: b?.anchored ?? false,
                    chapter: r.chapter,
                    recalledCount: r.recalledCount,
                    commitmentId: b?.commitmentId,
                    digest: b?.digest,
                    error: b?.anchored ? undefined : b?.error,
                });
            }
        }
    } else {
        tlog(`④ POV 略過（pov=false）`);
    }

    // 5. REFLECT — periodic sleep / consolidation. Characters sleep at NIGHT,
    //    not every tick (Generative-Agents reflection is periodic, not per-
    //    tick — answering "should they all sleep every tick?": no). Sleep
    //    anchors via reflection::submit (Sui signing) → serial.
    const isNight = worldTime?.partOfDay === 'night';
    const sleeps: TickSleepResult[] = [];
    let sleepNote: string | undefined;
    if ((input.sleep ?? true) && !dryRun) {
        if (isNight) {
            tlog(`⑤ 睡眠整理（夜）…`);
            for (const c of slice) {
                const r = await runSleepAction(c.id);
                if (r.anchored) tlog(`   · ${c.name} 沉澱 ${r.reflections?.length ?? 0} 條`);
                sleeps.push({
                    characterId: c.id,
                    name: c.name,
                    ok: r.ok,
                    reflections: r.reflections,
                    anchored: r.anchored,
                    skipReason: r.skipReason,
                    error: r.error,
                });
            }
        } else {
            sleepNote = `非夜晚（現為 ${worldTime?.partOfDay ?? '未知'}），角色不整理記憶 — 推進到夜裡再睡`;
            tlog(`⑤ 睡眠跳過（非夜晚）`);
        }
    }

    // 6. NARRATE — compile the objective gazette for the day.
    let gazette: TickGazetteResult | undefined;
    if ((input.gazette ?? true) && !dryRun) {
        tlog(`⑥ 編公報…`);
        const g = await compileGazetteAction({ day: worldTime?.day });
        gazette = {
            ok: g.ok,
            eventCount: g.eventCount,
            chapterCount: g.chapterCount,
            anchored: g.anchored,
            skipReason: g.skipReason,
            blobId: g.blobId,
            digest: g.digest,
            error: g.error,
        };
    }

    const anyOk =
        plans.some((p) => p.ok) ||
        moves.some((m) => m.ok) ||
        socials.some((s) => s.ok && s.kind !== 'idle') ||
        acts.some((a) => a.ok) ||
        resolves.some((r) => r.ok) ||
        povs.some((p) => p.ok) ||
        sleeps.some((s) => s.ok && !s.skipReason) ||
        gazette?.ok === true;
    tlog(
        `◇ 本輪完成 — 規劃${plans.length}·移動${moves.filter((m) => m.ok && m.toSceneId).length}·互動${socials.filter((s) => s.ok && s.kind !== 'idle').length}·出牌${acts.filter((a) => a.ok).length}·章回${povs.filter((p) => p.anchored).length}·公報${gazette?.anchored ? '✓' : '—'}`,
    );
    const memoryWarnings = drainMemoryWarnings();
    return {
        ok: anyOk || (slice.length === 0),
        advanced,
        worldTime,
        plans,
        moves,
        drama,
        storylet,
        socials,
        asks,
        gives,
        settle,
        acts,
        resolves,
        povs,
        sleeps,
        sleepNote,
        gazette,
        memoryWarnings,
        memoryDegraded: memoryWarnings.length > 0,
    };
}

