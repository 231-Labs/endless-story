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
 * Subscribe to a character — fires `subscribe::subscribe` Move call.
 *
 * Authenticated via the connected user wallet (so the Subscription
 * object lands in their address). Optimistically bumps the displayed
 * count via the `onSubscribed` callback; caller decides whether to
 * re-fetch from chain.
 */
export function SubscribeButton({
    characterId,
    currentCount,
    onSubscribed,
}: {
    characterId: string;
    currentCount: number;
    onSubscribed?: (newCount: number) => void;
}) {
    const account = useCurrentAccount();
    const suiClient = useSuiClient();
    const { mutate: signAndExecute } = useSignAndExecuteTransaction();
    const [count, setCount] = useState(currentCount);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleSubscribe = () => {
        if (!account) {
            setError('請先連接錢包');
            return;
        }
        setError(null);
        const tx = new Transaction();
        tx.add(endlessTx.subscribe.subscribe({ character: characterId }));

        startTransition(() => {
            signAndExecute(
                { transaction: tx },
                {
                    onSuccess: async (res) => {
                        // Wait for finality so chain re-read shows the new count.
                        try {
                            await suiClient.waitForTransaction({
                                digest: res.digest,
                                options: { showEffects: true },
                            });
                            const next = count + 1;
                            setCount(next);
                            onSubscribed?.(next);
                        } catch (err) {
                            setError(err instanceof Error ? err.message : '訂閱已發出但等待失敗');
                        }
                    },
                    onError: (err) => setError(err.message),
                },
            );
        });
    };

    return (
        <div className="inline-flex flex-col items-start gap-1">
            <button
                type="button"
                onClick={handleSubscribe}
                disabled={isPending || !account}
                className="inline-flex items-center gap-2 rounded-full border border-cinnabar/60 bg-surface px-3 py-1.5 text-xs tracking-widest text-cinnabar transition-colors hover:bg-cinnabar hover:text-canvas disabled:cursor-not-allowed disabled:opacity-50"
                title={!account ? '請先連接錢包' : '訂閱這位角色的 POV 章回'}
            >
                <span>{isPending ? '訂閱中…' : '訂閱'}</span>
                <span className="font-mono text-2xs opacity-70">· {count}</span>
            </button>
            {error ? <span className="text-2xs text-cinnabar/90">{error}</span> : null}
        </div>
    );
}
