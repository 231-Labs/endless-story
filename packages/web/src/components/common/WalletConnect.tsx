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
    useSuiClient,
} from '@mysten/dapp-kit';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';

function truncate(addr: string): string {
    if (addr.length < 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletConnect() {
    const account = useCurrentAccount();
    const { mutate: disconnect } = useDisconnectWallet();
    const client = useSuiClient();
    const [balance, setBalance] = useState<string>('—');
    const packageId = ENDLESS_STORY_DEPLOYMENT.packageId;

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
    }, [account, client, packageId]);

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
        <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-hairline">
            <span className="font-mono text-xs text-mute" title={account.address}>
                {truncate(account.address)}
            </span>
            <span className="text-xs text-jade">{balance}</span>
            <button
                type="button"
                onClick={() => disconnect()}
                className="text-xs text-mute hover:text-cinnabar transition-colors"
                title="斷開錢包"
            >
                ×
            </button>
        </div>
    );
}
