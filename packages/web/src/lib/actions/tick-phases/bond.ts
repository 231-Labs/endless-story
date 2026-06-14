/**
 * 養關係 — behaviour-driven bond strengthening for the tick loop.
 *
 * MECHANICAL, not a director decision: when two characters perform a concrete
 * pro-social act this tick (an ACCEPTED gift in the GIVE phase), we deepen their
 * PUBLIC relationship tie by emitting one extra `director::relationship_seed`.
 * That move only EMITS a RelationshipSeeded event (no on-chain dedup), so a
 * repeat call simply increments the pair's `count` — which is exactly the signal
 * the encounter selector reads (`pickEncounterPair` prefers higher count). The
 * result: the relationship graph grows from what characters actually DO, and
 * encounters start favouring pairs who keep choosing each other — WITHOUT giving
 * the director AI any new authoring power (it makes no decision here).
 *
 * Idempotency is deliberately NOT applied (unlike assess-relationships, where the
 * first introduction must be written once): here GROWTH is the point.
 *
 * Owned-cap (StorytellerCap) tx → callers must run this SERIALLY with the other
 * owned-cap jobs (push into the loop's `cutJobs`). One PTB seeds every pair.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { getAdminContext, withAdminLock } from '@/lib/chain/admin-signer';

export interface BondPair {
    aId: string;
    bId: string;
    /** Scene the bonding act happened in (relationship_seed needs a scene). */
    sceneId: string;
    /** Relationship tone to deepen toward (a gift reads as warmth → 親近). */
    tone: string;
}

export interface SeedBondResult {
    ok: boolean;
    seeded: number;
    digest?: string;
    error?: string;
}

/** Emit one extra relationship_seed per pair in a single PTB (one signature). */
export async function seedBondTies(pairs: BondPair[]): Promise<SeedBondResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.packageId || !d.sagaId || !d.storytellerCapId) {
        return { ok: false, seeded: 0, error: 'saga 尚未種子化' };
    }
    if (pairs.length === 0) return { ok: true, seeded: 0 };

    try {
        const admin = getAdminContext();
        const res = await withAdminLock(async () => {
            const tx = new Transaction();
            for (const p of pairs) {
                tx.add(
                    endlessTx.director.relationshipSeed({
                        cap: d.storytellerCapId,
                        saga: d.sagaId,
                        sceneId: p.sceneId,
                        characterA: p.aId,
                        characterB: p.bId,
                        tone: p.tone,
                    }),
                );
            }
            const r = await admin.client.signAndExecuteTransaction({
                transaction: tx,
                signer: admin.signer,
                options: { showEffects: true },
            });
            if (r.effects?.status?.status !== 'success') {
                throw new Error(r.effects?.status?.error ?? 'relationship_seed 交易失敗');
            }
            await admin.client.waitForTransaction({ digest: r.digest });
            return r;
        });
        return { ok: true, seeded: pairs.length, digest: res.digest };
    } catch (err) {
        return { ok: false, seeded: 0, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Collect the pairs to deepen from this tick's GIVE results: each ACCEPTED,
 * non-refused gift is one bonding act. Dedup symmetric pairs and cap the count
 * so a generous tick can't balloon the PTB. Scene is resolved from the live
 * roster (giver's, else recipient's), falling back to the saga's first scene.
 */
export function collectBondPairs(
    gives: Array<{
        characterId: string;
        ok: boolean;
        gave: boolean;
        gifts?: Array<{ recipientId: string; refused?: boolean }>;
    }>,
    sceneIdOf: (id: string) => string | undefined,
    max = 4,
): BondPair[] {
    const out: BondPair[] = [];
    const seen = new Set<string>();
    const fallbackScene = ENDLESS_STORY_DEPLOYMENT.sceneIds[0];
    for (const g of gives) {
        if (!g.ok || !g.gave) continue;
        for (const gift of g.gifts ?? []) {
            if (gift.refused || !gift.recipientId || gift.recipientId === g.characterId) continue;
            const key = [g.characterId, gift.recipientId].sort().join('::');
            if (seen.has(key)) continue;
            const sceneId = sceneIdOf(g.characterId) ?? sceneIdOf(gift.recipientId) ?? fallbackScene;
            if (!sceneId) continue;
            seen.add(key);
            // A gift is an act of warmth → 親近 (affection). Kept simple + flexible;
            // the tone only needs to be an encounter-eligible bond tone.
            out.push({ aId: g.characterId, bId: gift.recipientId, sceneId, tone: 'affection' });
            if (out.length >= max) return out;
        }
    }
    return out;
}
