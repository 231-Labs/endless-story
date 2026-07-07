'use client';

/**
 * useSagaAdmin — is the connected wallet the saga owner (StorytellerCap holder)?
 *
 * The StorytellerCap struct itself only carries `id` + `saga_id`; ownership
 * is encoded in the Sui object's `AddressOwner` metadata. So we read the
 * cap object with `showOwner: true` and compare against the connected
 * address. Same pattern the wallet menu uses for FaucetAdminCap.
 *
 * Returns:
 *   - `isSagaAdmin` — true only after we've confirmed ownership
 *   - `isLoading`   — true while the cap fetch is in flight
 *   - `account`     — pass-through of dapp-kit's current account
 */

import { useEffect, useState } from 'react';
import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';

export interface SagaAdminState {
  isSagaAdmin: boolean;
  isLoading: boolean;
  account: ReturnType<typeof useCurrentAccount>;
}

export function useSagaAdmin(): SagaAdminState {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const capId = ENDLESS_STORY_DEPLOYMENT.storytellerCapId;

  const [isSagaAdmin, setIsSagaAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!account || !capId) {
      setIsSagaAdmin(false);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    client.core
      .getObject({ objectId: capId })
      .then((res) => {
        if (cancelled) return;
        const owner = res.object.owner;
        setIsSagaAdmin(owner?.$kind === 'AddressOwner' && owner.AddressOwner === account.address);
      })
      .catch(() => {
        if (!cancelled) setIsSagaAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, client, capId]);

  return { isSagaAdmin, isLoading, account };
}
