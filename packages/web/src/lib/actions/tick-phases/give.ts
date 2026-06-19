/* ── GIVE phase (character-to-character aid) ───────────────────────────
 * Between SOCIAL and ACT, a solvent character may aid a same-scene peer who
 * is visibly in need. The give/no-give JUDGMENT is the LLM's (decideAidAction),
 * shaped by the giver's standing + each peer's plight + their tie; the hard
 * guards (real peer, no overdraft) live in the runner's finalizeAid.
 *
 * The BALANCE MOVE is deferred: there is no on-chain character balance yet
 * (Part D D1 `transfer_between_characters`) nor a persisted off-chain settle
 * shadow (D5). So this phase produces the NARRATIVE + RELATIONSHIP-TONE half:
 * it records the decided gift as a giver relationship memory + a recipient
 * "received" observation + a scene line (unless dry-run). The recorded `gifts`
 * are the INTENT a future settle/transfer rail will execute.
 * Plain module (not 'use server'). */
import type { Character, Scene } from '@endless-story/shared';
import { characterAgent } from '@endless-story/runner';
import { rememberForCharacter } from '@/lib/chain/memory';
import { recordSceneLine } from '@/lib/chain/scene-lines';
import type { SagaRosterEntry } from '@/lib/chain/roster';
import type { TickGiveResult } from '../tick-loop-types';
import { RECALL_CONCURRENCY, mapPool, type TickMemoryContext } from './support';
import { fetchBusyCharacterIds } from './chain';
import { canSpare, inNeed, relationFromHints, situationOf, distressOf } from './econ-helpers';

const MEMO_LABEL: Record<string, string> = {
    gift: '餽贈', patronage: '接濟', loan: '借貸', repay: '還情', bribe: '打點', tribute: '報恩',
};

/** A character asked this giver for help (from the ASK phase). */
export interface IncomingAsk {
    askerId: string;
    amount: number;
    kind: string;
}

