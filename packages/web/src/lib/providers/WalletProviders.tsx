'use client';

/**
 * Root client-side provider for the Sui wallet layer.
 *
 * Inject once in the root layout. The wrapped children can then call
 * `useCurrentAccount`, `useCurrentClient`, `useDAppKit`, etc. from
 * `@mysten/dapp-kit-react`.
 *
 * The JSON-RPC API is being decommissioned, so this uses the new dapp-kit
 * (`@mysten/dapp-kit-core` + `@mysten/dapp-kit-react`) over a `SuiGrpcClient`.
 * Network is auto-resolved: deployment's network if deployed, else
 * NEXT_PUBLIC_SUI_NETWORK, else devnet. autoConnect=true so users who connected
 * before don't re-pick on every page load.
 */

import { createDAppKit } from '@mysten/dapp-kit-core';
import { DAppKitProvider } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { ENDLESS_STORY_DEPLOYMENT, resilientFetch } from '@endless-story/sdk';

type Net = 'devnet' | 'testnet' | 'mainnet' | 'localnet';

function resolveDefaultNetwork(): Net {
    if (ENDLESS_STORY_DEPLOYMENT.packageId) return ENDLESS_STORY_DEPLOYMENT.network;
    return (process.env.NEXT_PUBLIC_SUI_NETWORK as Net | undefined) ?? 'devnet';
}

// Browser endpoint override — the public fullnode rate-limits (429) hard on the
// chamber/dossier read fan-out. Same fullnode host serves gRPC on :443, so the
// JSON-RPC URL helper still yields the right base URL. Set NEXT_PUBLIC_SUI_GRPC_URL
// (or the legacy NEXT_PUBLIC_SUI_RPC_URL) to point the active network at a node.
const GRPC_OVERRIDE =
    process.env.NEXT_PUBLIC_SUI_GRPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUI_RPC_URL?.trim() ||
    undefined;
const OVERRIDE_NET = resolveDefaultNetwork();

function grpcBaseUrl(net: Net): string {
    return GRPC_OVERRIDE && net === OVERRIDE_NET ? GRPC_OVERRIDE : getJsonRpcFullnodeUrl(net);
}

// `resilientFetch` wraps the gRPC transport for 429/5xx retry (it only
// special-cases JSON-RPC bodies, so for gRPC's binary bodies it is a plain
// retrying fetch).
const dAppKit = createDAppKit({
    networks: ['devnet', 'testnet', 'mainnet', 'localnet'],
    defaultNetwork: resolveDefaultNetwork(),
    autoConnect: true,
    createClient: (network) =>
        new SuiGrpcClient({
            network: network as Net,
            baseUrl: grpcBaseUrl(network as Net),
            fetch: resilientFetch(),
        }),
});

// Register the instance so the react hooks (`useCurrentAccount`, `useDAppKit`,
// `useCurrentNetwork`, …) infer this dApp kit's network + client types.
declare module '@mysten/dapp-kit-react' {
    interface Register {
        dAppKit: typeof dAppKit;
    }
}

export function WalletProviders({ children }: { children: React.ReactNode }) {
    return <DAppKitProvider dAppKit={dAppKit}>{children}</DAppKitProvider>;
}
