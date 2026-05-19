import type { Subscription } from '@endless-story/shared';
import { characters, DEMO_OWNERS } from './characters';

const now = () => '2026-05-17T18:00:00Z';

const VIEWER_WALLET = '0x7e9d3a4b5c6f8e2d1a9b3c4e5f6d8a7b2c1e9d4f5a6b3c8e7d2f1a9b4c6e5d80';

export const subscriptions: Subscription[] = [
  ...characters.map<Subscription>((c) => ({
    wallet: c.nftOwner,
    characterId: c.id,
    channel: 'in_app',
    createdAt: c.createdAt,
    isOwner: true,
  })),
  {
    wallet: VIEWER_WALLET,
    characterId: 'char_ye_tingfang',
    channel: 'rss',
    createdAt: now(),
    isOwner: false,
  },
  {
    wallet: VIEWER_WALLET,
    characterId: 'char_cheng_hengyu',
    channel: 'rss',
    createdAt: now(),
    isOwner: false,
  },
];

export const listSubscriptionsByWallet = (wallet: string): Subscription[] =>
  subscriptions.filter((s) => s.wallet === wallet);

export const listSubscribersForCharacter = (characterId: string): Subscription[] =>
  subscriptions.filter((s) => s.characterId === characterId);

export const DEMO_VIEWER_WALLET = VIEWER_WALLET;
export { DEMO_OWNERS };
