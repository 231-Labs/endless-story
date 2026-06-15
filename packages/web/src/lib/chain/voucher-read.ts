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
 * map for all requested ids.
 *
 * CACHED: the underlying voucher-redeemed event scan is shared across all callers
 * within a short window AND de-duped while in flight. Without this, the tick called
 * a FULL event scan per character per phase (PLAN/POV/role-resolve), hammering the
 * Sui RPC → 429. Vouchers are immutable post-mint, so a short TTL is safe; new
 * mints surface on the next window.
 */
const SCAN_TTL_MS = 60_000;
let hintsCache: { at: number; map: Map<string, string> } | null = null;
let hintsInFlight: Promise<Map<string, string>> | null = null;

async function allVoucherHints(): Promise<Map<string, string>> {
    if (hintsCache && Date.now() - hintsCache.at < SCAN_TTL_MS) return hintsCache.map;
    if (hintsInFlight) return hintsInFlight;
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    hintsInFlight = (async () => {
        const map = new Map<string, string>();
        if (pkg) {
            const client = makeSuiClient({ network: resolveNetwork() });
            const events = await read.recruit.listVoucherRedeemedEvents(client, pkg, {});
            // Descending scan → first (most recent) hit per character wins.
            for (const ev of events) {
                if (ev.characterId && ev.hint && !map.has(ev.characterId)) map.set(ev.characterId, ev.hint);
            }
        }
        hintsCache = { at: Date.now(), map };
        return map;
    })().finally(() => {
        hintsInFlight = null;
    });
    return hintsInFlight;
}

export async function fetchRecruitmentIdMapForCharacters(
    characterIds: string[],
): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>(characterIds.map((id) => [id, null]));
    if (!ENDLESS_STORY_DEPLOYMENT.packageId || characterIds.length === 0) return out;
    try {
        const all = await allVoucherHints();
        for (const id of characterIds) out.set(id, all.get(id) ?? null);
    } catch (err) {
        console.warn('[voucher-read] fetchRecruitmentIdMapForCharacters failed:', err);
    }
    return out;
}
