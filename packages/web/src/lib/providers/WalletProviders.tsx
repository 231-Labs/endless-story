'use client';

/**
 * Root client-side providers for Sui wallet + react-query.
 *
 * Inject once in the root layout. The wrapped children can then call
 * `useCurrentAccount`, `useSignAndExecuteTransaction`, etc. from dapp-kit.
 *
 * Network is auto-resolved: deployment's network if deployed, else
 * NEXT_PUBLIC_SUI_NETWORK env var, else devnet. autoConnect=true so users
 * who connected before don't re-pick on every page load.
 */

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    SuiClientProvider,
    WalletProvider,
    createNetworkConfig,
} from '@mysten/dapp-kit';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';

import '@mysten/dapp-kit/dist/index.css';

const { networkConfig } = createNetworkConfig({
    devnet: { url: getJsonRpcFullnodeUrl('devnet') },
    testnet: { url: getJsonRpcFullnodeUrl('testnet') },
    mainnet: { url: getJsonRpcFullnodeUrl('mainnet') },
    localnet: { url: getJsonRpcFullnodeUrl('localnet') },
});

function resolveDefaultNetwork(): 'devnet' | 'testnet' | 'mainnet' | 'localnet' {
    if (ENDLESS_STORY_DEPLOYMENT.packageId) return ENDLESS_STORY_DEPLOYMENT.network;
    const env = process.env.NEXT_PUBLIC_SUI_NETWORK as
        | 'devnet'
        | 'testnet'
        | 'mainnet'
        | 'localnet'
        | undefined;
    return env ?? 'devnet';
}

export function WalletProviders({ children }: { children: React.ReactNode }) {
    const [client] = useState(() => new QueryClient());
    const defaultNetwork = resolveDefaultNetwork();
    return (
        <QueryClientProvider client={client}>
            <SuiClientProvider networks={networkConfig} defaultNetwork={defaultNetwork}>
                <WalletProvider autoConnect>{children}</WalletProvider>
            </SuiClientProvider>
        </QueryClientProvider>
    );
}