export async function runGivePhase(input: {
    sagaId: string;
    slice: Character[];
    charactersById: Map<string, Character>;
    scenes: Scene[];
    rosterById: Map<string, SagaRosterEntry>;
    roleById: Map<string, string>;
    memoryContext: TickMemoryContext;
    /** who asked whom this tick (from the ASK phase): giverId → the requests aimed at them. */
    asksByGiver?: Map<string, IncomingAsk[]>;
    dryRun: boolean;
}): Promise<TickGiveResult[]> {
    if (input.scenes.length === 0) return [];
    const busy = await fetchBusyCharacterIds(input.sagaId);
    const sceneByChar = new Map<string, Scene>();
    for (const scene of input.scenes) {
        for (const cid of scene.currentCharacterIds ?? []) sceneByChar.set(cid, scene);
    }

    // Givers: in a scene, not tied up in an open event, and comfortable enough to spare coin.
    const givers = input.slice.filter((c) => sceneByChar.has(c.id) && !busy.has(c.id) && canSpare(c));
    if (givers.length === 0) return [];

    const decided = await mapPool(givers, RECALL_CONCURRENCY, async (c): Promise<TickGiveResult | null> => {
        const scene = sceneByChar.get(c.id)!;
        const asks = input.asksByGiver?.get(c.id) ?? [];
        const askAmountById = new Map(asks.map((a) => [a.askerId, a.amount]));
        // Consider same-scene peers who are in need OR who explicitly asked this giver.
        const needyPeers = (scene.currentCharacterIds ?? [])
            .filter((pid) => pid !== c.id)
            .map((pid) => input.charactersById.get(pid))
            .filter((p): p is Character => !!p && (inNeed(p) || askAmountById.has(p.id)));
        if (needyPeers.length === 0) return null; // nobody same-scene needs help → don't even ask

        try {
            const [planHint, relationshipHints] = await Promise.all([
                input.memoryContext.plan(c.id),
                input.memoryContext.relationshipHints(c.id, 6),
            ]);
            const roster = input.rosterById.get(c.id);
            const relById = new Map(needyPeers.map((p) => [p.id, relationFromHints(relationshipHints, p.name)]));
            const result = await characterAgent.decideAidAction({
                name: c.name,
                role: input.roleById.get(c.id) ?? roster?.role ?? '—',
                persona: (roster?.brief || c.description || '').slice(0, 120) || '梨園中人',
                traits: [],
                funds: Math.round(c.survival?.funds ?? 0),
                dailyCost: Math.round(c.survival?.dailyCost ?? 0),
                runwayDays: c.survival?.daysLeft ?? 999,
                // AidVitality has no 'dead' state; a dead character wouldn't reach here (canSpare).
                vitalityState: c.survival?.vitalityState === 'dead' ? 'failing' : c.survival?.vitalityState ?? 'healthy',
                planHint: planHint ?? undefined,
                peers: needyPeers.map((p) => {
                    const pr = input.rosterById.get(p.id);
                    const about = relationshipHints.find((h) => h.includes(p.name));
                    return {
                        id: p.id,
                        name: p.name,
                        role: input.roleById.get(p.id) ?? pr?.role ?? '—',
                        relation: relationFromHints(relationshipHints, p.name),
                        personality: (pr?.brief || p.description || '').slice(0, 80) || '同班之人',
                        // a peer who explicitly asked is surfaced as a loan-request with the amount
                        situation: askAmountById.has(p.id) ? ('loan-request' as const) : situationOf(p),
                        distress: distressOf(p),
                        runwayDays: p.survival?.daysLeft,
                        askAmount: askAmountById.get(p.id),
                        recentMemory: about,
                    };
                }),
            });

            // Receiving is a choice (§5.2): a rival won't take charity → refuses. v1 uses the
            // coarse tie; pride/LLM-judged refusal can layer on later.
            const gifts = (result.gifts ?? [])
                .filter((g) => input.charactersById.has(g.recipientId))
                .map((g) => ({ ...g, refused: relById.get(g.recipientId) === 'rival' }));
            if (!input.dryRun) {
                for (const g of gifts) {
                    const label = MEMO_LABEL[g.memo] ?? '接濟';
                    if (g.refused) {
                        await rememberForCharacter(
                            c.id,
                            `我在「${scene.name}」要接濟「${g.recipientName ?? ''}」，卻被回絕，傷了和氣`,
                            { kind: 'relationship', importance: 7 },
                        ).catch(() => false);
                        await rememberForCharacter(
                            g.recipientId,
                            `[回絕：${c.name}] 我在「${scene.name}」回絕了他的施捨`,
                            { kind: 'relationship', importance: 7 },
                        ).catch(() => false);
                        recordSceneLine(scene.id, g.recipientId, `回絕了「${c.name}」的施捨`, 'social');
                        continue;
                    }
                    const rName = g.recipientName ?? '';
                    // Narrativise: the 名頭 said aloud + the real motive, not a ledger row.
                    const giveMem = g.line
                        ? `在「${scene.name}」，我${label}了「${rName}」${g.amount}兩。遞過去時我說：「${g.line}」——心裡其實是：${g.reason ?? ''}`.trim()
                        : `我在「${scene.name}」${label}了「${rName}」${g.amount} 兩：${g.reason ?? ''}`.trim();
                    await rememberForCharacter(c.id, giveMem, {
                        kind: 'relationship',
                        importance: 8,
                    }).catch(() => false);
                    const gotMem = g.line
                        ? `[受贈：${c.name}] 在「${scene.name}」${label}我${g.amount}兩，說是：「${g.line}」`
                        : `[受贈：${c.name}] 在「${scene.name}」${label}我 ${g.amount} 兩`;
                    await rememberForCharacter(g.recipientId, gotMem, {
                        kind: 'observation',
                        importance: 6,
                    }).catch(() => false);
                    recordSceneLine(
                        scene.id,
                        c.id,
                        g.line ?? `${label}「${rName}」${g.amount} 兩`,
                        'social',
                    );
                }
            }

            const accepted = gifts.filter((g) => !g.refused);
            return {
                characterId: c.id,
                name: c.name,
                ok: true,
                gave: accepted.length > 0,
                gifts: gifts.map((g) => ({
                    recipientId: g.recipientId,
                    recipientName: g.recipientName,
                    amount: g.amount,
                    memo: g.memo,
                    manner: g.manner,
                    reason: g.reason,
                    refused: g.refused,
                })),
                reason: result.reason,
                deferred: true,
            };
        } catch (err) {
            return {
                characterId: c.id,
                name: c.name,
                ok: false,
                gave: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    });

    return decided.filter((r): r is TickGiveResult => r != null);
}
