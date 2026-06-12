/**
 * On-chain subscription list — Subscription objects + owned characters.
 *
 * OwnerCap holders auto-subscribe to their character's POV (product rule);
 * follower subs come from `subscribe::Subscription` objects owned by the wallet.
 */
import type { Subscription } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';
import { fetchOnChainCharactersByOwner, isSuiObjectId } from './character-read.js';

function isDeployed(): boolean {
  return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}

function dateFromMs(ms: string): string {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : new Date(0).toISOString();
}

export async function fetchMySubscriptionsFromChain(wallet: string): Promise<Subscription[]> {
  if (!isDeployed() || !isSuiObjectId(wallet)) return [];

  const client = makeSuiClient({ network: resolveNetwork() });
  const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;

  const [owned, chainSubs] = await Promise.all([
    fetchOnChainCharactersByOwner(wallet).catch(() => []),
    read.subscribe
      .listSubscriptionsForAddress(client, wallet, pkg)
      .catch(() => [] as Awaited<ReturnType<typeof read.subscribe.listSubscriptionsForAddress>>),
  ]);

  const ownedIds = new Set(owned.map((c) => c.id));

  const ownedEntries: Subscription[] = owned.map((c) => ({
    wallet,
    characterId: c.id,
    channel: 'in_app',
    createdAt: c.createdAt,
    isOwner: true,
  }));

  const followingEntries: Subscription[] = chainSubs
    .filter((s) => s.characterId && !ownedIds.has(s.characterId))
    .map((s) => ({
      wallet,
      characterId: s.characterId,
      subscriptionId: s.subscriptionId,
      channel: 'in_app',
      createdAt: dateFromMs(s.subscribedAtMs),
      isOwner: false,
    }));

  return [...ownedEntries, ...followingEntries];
}
