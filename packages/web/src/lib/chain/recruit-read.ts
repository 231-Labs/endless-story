/**
 * Chain-side fetchers for the Recruit module.
 *
 * Today's surface is just "count redemptions per (off-chain) recruitment
 * campaign" via the GenesisVoucherRedeemed event log, tagged with the
 * recruitment id via voucher `hint`. Lives here (not in `chain/saga-`)
 * because it pairs with the on-chain recruit module specifically.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';

/**
 * Count `GenesisVoucherRedeemed` events whose `hint` matches the given
 * recruitment id. Each redemption = one character minted under that
 * campaign, so the count is the canonical "slots filled" number.
 *
 * Returns 0 when chain unreachable / not deployed / no matches.
 */
export async function fetchOnChainRecruitmentMintedCount(
    recruitmentId: string,
): Promise<number> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return 0;
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        const events = await read.recruit.listVoucherRedeemedEvents(client, pkg, {
            hint: recruitmentId,
        });
        return events.length;
    } catch (err) {
        console.warn('[recruit-read] fetchOnChainRecruitmentMintedCount failed:', err);
        return 0;
    }
}

/**
 * Batch counter — returns `Map<recruitmentId, count>` for the given set.
 *
 * Scans the redeemed-event log ONCE and groups by hint. Much cheaper
 * than calling the single-id helper N times (which would re-scan the
 * full log per call). Use this when rendering a list of recruitment
 * cards.
 */
export async function fetchOnChainRecruitmentMintedCounts(
    recruitmentIds: string[],
): Promise<Map<string, number>> {
    const out = new Map<string, number>(recruitmentIds.map((id) => [id, 0]));
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg || recruitmentIds.length === 0) return out;
    const wanted = new Set(recruitmentIds);
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        const events = await read.recruit.listVoucherRedeemedEvents(client, pkg);
        for (const ev of events) {
            if (ev.hint && wanted.has(ev.hint)) {
                out.set(ev.hint, (out.get(ev.hint) ?? 0) + 1);
            }
        }
    } catch (err) {
        console.warn('[recruit-read] fetchOnChainRecruitmentMintedCounts failed:', err);
    }
    return out;
}
