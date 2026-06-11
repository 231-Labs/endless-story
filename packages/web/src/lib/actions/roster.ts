'use server';

/**
 * Server action — list the Characters owned by a wallet (the player's roster),
 * the entry point into the 廂房 Chamber. Called from the client `ChamberRoster`
 * with the connected wallet address (dapp-kit `useCurrentAccount`).
 *
 * Goes through the `charactersApi` facade (architecture principle: never bypass
 * `web/src/lib/api/`), which is chain-first when deployed and falls back to
 * mocks during local dev. Listing public Character objects by owner is not
 * gated content — there is no private payload here.
 */

import type { Character } from '@endless-story/shared';
import { charactersApi } from '@/lib/api/index';

export async function getMyRoster(wallet: string): Promise<Character[]> {
  const addr = wallet?.trim();
  if (!addr) return [];
  try {
    return await charactersApi.listOwnedCharacters(addr);
  } catch (err) {
    console.warn('[roster] getMyRoster failed:', err);
    return [];
  }
}
