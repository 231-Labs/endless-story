/**
 * Per-saga skill seeding — writes the 行當 skill values the card-weight rules read
 * (event.move `compute_card_weights`) so a 武旦 is dealt more 武打 cards, a 花旦 more
 * 唱念 cards. Until something writes these, every character has NO saga skills and
 * the whole card-weight system is inert (uniform draw).
 *
 * The pure derivation lives in `saga-skills-core.ts` (node-clean, unit-tested);
 * this module re-exports it and adds the chain write. Server-only (admin keypair).
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import type { AdminContext } from '@/lib/chain/admin-signer';
import { SKILL_KEYS, type SkillProfile } from './saga-skills-core';

export {
    deriveSagaSkills,
    SKILL_KEYS,
    type SkillKey,
    type SkillProfile,
    type WorldAttrs,
} from './saga-skills-core';

export interface SeedSkillsResult {
    ok: boolean;
    seeded: number;
    digest?: string;
    error?: string;
}

/**
 * Write all six skills for one character in a single PTB (one signature). The
 * character must already be in the saga (set_character_skill asserts this) and
 * alive. set_character_skill is an upsert, so this is idempotent. Best-effort:
 * a failure leaves the card draw at uniform weight, never blocks mint/reconcile.
 */
export async function seedCharacterSkills(
    admin: AdminContext,
    characterId: string,
    skills: SkillProfile,
): Promise<SeedSkillsResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, seeded: 0, error: 'saga 尚未種子化' };
    }
    try {
        const tx = new Transaction();
        for (const key of SKILL_KEYS) {
            tx.add(
                endlessTx.character.setCharacterSkill({
                    cap: d.storytellerCapId,
                    saga: d.sagaId,
                    character: characterId,
                    key,
                    value: BigInt(skills[key]),
                    seed: [],
                }),
            );
        }
        const res = await admin.client.signAndExecuteTransaction({
            transaction: tx,
            signer: admin.signer,
            options: { showEffects: true },
        });
        if (res.effects?.status?.status !== 'success') {
            throw new Error(res.effects?.status?.error ?? 'set_character_skill 交易失敗');
        }
        await admin.client.waitForTransaction({ digest: res.digest });
        return { ok: true, seeded: SKILL_KEYS.length, digest: res.digest };
    } catch (err) {
        return { ok: false, seeded: 0, error: err instanceof Error ? err.message : String(err) };
    }
}
