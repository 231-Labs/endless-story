// Internal phase + helper implementations for runTickLoopAction (see tick-loop.ts).
// Extracted to keep the orchestrator readable. Plain module (not 'use server').
import { Transaction } from '@mysten/sui/transactions';
import type { Character, Scene, ChapterProvenance } from '@endless-story/shared';
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
    tx as endlessTx,
} from '@endless-story/sdk';
import { characterAgent } from '@endless-story/runner';
import { getAdminContext, type AdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { runPovForCharacter, anchorPovChaptersBatch } from '@/lib/chain/pov-core';
import { deriveAndCommitDramaBeat, tensionFraction } from '@/lib/chain/drama';
import {
    drainMemoryWarnings,
    recallCurrentPlanText,
    recallForCharacter,
    rememberForCharacter,
} from '@/lib/chain/memory';
import { fetchOnChainScenesForSaga } from '@/lib/chain/scene-read';
import { recordSceneLine } from '@/lib/chain/scene-lines';
import { fetchRelationshipHints } from '@/lib/chain/relationships';
import {
    buildSagaRoster,
    rosterLines,
    type SagaRosterEntry,
} from '@/lib/chain/roster';
import { charactersApi } from '@/lib/api/index';
import {
    advanceTickAction,
    getWorldTimeSnapshot,
    type WorldTimeSnapshot,
} from './world-time';
import { runCharacterTurnAction } from './character-turn';
import { runSleepAction } from './sleep';
import { runPlanAction } from './plan';
import { compileGazetteAction } from './compile-gazette';
import { generateEventMomentAction } from './generate-event-moment';
import { after } from 'next/server';
import type {
    TickActResult,
    TickPovResult,
    TickPlanResult,
    TickResolveResult,
    TickMoveResult,
    TickSocialResult,
    TickSleepResult,
    TickGazetteResult,
    TickDramaResult,
    TickStoryletResult,
} from './tick-loop-types';

/**
 * Max characters whose memory-recall work runs at once. Default to 1 for demo:
 * SEAL key servers rate-limit quickly when one tick fans out PLAN/SOCIAL/POV
 * across the cast. Raise MEMWAL_RECALL_CONCURRENCY only after a self-hosted
 * relayer + stable SEAL config are in place.
 */
export const RECALL_CONCURRENCY = Math.max(
    1,
    Number(process.env.MEMWAL_RECALL_CONCURRENCY) || 1,
);

function normalizeCharacterIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of ids) {
        if (typeof raw !== 'string') continue;
        const id = raw.trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

class TickMemoryContext {
    private plans = new Map<string, Promise<string | null>>();
    private relationships = new Map<string, Promise<string[]>>();
    private recentMemories = new Map<string, Promise<string[]>>();

    plan(characterId: string): Promise<string | null> {
        let p = this.plans.get(characterId);
        if (!p) {
            p = recallCurrentPlanText(characterId).catch(() => null);
            this.plans.set(characterId, p);
        }
        return p;
    }

    setPlan(characterId: string, text: string | null): void {
        this.plans.set(characterId, Promise.resolve(text));
    }

    relationshipHints(characterId: string, limit = 5): Promise<string[]> {
        const key = `${characterId}:rel:${limit}`;
        let p = this.relationships.get(key);
        if (!p) {
            p = fetchRelationshipHints(characterId, limit).catch(() => [] as string[]);
            this.relationships.set(key, p);
        }
        return p;
    }

    recent(characterId: string, query: string, limit = 4, purpose = 'recent'): Promise<string[]> {
        const key = `${characterId}:${purpose}:${limit}:${query}`;
        let p = this.recentMemories.get(key);
        if (!p) {
            p = recallForCharacter(characterId, query, limit).catch(() => [] as string[]);
            this.recentMemories.set(key, p);
        }
        return p;
    }
}

function buildRosterContextById(
    slice: Character[],
    roster: SagaRosterEntry[],
): Map<string, string[]> {
    return new Map(
        slice.map((c) => [c.id, rosterLines(roster.filter((r) => r.id !== c.id), 12)]),
    );
}

function applyMoveResultsToScenes(scenes: Scene[], moves: TickMoveResult[]): Scene[] {
    const applied = moves.filter((m) => m.ok && m.fromSceneId && m.toSceneId);
    if (applied.length === 0) return scenes;
    const byId = new Map(scenes.map((scene) => [
        scene.id,
        { ...scene, currentCharacterIds: [...(scene.currentCharacterIds ?? [])] },
    ]));
    for (const move of applied) {
        const from = byId.get(move.fromSceneId as string);
        const to = byId.get(move.toSceneId as string);
        if (!from || !to) continue;
        from.currentCharacterIds = from.currentCharacterIds.filter((id) => id !== move.characterId);
        if (!to.currentCharacterIds.includes(move.characterId)) {
            to.currentCharacterIds.push(move.characterId);
        }
    }
    return scenes.map((scene) => byId.get(scene.id) ?? scene);
}

function applyMoveResultsToRoster(
    roster: SagaRosterEntry[],
    scenes: Scene[],
    moves: TickMoveResult[],
): SagaRosterEntry[] {
    const moved = new Set(moves.filter((m) => m.ok && m.toSceneId).map((m) => m.characterId));
    if (moved.size === 0) return roster;
    const sceneByChar = new Map<string, { id: string; name: string }>();
    for (const scene of scenes) {
        for (const cid of scene.currentCharacterIds ?? []) {
            sceneByChar.set(cid, { id: scene.id, name: scene.name });
        }
    }
    return roster.map((entry) => {
        if (!moved.has(entry.id)) return entry;
        const scene = sceneByChar.get(entry.id);
        return scene
            ? { ...entry, currentSceneId: scene.id, currentSceneName: scene.name }
            : entry;
    });
}

/* ── MOVE phase (autonomous movement, batched into one PTB) ────────────
 * Idle characters (not bound to an open event) decide — from their plan +
 * who's where — whether to walk to another scene. All moves go in ONE PTB
 * (move_character takes cap/saga/scenes/character by ref). Per-item fallback
 * if the batch aborts (a stale current_scene_id reverts the whole PTB).
 * The live handscroll reflects the new positions on its next poll. */
async function runMovePhase(input: {
    admin: AdminContext;
    sagaId: string;
    capId: string;
    slice: Character[];
    scenes: Scene[];
    nameById: Map<string, string>;
    rosterById: Map<string, SagaRosterEntry>;
    roleById: Map<string, string>;
    memoryContext: TickMemoryContext;
    dryRun: boolean;
}): Promise<TickMoveResult[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    if (input.scenes.length < 2) return []; // nowhere to go

    // character → current scene (from each scene's current_character_ids).
    const sceneByChar = new Map<string, Scene>();
    for (const s of input.scenes) {
        for (const cid of s.currentCharacterIds ?? []) sceneByChar.set(cid, s);
    }
    const sceneNameById = new Map(input.scenes.map((s) => [s.id, s.name]));
    const presentCharacters = (s: Scene): Array<{ id: string; name: string; role: string }> =>
        (s.currentCharacterIds ?? [])
            .map((cid) => {
                const roster = input.rosterById.get(cid);
                const name = roster?.name ?? input.nameById.get(cid);
                if (!name) return null;
                return {
                    id: cid,
                    name,
                    role: roster?.role ?? input.roleById.get(cid) ?? '—',
                };
            })
            .filter((p): p is { id: string; name: string; role: string } => p != null);

    // Characters on stage in an open event stay put.
    const busy = await fetchBusyCharacterIds(input.sagaId);

    const out: TickMoveResult[] = [];
    for (const c of input.slice) {
        const cur = sceneByChar.get(c.id);
        if (cur && busy.has(c.id)) {
            out.push({
                characterId: c.id,
                name: c.name,
                ok: true,
                fromSceneId: cur.id,
                reason: '正在 open event 中，暫不移動',
                skipped: true,
            });
        }
    }

    const candidates = input.slice.filter((c) => sceneByChar.has(c.id) && !busy.has(c.id));
    if (candidates.length === 0) return out;

    // DECIDE moves (bounded concurrency — recalls plan → SEAL).
    const decided = await mapPool(candidates, RECALL_CONCURRENCY, async (c) => {
        try {
            const cur = sceneByChar.get(c.id)!;
            const options = input.scenes
                .filter((s) => s.id !== cur.id)
                .map((s) => ({
                    sceneId: s.id,
                    name: s.name,
                    description: s.description,
                    presentCharacters: presentCharacters(s),
                }));
            const planHint = await input.memoryContext.plan(c.id);
            const dcs = await characterAgent.decideMove({
                name: c.name,
                role: input.roleById.get(c.id) ?? '—',
                planHint: planHint ?? undefined,
                currentSceneName: cur.name,
                options,
            });
            return { c, fromId: cur.id, dcs };
        } catch (err) {
            return {
                c,
                fromId: '',
                dcs: {
                    move: false,
                    reason: err instanceof Error ? err.message : String(err),
                } as characterAgent.MoveDecideResult,
            };
        }
    });

    const movers = decided.filter(
        (x) => x.dcs.move && x.dcs.targetSceneId && x.fromId && x.fromId !== x.dcs.targetSceneId,
    );
    for (const d of decided) {
        if (!movers.includes(d)) {
            out.push({
                characterId: d.c.id,
                name: d.c.name,
                ok: true,
                fromSceneId: d.fromId || undefined,
                reason: d.dcs.reason || '判斷此刻留在原處',
                skipped: true,
            });
        }
    }
    if (movers.length === 0) return out;

    const buildMove = (m: (typeof movers)[number]) =>
        endlessTx.character.moveCharacter({
            cap: input.capId,
            saga: input.sagaId,
            fromScene: m.fromId,
            toScene: m.dcs.targetSceneId as string,
            character: m.c.id,
        });

    if (input.dryRun) {
        for (const m of movers) {
            out.push({
                characterId: m.c.id,
                name: m.c.name,
                ok: true,
                fromSceneId: m.fromId,
                toSceneId: m.dcs.targetSceneId as string,
                toSceneName: sceneNameById.get(m.dcs.targetSceneId as string),
                reason: m.dcs.reason,
            });
        }
        return out;
    }

    const batch = await trySend(input.admin, (txb) => {
        for (const m of movers) txb.add(buildMove(m));
    });
    if (batch.ok) {
        for (const m of movers) {
            out.push({
                characterId: m.c.id,
                name: m.c.name,
                ok: true,
                fromSceneId: m.fromId,
                toSceneId: m.dcs.targetSceneId as string,
                toSceneName: sceneNameById.get(m.dcs.targetSceneId as string),
                reason: m.dcs.reason,
            });
            // Handscroll Step 3: the character arrives at the target voicing why.
            recordSceneLine(m.dcs.targetSceneId, m.c.id, m.dcs.reason, 'move');
        }
    } else {
        // Fallback: isolate each move (a stale scene reverts the whole PTB).
        for (const m of movers) {
            const one = await trySend(input.admin, (txb) => txb.add(buildMove(m)));
            out.push({
                characterId: m.c.id,
                name: m.c.name,
                ok: one.ok,
                fromSceneId: m.fromId,
                toSceneId: m.dcs.targetSceneId as string,
                toSceneName: sceneNameById.get(m.dcs.targetSceneId as string),
                reason: m.dcs.reason,
                error: one.ok ? undefined : one.error,
            });
            if (one.ok) recordSceneLine(m.dcs.targetSceneId, m.c.id, m.dcs.reason, 'move');
        }
    }
    return out;
}

async function runSocialPhase(input: {
    sagaId: string;
    slice: Character[];
    scenes: Scene[];
    rosterById: Map<string, SagaRosterEntry>;
    roleById: Map<string, string>;
    memoryContext: TickMemoryContext;
    dramaHints: Record<string, string>;
    dryRun: boolean;
}): Promise<TickSocialResult[]> {
    if (input.scenes.length === 0) return [];
    const busy = await fetchBusyCharacterIds(input.sagaId);
    const sceneByChar = new Map<string, Scene>();
    for (const scene of input.scenes) {
        for (const cid of scene.currentCharacterIds ?? []) sceneByChar.set(cid, scene);
    }
    const skippedBusy: TickSocialResult[] = input.slice
        .filter((c) => sceneByChar.has(c.id) && busy.has(c.id))
        .map((c) => ({
            characterId: c.id,
            name: c.name,
            ok: true,
            kind: 'idle' as const,
            reason: '正在 open event 中，SOCIAL 跳過',
        }));
    const candidates = input.slice.filter((c) => sceneByChar.has(c.id) && !busy.has(c.id));
    if (candidates.length === 0) return skippedBusy;

    const decided = await mapPool(candidates, RECALL_CONCURRENCY, async (c): Promise<TickSocialResult> => {
        const scene = sceneByChar.get(c.id);
        if (!scene) {
            return { characterId: c.id, name: c.name, ok: false, kind: 'idle', error: 'no_scene' };
        }
        const othersInScene = (scene.currentCharacterIds ?? [])
            .filter((cid) => cid !== c.id)
            .map((cid) => {
                const r = input.rosterById.get(cid);
                if (!r) return null;
                return { id: cid, name: r.name, role: r.role ?? '—' };
            })
            .filter((r): r is { id: string; name: string; role: string } => r != null);
        if (othersInScene.length === 0) {
            return {
                characterId: c.id,
                name: c.name,
                ok: true,
                kind: 'idle',
                reason: '此刻同場無人',
            };
        }

        try {
            const names = othersInScene.map((o) => o.name).join(' ');
            const [planHint, recentMemories, relationshipHints] = await Promise.all([
                input.memoryContext.plan(c.id),
                input.memoryContext.recent(
                    c.id,
                    `${scene.name} ${names} 人物印象 關係 今日觀察`,
                    4,
                    'social',
                ),
                input.memoryContext.relationshipHints(c.id, 5),
            ]);
            const raw = await characterAgent.decideSocialAction({
                name: c.name,
                role: input.roleById.get(c.id) ?? '—',
                sceneName: scene.name,
                planHint: planHint ?? undefined,
                recentMemories,
                relationshipHints,
                dramaHint: input.dramaHints[c.id],
                othersInScene,
            });
            const target = raw.targetCharacterId
                ? othersInScene.find((o) => o.id === raw.targetCharacterId)
                : undefined;
            const kind: TickSocialResult['kind'] = raw.kind === 'talk' && !target
                ? raw.observation
                    ? 'observe'
                    : 'idle'
                : raw.kind;

            if (!input.dryRun) {
                const speakerObservation = buildSpeakerObservation({
                    speakerName: c.name,
                    sceneName: scene.name,
                    kind,
                    targetName: target?.name,
                    line: raw.line,
                    observation: raw.observation,
                    reason: raw.reason,
                });
                if (speakerObservation) {
                    await rememberForCharacter(c.id, speakerObservation, {
                        kind: 'observation',
                        importance: kind === 'talk' ? 5 : 4,
                    }).catch(() => false);
                }
                if (raw.relationshipMemory) {
                    await rememberForCharacter(c.id, raw.relationshipMemory, {
                        kind: 'relationship',
                        importance: 8,
                    }).catch(() => false);
                }
                if (kind === 'talk' && target) {
                    const heard = `[聽見：${c.name}] ${raw.line ?? raw.observation ?? raw.reason ?? '向我搭了一句話'}`;
                    await rememberForCharacter(target.id, heard, {
                        kind: 'observation',
                        importance: 5,
                    }).catch(() => false);
                    recordSceneLine(scene.id, c.id, raw.line ?? raw.observation ?? raw.reason, 'social');
                } else if (kind === 'observe') {
                    recordSceneLine(scene.id, c.id, raw.observation ?? raw.reason, 'social');
                }
            }

            return {
                characterId: c.id,
                name: c.name,
                ok: true,
                kind,
                targetCharacterId: target?.id,
                targetName: target?.name,
                line: kind === 'talk' ? raw.line : undefined,
                observation: raw.observation,
                relationshipMemory: raw.relationshipMemory,
                reason: raw.reason,
            };
        } catch (err) {
            return {
                characterId: c.id,
                name: c.name,
                ok: false,
                kind: 'idle',
                error: err instanceof Error ? err.message : String(err),
            };
        }
    });
    return [...skippedBusy, ...decided];
}

function buildSpeakerObservation(input: {
    speakerName: string;
    sceneName: string;
    kind: TickSocialResult['kind'];
    targetName?: string;
    line?: string;
    observation?: string;
    reason?: string;
}): string | null {
    if (input.observation) return input.observation;
    if (input.kind === 'talk' && input.targetName && input.line) {
        return `我在「${input.sceneName}」向「${input.targetName}」搭了一句：「${input.line}」`;
    }
    if (input.kind === 'observe' && input.reason) {
        return `我在「${input.sceneName}」留意到一點：${input.reason}`;
    }
    return null;
}

function publicTagsWithRole(character: Character, role: string | undefined): string[] {
    const tags = new Set(character.publicTags?.map((t) => t.label).filter(Boolean) ?? []);
    if (role && role !== '—') tags.add(`role:${role}`);
    return [...tags];
}

async function fetchBusyCharacterIds(sagaId: string): Promise<Set<string>> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    const busy = new Set<string>();
    if (!pkg) return busy;
    const client = makeSuiClient({ network: resolveNetwork() });
    const summaries = await read.event
        .listBudgetEvents(client, pkg, { sagaId, maxEvents: 20 })
        .catch(() => []);
    for (const ev of summaries) {
        try {
            const res = await read.event.getBudgetEvent(client, ev.eventId);
            const j = res.json as unknown as {
                meta?: { status?: number | string };
                deck?: { participants?: string[] };
            };
            if (Number(j.meta?.status ?? 0) !== 0) continue;
            for (const p of j.deck?.participants ?? []) busy.add(p);
        } catch {
            /* ignore one event read */
        }
    }
    return busy;
}

