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

const MEMO_LABEL: Record<string, string> = {
    gift: '餽贈', patronage: '接濟', loan: '借貸', repay: '還情', bribe: '打點', tribute: '報恩',
};

/** A character is a plausible GIVER when its own survival is comfortable. */
function canSpare(c: Character): boolean {
    const lvl = c.survival?.level;
    return (lvl === 'healthy' || lvl === 'stable') && (c.survival?.funds ?? 0) > 0;
}

/** A character is visibly IN NEED (a candidate recipient). */
function inNeed(c: Character | undefined): boolean {
    if (!c) return false;
    const lvl = c.survival?.level;
    const vit = c.survival?.vitalityState;
    return lvl === 'low' || lvl === 'critical' || vit === 'strained' || vit === 'failing';
}

/** Coarse tie from the giver's relationship hints about a named peer (live data has
 *  tone, not the eval's typed lover/mentor). Defaults to neutral. */
function relationFromHints(hints: string[], peerName: string): 'ally' | 'neutral' | 'rival' {
    const about = hints.find((h) => h.includes(peerName));
    if (!about) return 'neutral';
    if (/仇|怨|隙|敵|爭|惡/.test(about)) return 'rival';
    if (/情|恩|盟|摯|親|愛|知己|師|義/.test(about)) return 'ally';
    return 'neutral';
}

function situationOf(c: Character): 'dire-need' | 'tight' | 'stable' {
    const lvl = c.survival?.level;
    const vit = c.survival?.vitalityState;
    if (lvl === 'critical' || vit === 'failing') return 'dire-need';
    if (lvl === 'low' || vit === 'strained') return 'tight';
    return 'stable';
}

function distressOf(c: Character): string {
    const s = c.survival;
    const days = s?.daysLeft != null && s.daysLeft < 999 ? `約撐 ${s.daysLeft} 日` : '勉力支應';
    const vit = s?.vitalityState === 'failing' ? '、氣血瀕危' : s?.vitalityState === 'strained' ? '、見疲態' : '';
    return `現銀約 ${Math.round(s?.funds ?? 0)}、${days}${vit}`;
}

export async function runGivePhase(input: {
    sagaId: string;
    slice: Character[];
    charactersById: Map<string, Character>;
    scenes: Scene[];
    rosterById: Map<string, SagaRosterEntry>;
    roleById: Map<string, string>;
    memoryContext: TickMemoryContext;
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
        const needyPeers = (scene.currentCharacterIds ?? [])
            .filter((pid) => pid !== c.id)
            .map((pid) => input.charactersById.get(pid))
            .filter((p): p is Character => inNeed(p));
        if (needyPeers.length === 0) return null; // nobody same-scene needs help → don't even ask

        try {
            const [planHint, relationshipHints] = await Promise.all([
                input.memoryContext.plan(c.id),
                input.memoryContext.relationshipHints(c.id, 6),
            ]);
            const roster = input.rosterById.get(c.id);
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
                        situation: situationOf(p),
                        distress: distressOf(p),
                        runwayDays: p.survival?.daysLeft,
                        recentMemory: about,
                    };
                }),
            });

            const gifts = (result.gifts ?? []).filter((g) => input.charactersById.has(g.recipientId));
            if (!input.dryRun) {
                for (const g of gifts) {
                    const label = MEMO_LABEL[g.memo] ?? '接濟';
                    await rememberForCharacter(
                        c.id,
                        `我在「${scene.name}」${label}了「${g.recipientName ?? ''}」${g.amount} 兩：${g.reason ?? ''}`.trim(),
                        { kind: 'relationship', importance: 8 },
                    ).catch(() => false);
                    await rememberForCharacter(
                        g.recipientId,
                        `[受贈：${c.name}] 在「${scene.name}」${label}我 ${g.amount} 兩`,
                        { kind: 'observation', importance: 6 },
                    ).catch(() => false);
                    recordSceneLine(scene.id, c.id, `${label}「${g.recipientName ?? ''}」${g.amount} 兩`, 'social');
                }
            }

            return {
                characterId: c.id,
                name: c.name,
                ok: true,
                gave: gifts.length > 0,
                gifts: gifts.map((g) => ({
                    recipientId: g.recipientId,
                    recipientName: g.recipientName,
                    amount: g.amount,
                    memo: g.memo,
                    manner: g.manner,
                    reason: g.reason,
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
