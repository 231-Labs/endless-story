import type { Wallet } from './common.js';

export type SubscriptionChannel = 'rss' | 'webpush' | 'in_app';

export interface Subscription {
  wallet: Wallet;
  characterId: string;
  channel: SubscriptionChannel;
  createdAt: string;
  isOwner: boolean;
}