/* ── ACT phase (batched into PTBs) ─────────────────────────────────────
 * For every OPEN event, characters DECIDE concurrently (bounded — decide
 * recalls memory), then:
 *   PTB-1: every submit_action in ONE transaction (one signature).
 *   PTB-2: resolve_event for every now-fully-acted event in ONE transaction.
 * Was 2N serial signs (submit + resolve per participant/event); now ≤2.
 * Already-acted participants are skipped (idempotent re-runs via status +
 * resolution.submitted_actions). */
interface EventActState {
    eventId: string;
    sceneId: string;
    participants: string[];
    acted: Set<string>;
    pending: string[]; // participant ids that still need to act (have a hand)
}

async function runActPhase(
    admin: AdminContext,
    sagaId: string,
    capId: string,
    nameById: Map<string, string>,
    autoResolve: boolean,
    dramaHints: Record<string, string> = {},
    rosterContextById: Map<string, string[]> = new Map(),
    memoryContext = new TickMemoryContext(),
): Promise<{ acts: TickActResult[]; resolves: TickResolveResult[] }> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return { acts: [], resolves: [] };
    const client = makeSuiClient({ network: resolveNetwork() });
    const summaries = await read.event
        .listBudgetEvents(client, pkg, { sagaId, maxEvents: 20 })
        .catch(() => []);

    // Gather open events + who still needs to act.
    const events: EventActState[] = [];
    for (const s of summaries) {
        let parsed;
        try {
            const res = await read.event.getBudgetEvent(client, s.eventId);
            parsed = res.json as unknown as {
                meta?: { status?: number | string; scene_id?: string };
                deck?: { participants?: string[]; hands?: Array<Array<number | string>> };
                resolution?: { submitted_actions?: Array<{ character_id?: string }> };
            };
        } catch {
            continue;
        }
        if (Number(parsed.meta?.status ?? 0) !== 0) continue; // resolved/closed
        const participants = parsed.deck?.participants ?? [];
        const hands = parsed.deck?.hands ?? [];
        if (participants.length === 0) continue;
        const acted = new Set(
            (parsed.resolution?.submitted_actions ?? [])
                .map((a) => a.character_id)
                .filter((x): x is string => typeof x === 'string'),
        );
        const pending = participants.filter(
            (p, i) => p && !acted.has(p) && (hands[i]?.length ?? 0) > 0,
        );
        events.push({
            eventId: s.eventId,
            sceneId: parsed.meta?.scene_id ?? s.sceneId,
            participants,
            acted,
            pending,
        });
    }

    // DECIDE (bounded concurrency — each decide recalls memory → SEAL).
    const tasks = events.flatMap((e) => e.pending.map((charId) => ({ e, charId })));
    const decided = await mapPool(tasks, RECALL_CONCURRENCY, async ({ e, charId }) => {
        try {
            const r = await runCharacterTurnAction(e.eventId, charId, {
                decideOnly: true,
                dramaHint: dramaHints[charId],
                rosterContext: rosterContextById.get(charId),
                recalledMemories: await memoryContext.recent(
                    charId,
                    `${e.eventId} 衝突 抉擇 出牌`,
                    4,
                    `act:${e.eventId}`,
                ),
                relationshipHints: await memoryContext.relationshipHints(charId, 5),
                planHint: await memoryContext.plan(charId),
            });
            return { e, charId, r };
        } catch (err) {
            return {
                e,
                charId,
                r: {
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                } as Awaited<ReturnType<typeof runCharacterTurnAction>>,
            };
        }
    });

    const acts: TickActResult[] = [];
    const submittable = decided.filter(
        (d) => d.r.ok && typeof d.r.cardIndex === 'number',
    );
    // Failed decisions surface immediately.
    for (const d of decided) {
        if (!d.r.ok || typeof d.r.cardIndex !== 'number') {
            acts.push({
                eventId: d.e.eventId,
                characterId: d.charId,
                name: nameById.get(d.charId),
                ok: false,
                error: d.r.error ?? 'decide failed',
            });
        }
    }

    // PTB-1: all submit_action calls in ONE signature. If the batch aborts
    // (one bad card reverts the whole PTB), fall back to per-item submits so
    // a single failure doesn't block the rest. Happy path = one tx.
    if (submittable.length > 0) {
        const batch = await trySend(admin, (txb) => {
            for (const d of submittable) {
                txb.add(
                    buildSubmitCall(capId, sagaId, d.e.eventId, d.charId, d.r.cardIndex as number),
                );
            }
        });
        if (batch.ok) {
            for (const d of submittable) {
                acts.push({
                    eventId: d.e.eventId,
                    characterId: d.charId,
                    name: nameById.get(d.charId),
                    ok: true,
                    cardLabel: d.r.cardLabel,
                    intent: d.r.intent,
                });
                d.e.acted.add(d.charId);
                // Handscroll Step 3: surface the first-person intent as a ghost quote.
                recordSceneLine(d.e.sceneId, d.charId, d.r.intent, 'act');
            }
        } else {
            // Fallback: isolate each submit (serial — only on the rare abort).
            for (const d of submittable) {
                const one = await trySend(admin, (txb) =>
                    txb.add(
                        buildSubmitCall(capId, sagaId, d.e.eventId, d.charId, d.r.cardIndex as number),
                    ),
                );
                acts.push({
                    eventId: d.e.eventId,
                    characterId: d.charId,
                    name: nameById.get(d.charId),
                    ok: one.ok,
                    cardLabel: d.r.cardLabel,
                    intent: d.r.intent,
                    error: one.ok ? undefined : one.error,
                });
                if (one.ok) {
                    d.e.acted.add(d.charId);
                    recordSceneLine(d.e.sceneId, d.charId, d.r.intent, 'act');
                }
            }
        }
    }

    // PTB-2: resolve every now-fully-acted event, one signature.
    const resolves: TickResolveResult[] = [];
    if (autoResolve) {
        const toResolve = events.filter(
            (e) => e.sceneId && e.participants.every((p) => p && e.acted.has(p)),
        );
        if (toResolve.length > 0) {
            const r = await trySend(admin, (txb) => {
                for (const e of toResolve) {
                    const outcomes = txb.add(endlessTx.event.emptyOutcomes());
                    txb.add(
                        endlessTx.event.resolveEvent({
                            cap: capId,
                            saga: sagaId,
                            budgetEvent: e.eventId,
                            scene: e.sceneId,
                            outcomes,
                        }),
                    );
                }
            });
            for (const e of toResolve) {
                resolves.push({
                    eventId: e.eventId,
                    ok: r.ok,
                    digest: r.digest,
                    error: r.ok ? undefined : r.error,
                });
            }
        }
    }

    return { acts, resolves };
}

