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
import { execAdminTx, getAdminContext } from '@/lib/chain/admin-signer';
import { type BondPair } from './bond-core.ts';

export { collectBondPairs, type BondPair, type GiveLike } from './bond-core.ts';

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
        const res = await execAdminTx(admin, tx);
        if (!res.success) {
            throw new Error(res.error ?? 'relationship_seed 交易失敗');
        }
        return { ok: true, seeded: pairs.length, digest: res.digest };
    } catch (err) {
        return { ok: false, seeded: 0, error: err instanceof Error ? err.message : String(err) };
    }
}
