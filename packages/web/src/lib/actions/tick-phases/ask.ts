/* ── ASK phase (the "pull" side of money) ──────────────────────────────
 * Before GIVE, a same-scene character in need may lower itself to ask a solvent same-scene
 * character for help (decideAsk). Asking costs face — a proud character may stay silent, and
 * nobody asks a rival. The ask is recorded (memory + scene line) and handed to the GIVE phase,
 * which surfaces the asker to the chosen giver as an explicit request (loan-request + amount).
 * The grant itself is the GIVE phase's decideAid. Plain module. */
import type { Character, Scene } from '@endless-story/shared';
import { characterAgent } from '@endless-story/runner';
import { rememberForCharacter } from '@/lib/chain/memory';
import { recordSceneLine } from '@/lib/chain/scene-lines';
import type { SagaRosterEntry } from '@/lib/chain/roster';
import type { TickAskResult } from '../tick-loop-types';
import { RECALL_CONCURRENCY, mapPool, type TickMemoryContext } from './support';
import { fetchBusyCharacterIds } from './chain';
import { canSpare, inNeed, relationFromHints, standingOf } from './econ-helpers';
import type { IncomingAsk } from './give';

const KIND_LABEL: Record<string, string> = { loan: '求借', plea: '求濟', patronage: '求恩主' };

function plightOf(c: Character): string {
    const lvl = c.survival?.level;
    const vit = c.survival?.vitalityState;
    if (lvl === 'critical' || vit === 'failing') return '斷炊在即，撐不過幾日';
    if (lvl === 'low' || vit === 'strained') return '手頭拮据，藥錢飯錢都緊';
    return '一時周轉不靈';
}

export async function runAskPhase(input: {
    sagaId: string;
    slice: Character[];
    charactersById: Map<string, Character>;
    scenes: Scene[];
    rosterById: Map<string, SagaRosterEntry>;
    roleById: Map<string, string>;
    memoryContext: TickMemoryContext;
    dryRun: boolean;
}): Promise<{ results: TickAskResult[]; asksByGiver: Map<string, IncomingAsk[]> }> {
    const asksByGiver = new Map<string, IncomingAsk[]>();
    if (input.scenes.length === 0) return { results: [], asksByGiver };
    const busy = await fetchBusyCharacterIds(input.sagaId);
    const sceneByChar = new Map<string, Scene>();
    for (const scene of input.scenes) {
        for (const cid of scene.currentCharacterIds ?? []) sceneByChar.set(cid, scene);
    }

    // Askers: in a scene, not tied up in an open event, and visibly in need.
    const askers = input.slice.filter((c) => sceneByChar.has(c.id) && !busy.has(c.id) && inNeed(c));
    if (askers.length === 0) return { results: [], asksByGiver };

    const decided = await mapPool(askers, RECALL_CONCURRENCY, async (c): Promise<TickAskResult | null> => {
        const scene = sceneByChar.get(c.id)!;
        const candidates = (scene.currentCharacterIds ?? [])
            .filter((pid) => pid !== c.id)
            .map((pid) => input.charactersById.get(pid))
            .filter((p): p is Character => canSpare(p));
        if (candidates.length === 0) return null; // nobody same-scene can spare → no point asking

        try {
            const relationshipHints = await input.memoryContext.relationshipHints(c.id, 6);
            const roster = input.rosterById.get(c.id);
            const result = await characterAgent.decideAskAction({
                name: c.name,
                role: input.roleById.get(c.id) ?? roster?.role ?? '—',
                persona: (roster?.brief || c.description || '').slice(0, 120) || '梨園中人',
                traits: [],
                funds: Math.round(c.survival?.funds ?? 0),
                dailyCost: Math.round(c.survival?.dailyCost ?? 0),
                runwayDays: c.survival?.daysLeft ?? 999,
                vitalityState: c.survival?.vitalityState === 'dead' ? 'failing' : c.survival?.vitalityState ?? 'healthy',
                plight: plightOf(c),
                candidates: candidates.map((p) => {
                    const pr = input.rosterById.get(p.id);
                    return {
                        id: p.id,
                        name: p.name,
                        role: input.roleById.get(p.id) ?? pr?.role ?? '—',
                        relation: relationFromHints(relationshipHints, p.name),
                        personality: (pr?.brief || p.description || '').slice(0, 80) || '同班之人',
                        standing: standingOf(p),
                        recentMemory: relationshipHints.find((h) => h.includes(p.name)),
                    };
                }),
            });

            if (!result.doAsk || !result.targetId) {
                return { characterId: c.id, name: c.name, ok: true, asked: false, reason: result.reason };
            }
            const target = input.charactersById.get(result.targetId);
            const amount = result.amount ?? 0;
            const kindLabel = KIND_LABEL[result.kind ?? 'plea'] ?? '求助';
            if (!input.dryRun) {
                const tName = target?.name ?? '';
                // Narrativise: the SPOKEN line (the face-saving 名頭) + the inner
                // truth, not a bare transaction log.
                const askMem = result.line
                    ? `在「${scene.name}」，我向「${tName}」${kindLabel}${amount}兩。我說：「${result.line}」——心裡其實是：${result.reason ?? ''}`.trim()
                    : `我在「${scene.name}」向「${tName}」${kindLabel} ${amount} 兩：${result.reason ?? ''}`.trim();
                await rememberForCharacter(c.id, askMem, { kind: 'relationship', importance: 7 }).catch(
                    () => false,
                );
                const heardMem = result.line
                    ? `[求助：${c.name}] 在「${scene.name}」${kindLabel}我${amount}兩，當面說：「${result.line}」`
                    : `[求助：${c.name}] 在「${scene.name}」向我${kindLabel} ${amount} 兩`;
                await rememberForCharacter(result.targetId, heardMem, {
                    kind: 'observation',
                    importance: 6,
                }).catch(() => false);
                recordSceneLine(
                    scene.id,
                    c.id,
                    result.line ?? `向「${tName}」${kindLabel} ${amount} 兩`,
                    'social',
                );
            }
            const list = asksByGiver.get(result.targetId) ?? [];
            list.push({ askerId: c.id, amount, kind: result.kind ?? 'plea' });
            asksByGiver.set(result.targetId, list);

            return {
                characterId: c.id,
                name: c.name,
                ok: true,
                asked: true,
                targetId: result.targetId,
                targetName: target?.name,
                amount,
                kind: result.kind,
                reason: result.reason,
            };
        } catch (err) {
            return { characterId: c.id, name: c.name, ok: false, asked: false, error: err instanceof Error ? err.message : String(err) };
        }
    });

    return { results: decided.filter((r): r is TickAskResult => r != null), asksByGiver };
}
