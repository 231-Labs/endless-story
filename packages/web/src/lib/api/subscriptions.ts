import type { Subscription, SubscriptionChannel } from '@endless-story/shared';
import {
  listSubscribersForCharacter,
  listSubscriptionsByWallet,
  subscriptions,
} from '@/mocks/subscriptions';
import { USE_MOCK } from './config';
import { httpDelete, httpGet, httpPost } from './http';

/**
 * Subscriptions API
 *
 * Backend endpoints:
 *   GET    /subscriptions?wallet={addr}             → Subscription[]
 *   GET    /subscriptions?characterId={id}          → Subscription[]
 *   POST   /subscriptions                           → Subscription   body: { wallet, characterId, channel }
 *   DELETE /subscriptions?wallet={addr}&characterId={id}
 *
 * Backend should:
 *   - subscribe is idempotent — if it already exists, return the existing record
 *   - unsubscribe only removes isOwner=false entries (owner subscription is automatic, non-cancellable)
 *   - on-chain payment: subscribe maps to a subscribe_pay tx — backend writes DB on event
 */

export async function listMySubscriptions(wallet: string): Promise<Subscription[]> {
  if (USE_MOCK) return listSubscriptionsByWallet(wallet);
  return httpGet<Subscription[]>('/subscriptions', { query: { wallet } });
}

export async function listSubscribers(characterId: string): Promise<Subscription[]> {
  if (USE_MOCK) return listSubscribersForCharacter(characterId);
  return httpGet<Subscription[]>('/subscriptions', { query: { characterId } });
}

export async function subscribe(
  wallet: string,
  characterId: string,
  channel: SubscriptionChannel
): Promise<Subscription> {
  if (USE_MOCK) {
    const existing = subscriptions.find(
      (s) => s.wallet === wallet && s.characterId === characterId
    );
    if (existing) return existing;
    const created: Subscription = {
      wallet,
      characterId,
      channel,
      createdAt: new Date().toISOString(),
      isOwner: false,
    };
    subscriptions.push(created);
    return created;
  }
  return httpPost<Subscription>('/subscriptions', { wallet, characterId, channel });
}

export async function unsubscribe(wallet: string, characterId: string): Promise<void> {
  if (USE_MOCK) {
    const idx = subscriptions.findIndex(
      (s) => s.wallet === wallet && s.characterId === characterId && !s.isOwner
    );
    if (idx >= 0) subscriptions.splice(idx, 1);
    return;
  }
  await httpDelete<void>('/subscriptions', { query: { wallet, characterId } });
}
