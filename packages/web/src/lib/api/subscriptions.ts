import type { Subscription, SubscriptionChannel } from '@endless-story/shared';
import {
  listSubscribersForCharacter,
  listSubscriptionsByWallet,
  subscriptions,
} from '@/mocks/subscriptions.js';

export async function listMySubscriptions(wallet: string): Promise<Subscription[]> {
  return listSubscriptionsByWallet(wallet);
}

export async function listSubscribers(characterId: string): Promise<Subscription[]> {
  return listSubscribersForCharacter(characterId);
}

export async function subscribe(
  wallet: string,
  characterId: string,
  channel: SubscriptionChannel
): Promise<Subscription> {
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

export async function unsubscribe(wallet: string, characterId: string): Promise<void> {
  const idx = subscriptions.findIndex(
    (s) => s.wallet === wallet && s.characterId === characterId && !s.isOwner
  );
  if (idx >= 0) subscriptions.splice(idx, 1);
}
