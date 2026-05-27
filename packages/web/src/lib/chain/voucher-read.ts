/**
 * Chain helper: trace a character back to the off-chain Recruitment
 * that minted it.
 *
 * Path: characterId → GenesisVoucherRedeemed event (filter by
 * character_id) → voucher.hint = recruitment_id → off-chain
 * Recruitment record → specialty (role) + other off-chain fields.
 *
 * Why this lives in chain/: it's the chain side of the lookup. The
 * off-chain part (recruitments store) is consumed via the facade by
 * callers. This helper just resolves "what was this character's
 * originating campaign id".
 *
 * Returns null when:
 *   - characterId is not a Sui id
 *   - chain unreachable / not deployed
 *   - voucher hint missing (older characters minted before R1.5 R-B
 *     hint round-trip wiring)
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';

const SUI_ID_RE = /^0x[0-9a-fA-F]{64}$/;

export async function fetchRecruitmentIdForCharacter(
    characterId: string,
): Promise<string | null> {
    if (!SUI_ID_RE.test(characterId)) return null;
    const map = await fetchRecruitmentIdMapForCharacters([characterId]);
    return map.get(characterId) ?? null;
}

/**
 * Batch version — one event-log scan returns a {charId → recruitmentId}
 * map for all requested ids. Use this when rendering lists of
 * characters (dossier grid, saga page) so we don't fan out N identical
 * scans.
 */
export async function fetchRecruitmentIdMapForCharacters(
    characterIds: string[],
): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>(characterIds.map((id) => [id, null]));
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg || characterIds.length === 0) return out;
    const wanted = new Set(characterIds);
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        const events = await read.recruit.listVoucherRedeemedEvents(client, pkg, {});
        for (const ev of events) {
            if (wanted.has(ev.characterId) && ev.hint) {
                // Only the FIRST (most recent) hit wins — descending
                // scan, so subsequent matches for the same character
                // can't overwrite. (Mints fire once per voucher anyway.)
                if (!out.get(ev.characterId)) out.set(ev.characterId, ev.hint);
            }
        }
    } catch (err) {
        console.warn('[voucher-read] fetchRecruitmentIdMapForCharacters failed:', err);
    }
    return out;
}
