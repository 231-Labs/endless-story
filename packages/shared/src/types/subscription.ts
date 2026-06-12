import type { Wallet } from './common';

export type SubscriptionChannel = 'rss' | 'webpush' | 'in_app';

export interface Subscription {
  wallet: Wallet;
  characterId: string;
  /** On-chain Subscription object id — present for follower subs, used to unsubscribe. */
  subscriptionId?: string;
  channel: SubscriptionChannel;
  createdAt: string;
  isOwner: boolean;
}
