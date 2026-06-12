/**
 * 戲坊 Kiosk — chain purchase readiness (server + client safe checks).
 *
 * After redeploy + one-time kiosk bootstrap, set SHOP_KIOSK_ID and
 * SHOP_KIOSK_CAP_ID in .env.local (admin-owned 戲坊 Kiosk).
 */

import { ENDLESS_STORY_DEPLOYMENT, isDeployed } from '@endless-story/sdk';

export const SUI_MIST_PER_SUI = 1_000_000_000n;

export function suiToMist(priceSui: number): bigint {
  return BigInt(Math.round(priceSui * 1_000_000_000));
}

export function shopKioskIds(): { kioskId: string; kioskCapId: string } | null {
  const kioskId = process.env.SHOP_KIOSK_ID?.trim() ?? '';
  const kioskCapId = process.env.SHOP_KIOSK_CAP_ID?.trim() ?? '';
  if (!kioskId || !kioskCapId) return null;
  return { kioskId, kioskCapId };
}

export interface ShopChainStatus {
  /** All chain prerequisites met — still 劇照 can use Kiosk purchase. */
  chainReady: boolean;
  kioskConfigured: boolean;
  transferPolicyReady: boolean;
  deployed: boolean;
  /** Human-readable blockers (empty when chainReady). */
  blockers: string[];
}

export function getShopChainStatus(): ShopChainStatus {
  const deployed = isDeployed();
  const transferPolicyReady = Boolean(ENDLESS_STORY_DEPLOYMENT.stillTransferPolicyId);
  const kioskConfigured = shopKioskIds() != null;
  const blockers: string[] = [];
  if (!deployed) blockers.push('合約尚未部署');
  if (!transferPolicyReady) blockers.push('stillTransferPolicyId 待 redeploy 寫入');
  if (!kioskConfigured) blockers.push('SHOP_KIOSK_ID / SHOP_KIOSK_CAP_ID 未設定');
  if (!ENDLESS_STORY_DEPLOYMENT.stillRegistryId) blockers.push('StillRegistry 待 bootstrap');
  if (!ENDLESS_STORY_DEPLOYMENT.storytellerCapId) blockers.push('StorytellerCap 待 bootstrap');
  return {
    chainReady: blockers.length === 0,
    kioskConfigured,
    transferPolicyReady,
    deployed,
    blockers,
  };
}

export interface StillListingRef {
  kioskId: string;
  stillId: string;
  priceMist: string;
  transferPolicyId: string;
  title: string;
  edition?: number;
}