/**
 * Build + sign + execute one PTB. `build` adds the move-calls. Returns
 * {ok,digest,error} — never throws (a thrown signer/RPC error is captured),
 * so callers can branch on ok (e.g. batch → per-item fallback).
 */
async function trySend(
    admin: AdminContext,
    build: (txb: Transaction) => void,
): Promise<{ ok: boolean; digest?: string; error?: string }> {
    try {
        const txb = new Transaction();
        build(txb);
        const res = await admin.client.signAndExecuteTransaction({
            transaction: txb,
            signer: admin.signer,
            options: { showEffects: true },
        });
        const ok = res.effects?.status?.status === 'success';
        await admin.client.waitForTransaction({ digest: res.digest }).catch(() => {});
        return { ok, digest: res.digest, error: ok ? undefined : res.effects?.status?.error };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** Build one submit_action move-call for the batch PTB. */
function buildSubmitCall(
    capId: string,
    sagaId: string,
    eventId: string,
    characterId: string,
    cardIndex: number,
) {
    return endlessTx.event.submitAction({
        cap: capId,
        saga: sagaId,
        budgetEvent: eventId,
        characterId,
        cardIndex: BigInt(cardIndex),
    });
}

/* ── concurrency pool ──────────────────────────────────────────────────
 * Run `fn` over `items` with at most `concurrency` in flight, preserving
 * input order. Used to throttle recall-heavy phases (PLAN / POV generate)
 * so the shared SEAL key server + Walrus aggregator don't 429 under an
 * all-at-once burst. `fn` must not throw — wrap per-item work in try/catch
 * (a throw rejects the pool). */
async function mapPool<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        for (;;) {
            const i = next;
            next += 1;
            if (i >= items.length) return;
            results[i] = await fn(items[i], i);
        }
    };
    const lanes = Array.from({ length: Math.min(Math.max(1, concurrency), items.length || 1) }, () =>
        worker(),
    );
    await Promise.all(lanes);
    return results;
}

export {
    normalizeCharacterIds,
    TickMemoryContext,
    buildRosterContextById,
    applyMoveResultsToScenes,
    applyMoveResultsToRoster,
    runMovePhase,
    runSocialPhase,
    publicTagsWithRole,
    runActPhase,
    mapPool,
};
