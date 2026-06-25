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
import { getJsonRpcFullnodeUrl, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';
import { ENDLESS_STORY_DEPLOYMENT, resilientFetch } from '@endless-story/sdk';

import '@mysten/dapp-kit/dist/index.css';

type Net = 'devnet' | 'testnet' | 'mainnet' | 'localnet';

function resolveDefaultNetwork(): Net {
    if (ENDLESS_STORY_DEPLOYMENT.packageId) return ENDLESS_STORY_DEPLOYMENT.network;
    return (process.env.NEXT_PUBLIC_SUI_NETWORK as Net | undefined) ?? 'devnet';
}

// Browser RPC override — the public fullnode rate-limits (429) hard on object
// reads under the chamber/dossier fan-out. Mirrors the server's SUI_RPC_URL:
// set NEXT_PUBLIC_SUI_RPC_URL to a dedicated node and the active network uses it.
const RPC_OVERRIDE = process.env.NEXT_PUBLIC_SUI_RPC_URL?.trim() || undefined;
const OVERRIDE_NET = resolveDefaultNetwork();

function rpcUrl(net: Net): string {
    return RPC_OVERRIDE && net === OVERRIDE_NET ? RPC_OVERRIDE : getJsonRpcFullnodeUrl(net);
}

// Resilient transport per network: retry 429/5xx + dedup + cache static ABI
// reads, so the browser's object-read fan-out survives the public fullnode.
function netConfig(net: Net) {
    return {
        network: net,
        transport: new JsonRpcHTTPTransport({ url: rpcUrl(net), fetch: resilientFetch() }),
    };
}

const { networkConfig } = createNetworkConfig({
    devnet: netConfig('devnet'),
    testnet: netConfig('testnet'),
    mainnet: netConfig('mainnet'),
    localnet: netConfig('localnet'),
});

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
