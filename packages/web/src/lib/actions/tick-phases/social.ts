/* ── SOCIAL phase (lightweight same-scene observation / talk) ──────────
 * Idle characters in the same scene can notice each other, speak one small
 * line, or do nothing. Successful interactions write subjective speaker /
 * target observations + optional relationship memory (unless dry-run), and
 * surface a scene line for the live handscroll.
 * Plain module (not 'use server'). */
import type { Character, Scene } from '@endless-story/shared';
import { characterAgent } from '@endless-story/runner';
import { rememberForCharacter } from '@/lib/chain/memory';
import { recordSceneLine } from '@/lib/chain/scene-lines';
import type { SagaRosterEntry } from '@/lib/chain/roster';
import type { TickSocialResult } from '../tick-loop-types';
import { RECALL_CONCURRENCY, mapPool, type TickMemoryContext } from './support';
import { fetchBusyCharacterIds } from './chain';

export async function runSocialPhase(input: {
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
