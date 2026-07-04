/* MOVE phase — idle characters decide whether to walk to another scene.
 * All moves go in one PTB, with a per-item fallback if the batch aborts
 * (a stale current_scene_id reverts the whole PTB). Plain module (not 'use server'). */
import type { Character, Scene } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { characterAgent } from '@endless-story/runner';
import type { AdminContext } from '@/lib/chain/admin-signer';
import { recordSceneLine } from '@/lib/chain/scene-lines';
import type { SagaRosterEntry } from '@/lib/chain/roster';
import type { TickMoveResult } from '../tick-loop-types';
import { RECALL_CONCURRENCY, mapPool, type TickMemoryContext } from './support';
import { trySend, fetchBusyCharacterIds } from './chain';

/** Project this tick's moves onto the in-memory scene snapshot so later phases
 *  see post-move positions. */
export function applyMoveResultsToScenes(scenes: Scene[], moves: TickMoveResult[]): Scene[] {
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

export function applyMoveResultsToRoster(
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

export async function runMovePhase(input: {
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
    /** characterId → attractor sceneId (rival gravity); overrides the LLM move. */
    gravityTargets?: Map<string, string>;
    /** characterId → residence/pursuit sceneId from the spatial router (§2.50).
     *  Night-only and authoritative; by day the map is empty and the LLM keeps agency. */
    routeTargets?: Map<string, string>;
    /** Pin open-event participants in place (default true). Spine mode passes
     *  false: a multi-tick contest must not freeze its cast, and acting is
     *  event-scoped so participants can act from anywhere. */
    pinBusy?: boolean;
}): Promise<TickMoveResult[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    if (input.scenes.length < 2) return [];

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

    // Open-event participants stay put unless pinBusy=false (spine mode);
    // skipping the fetch also avoids ~20 chain reads.
    const busy =
        input.pinBusy === false ? new Set<string>() : await fetchBusyCharacterIds(input.sagaId);

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

    // Decide moves with bounded concurrency (each recall SEAL-decrypts).
    const decided = await mapPool(candidates, RECALL_CONCURRENCY, async (c) => {
        try {
            const cur = sceneByChar.get(c.id)!;
            // Spatial router (§2.50): at night it owns placement; silent by day.
            if (input.routeTargets?.has(c.id)) {
                const route = input.routeTargets.get(c.id)!;
                return {
                    c,
                    fromId: cur.id,
                    dcs: (route === cur.id
                        ? { move: false, reason: '夜深，安於其所' }
                        : { move: true, targetSceneId: route, reason: '夜深了，各自歸處' }) as characterAgent.MoveDecideResult,
                };
            }
            // Rival gravity pulls a scattered contender toward the contest, but must
            // NOT hold someone already there — that hard hold froze the whole cast in
            // one room. Gravity converges the scattered; it never pins the gathered.
            const pull = input.gravityTargets?.get(c.id);
            if (pull && pull !== cur.id) {
                return {
                    c,
                    fromId: cur.id,
                    dcs: { move: true, targetSceneId: pull, reason: '冤家路窄，循著爭端走了過去' } as characterAgent.MoveDecideResult,
                };
            }
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
