import type { Recruitment } from '@endless-story/shared';
import { getStoreRecruitment, listOpenStoreRecruitments } from '@/lib/actions/recruitments-store';
import {
  fetchOnChainRecruitmentMintedCount,
  fetchOnChainRecruitmentMintedCounts,
} from '@/lib/chain/recruit-read';

/**
 * Recruitments API — facade over:
 *   - Off-chain admin-edited JSON store for the recruitment listing
 *     (`web/data/recruitments.json`).
 *   - On-chain `GenesisVoucherRedeemed` events for "slots filled" count,
 *     tagged with the recruitment id via voucher hint.
 *
 * The split exists because Recruitment itself isn't a Move object —
 * it's a storyteller-side campaign descriptor. Voucher mint → character
 * redeem IS on chain, so we count redeemed events grouped by the hint
 * the wizard stamps at mint time.
 *
 * The store starts EMPTY on fresh install. Admin populates it via:
 *   - /admin/deploy ③ button (batch open 5 preset role-types)
 *   - /admin/recruitments (manual CRUD)
 *
 * Seed data lives in `lib/recruitment-seeds.ts`.
 */

export async function listOpenRecruitments(): Promise<Recruitment[]> {
  return listOpenStoreRecruitments();
}

export async function getRecruitment(id: string): Promise<Recruitment | null> {
  return getStoreRecruitment(id);
}

/**
 * How many characters have been minted under this recruitment so far?
 * Reads chain `GenesisVoucherRedeemed` events filtered by hint = id.
 *
 * Returns 0 when chain unreachable / not deployed / no matches — the
 * caller treats 0 as "no one's signed up yet".
 */
export async function getMintedCount(recruitmentId: string): Promise<number> {
  return fetchOnChainRecruitmentMintedCount(recruitmentId);
}

/**
 * Batch version — single event-log scan, grouped result. Use this when
 * rendering a list of recruitments (admin / public listing) so we don't
 * fan out N identical scans.
 */
export async function getMintedCounts(
  recruitmentIds: string[],
): Promise<Map<string, number>> {
  return fetchOnChainRecruitmentMintedCounts(recruitmentIds);
}

/**
 * Derived: is this recruitment full (mintedCount >= slots)?
 *
 * Pure computation over inputs — exposed as a small facade utility so
 * UI doesn't reimplement the comparison in five places.
 */
export function isFull(recruitment: Recruitment, mintedCount: number): boolean {
  return mintedCount >= recruitment.slots;
}
