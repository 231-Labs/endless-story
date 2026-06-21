/**
 * ControlCap resolution — map a character to the admin-held ControlCap that
 * currently authorizes acting on its behalf.
 *
 * Server/node-only (reads the admin address). ONE canonical resolver, shared by
 * the memory layer (SEAL recall/remember) and the card-play path (event
 * `submit_action_as_character`), so both always agree on which cap is current.
 *
 * Prefers the highest-epoch ControlCap the admin owns — this survives
 * `revoke_all_control` / `reassign_saga`, which bump the character's epoch and
 * strand older caps in the wallet. Falls back to the mint-time cap from the
 * CharacterMinted event when the owned-objects scan finds nothing.
 *
 * Returns null / omits the entry when no usable cap is found — after a revoke
 * with no re-issue, the stale cap may still be returned but on-chain use aborts
 * with `EControlCapInvalid` (epoch mismatch), i.e. the delegation is cut.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';
import { getAdminAddress } from './admin-signer.js';

/** Current (highest-epoch) ControlCap id for one character, or null. */
export async function resolveControlCapId(characterId: string): Promise<string | null> {
    const map = await resolveControlCapMap([characterId]);
    return map.get(characterId) ?? null;
}

/**
 * Batch resolver: characterId → current ControlCap id, in ONE owned-objects
 * scan. The act-phase PTB submits many plays at once; resolving each cap with
 * its own RPC round-trip would be N calls, so the whole roster is resolved
 * together. Any character the admin holds no cap for falls back to its
 * mint-time cap individually.
 */
export async function resolveControlCapMap(
    characterIds: string[],
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg || characterIds.length === 0) return out;
    const want = new Set(characterIds);
    const client = makeSuiClient({ network: resolveNetwork() });

    // Primary: highest-epoch ControlCap the admin currently owns.
    try {
        const admin = getAdminAddress();
        const caps = await read.character.listControlCapsForAddress(client, admin, pkg);
        const bestEpoch = new Map<string, number>();
        for (const c of caps) {
            if (!want.has(c.characterId)) continue;
            const prev = bestEpoch.get(c.characterId);
            if (prev === undefined || c.epoch > prev) {
                bestEpoch.set(c.characterId, c.epoch);
                out.set(c.characterId, c.capId);
            }
        }
    } catch (err) {
        console.warn('[control-caps] listControlCapsForAddress failed, falling back:', err);
    }

    // Fallback: mint-time cap from CharacterMinted for any still unresolved.
    const missing = characterIds.filter((id) => !out.has(id));
    if (missing.length > 0) {
        try {
            const summaries = await read.character.listMintedCharacterSummaries(client, pkg, {});
            const byId = new Map(summaries.map((s) => [s.characterId, s.controlCapId]));
            for (const id of missing) {
                const capId = byId.get(id);
                if (capId) out.set(id, capId);
            }
        } catch (err) {
            console.warn('[control-caps] mint-time fallback failed:', err);
        }
    }
    return out;
}
