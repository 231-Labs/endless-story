'use client';

/**
 * Real wallet connect button + balance + disconnect.
 *
 * Sits alongside the existing MockWalletMenu in SiteNav. MockWalletMenu
 * handles persona switching (?as=viewer, our character / subscriptions
 * nav drawers); this one handles the actual on-chain identity that signs
 * transactions (mint voucher, drip faucet, etc.).
 *
 * When disconnected: shows dapp-kit's ConnectButton.
 * When connected: shows truncated address + ENDLESS balance + disconnect.
 */

import { useEffect, useState } from 'react';
import {
    ConnectButton,
    useCurrentAccount,
    useDisconnectWallet,
    useSignAndExecuteTransaction,
    useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';

function truncate(addr: string): string {
    if (addr.length < 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletConnect() {
    const account = useCurrentAccount();
    const { mutate: disconnect } = useDisconnectWallet();
    const { mutate: signAndExecute, isPending: isDripping } = useSignAndExecuteTransaction();
    const client = useSuiClient();
    const [balance, setBalance] = useState<string>('—');
    const [balanceTick, setBalanceTick] = useState(0); // bump to refetch after drip
    const [dripError, setDripError] = useState<string | null>(null);
    const packageId = ENDLESS_STORY_DEPLOYMENT.packageId;
    const faucetId = ENDLESS_STORY_DEPLOYMENT.faucetId;

    useEffect(() => {
        if (!account || !packageId) {
            setBalance('—');
            return;
        }
        let cancelled = false;
        const coinType = `${packageId}::currency::CURRENCY`;
        client
            .getBalance({ owner: account.address, coinType })
            .then((b) => {
                if (cancelled) return;
                const decimals = 6; // ENDLESS uses 6 decimals
                const whole = Number(BigInt(b.totalBalance) / BigInt(10 ** decimals));
                setBalance(`${whole.toLocaleString()} ENDLESS`);
            })
            .catch(() => {
                if (!cancelled) setBalance('—');
            });
        return () => {
            cancelled = true;
        };
    }, [account, client, packageId, balanceTick]);

    const handleDrip = () => {
        if (!faucetId) {
            setDripError('faucet 尚未種子化');
            return;
        }
        setDripError(null);
        const tx = new Transaction();
        tx.add(endlessTx.faucet.drip({ faucet: faucetId }));
        signAndExecute(
            { transaction: tx },
            {
                onSuccess: () => {
                    setBalanceTick((n) => n + 1);
                },
                onError: (err) => {
                    setDripError(err instanceof Error ? err.message : String(err));
                },
            },
        );
    };

    if (!account) {
        // dapp-kit's ConnectButton is styled — wrapping in a div so we can
        // override colors if needed via :where(...) selectors later.
        return (
            <div className="es-wallet-connect">
                <ConnectButton connectText="連結錢包" />
            </div>
        );
    }

    return (
        <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-hairline">
                <span className="font-mono text-xs text-mute" title={account.address}>
                    {truncate(account.address)}
                </span>
                <span className="text-xs text-jade">{balance}</span>
                {faucetId && (
                    <button
                        type="button"
                        onClick={handleDrip}
                        disabled={isDripping}
                        className="rounded-full bg-cinnabar/15 px-2 py-0.5 text-xs text-cinnabar transition-colors hover:bg-cinnabar/25 disabled:opacity-50"
                        title="從 Faucet 領取 ENDLESS"
                    >
                        {isDripping ? '領取中…' : '領 ENDLESS'}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => disconnect()}
                    className="text-xs text-mute hover:text-cinnabar transition-colors"
                    title="斷開錢包"
                >
                    ×
                </button>
            </div>
            {dripError && (
                <span className="rounded-full bg-cinnabar/10 px-3 py-0.5 text-xs text-cinnabar max-w-xs truncate" title={dripError}>
                    {dripError}
                </span>
            )}
        </div>
    );
}
