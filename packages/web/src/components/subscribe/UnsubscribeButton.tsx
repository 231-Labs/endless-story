'use client';

import { useState, useTransition } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { tx as endlessTx } from '@endless-story/sdk';

/**
 * Burn an on-chain Subscription object (`subscribe::unsubscribe`).
 */
export function UnsubscribeButton({
  subscriptionId,
  characterId,
  characterName,
  expectedWallet,
  onComplete,
}: {
  subscriptionId: string;
  characterId: string;
  characterName: string;
  expectedWallet: string;
  onComplete?: () => void;
}) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const walletMismatch = !!account && account.address !== expectedWallet;

  const handleUnsubscribe = () => {
    if (!account) {
      setError('請先連接錢包');
      return;
    }
    if (walletMismatch) {
      setError('請連接與此頁相同的錢包');
      return;
    }

    setError(null);
    const tx = new Transaction();
    tx.add(
      endlessTx.subscribe.unsubscribe({
        sub: subscriptionId,
        character: characterId,
      }),
    );

    startTransition(() => {
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (res) => {
            try {
              await suiClient.waitForTransaction({
                digest: res.digest,
                options: { showEffects: true },
              });
              onComplete?.();
            } catch (err) {
              setError(err instanceof Error ? err.message : '取消訂閱已送出，稍後重整看看');
            }
          },
          onError: (err) => setError(err.message),
        },
      );
    });
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleUnsubscribe}
        disabled={isPending || !account || walletMismatch}
        className="rounded border border-hairline px-3 py-1.5 text-2xs tracking-widest text-mute transition-colors hover:border-cinnabar/40 hover:text-cinnabar disabled:cursor-not-allowed disabled:opacity-50"
        title={
          !account
            ? '請先連接錢包'
            : walletMismatch
              ? '請連接與此頁相同的錢包'
              : `取消訂閱 ${characterName}`
        }
      >
        {isPending ? '取消中…' : '取消訂閱'}
      </button>
      {error ? <span className="max-w-[10rem] text-right text-2xs text-cinnabar/90">{error}</span> : null}
    </div>
  );
}
