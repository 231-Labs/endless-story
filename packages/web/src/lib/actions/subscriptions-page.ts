'use server';

import { revalidatePath } from 'next/cache';
import type { Character, Subscription } from '@endless-story/shared';
import { charactersApi, subscriptionsApi } from '@/lib/api/index';

export type SubscriptionsPageData = {
  subscriptions: Subscription[];
  characters: Character[];
};

export async function getMySubscriptionsPageData(wallet: string): Promise<SubscriptionsPageData> {
  const addr = wallet?.trim();
  if (!addr) return { subscriptions: [], characters: [] };
  try {
    const subscriptions = await subscriptionsApi.listMySubscriptions(addr);
    const characters = (
      await Promise.all(
        subscriptions.map((s) =>
          charactersApi.getCharacter(s.characterId).catch(() => null),
        ),
      )
    ).filter((c): c is Character => Boolean(c));
    return { subscriptions, characters };
  } catch (err) {
    console.warn('[subscriptions] getMySubscriptionsPageData failed:', err);
    return { subscriptions: [], characters: [] };
  }
}

export async function cancelMockSubscription(formData: FormData) {
  const wallet = formData.get('wallet');
  const characterId = formData.get('characterId');
  if (typeof wallet !== 'string' || typeof characterId !== 'string') return;
  await subscriptionsApi.unsubscribe(wallet, characterId);
  revalidatePath('/subscriptions');
}
