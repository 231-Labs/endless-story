'use server';

/**
 * Backfill a character's per-saga skills (the values the card-weight rules read).
 * Used by reconcile to cover gacha-minted / older characters that never got
 * skills at creation. Reads 行當 + world attrs from chain, derives the six skills,
 * and writes them in one PTB. set_character_skill is an upsert, so re-running is
 * idempotent (overwrites with the same derived values).
 */

import { makeSuiClient, read } from '@endless-story/sdk';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { resolveRole } from '@/lib/chain/pov-core';
import { resolveNetwork } from '@/lib/chain/network';
import { deriveSagaSkills, seedCharacterSkills, type WorldAttrs } from '@/lib/chain/saga-skills';

export interface SeedCharacterSkillsResult {
    ok: boolean;
    seeded: number;
    error?: string;
}

export async function seedCharacterSkillsAction(
    characterId: string,
): Promise<SeedCharacterSkillsResult> {
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return { ok: false, seeded: 0, error: err instanceof Error ? err.message : 'admin keypair 載入失敗' };
    }

    const [role, world] = await Promise.all([
        resolveRole(characterId).catch(() => undefined),
        readWorldAttrs(characterId).catch(() => ({} as WorldAttrs)),
    ]);

    const r = await seedCharacterSkills(admin, characterId, deriveSagaSkills(role ?? '', world));
    return { ok: r.ok, seeded: r.seeded, error: r.error };
}

async function readWorldAttrs(characterId: string): Promise<WorldAttrs> {
    const client = makeSuiClient({ network: resolveNetwork() });
    const res = await read.character.getCharacter(client, characterId);
    const json = res.json as unknown as { attributes?: Array<{ key?: string; value?: number | string }> };
    const out: WorldAttrs = {};
    for (const a of json.attributes ?? []) {
        if (a?.key && a.value != null && (a.key === 'appearance' || a.key === 'constitution' || a.key === 'acuity' || a.key === 'disposition')) {
            out[a.key] = Number(a.value);
        }
    }
    return out;
}
