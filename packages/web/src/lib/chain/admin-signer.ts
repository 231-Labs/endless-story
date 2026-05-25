/**
 * Admin (storyteller) keypair loading + client construction.
 *
 * Node-only — DO NOT import from client components. Server actions only.
 *
 * Delegates to `@endless-story/sdk/node` so there's a single canonical
 * key source: `SUI_ADMIN_PRIVATE_KEY` env var (bech32 `suiprivkey1...`).
 * Set it in `packages/web/.env.local`.
 *
 * The admin keypair holds:
 *   - World AdminCap
 *   - Saga StorytellerCap (after bootstrap)
 *   - Faucet AdminCap
 * So it can: redeem vouchers, mint admin ENDLESS, advance world ticks, etc.
 */

import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { makeSuiClient, type SuiClient } from '@endless-story/sdk';
import { loadKeypair } from '@endless-story/sdk/node';
import { resolveNetwork } from './network.js';

let _cached: { keypair: Ed25519Keypair; address: string } | null = null;

export function loadAdminKeypair(): Ed25519Keypair {
    if (_cached) return _cached.keypair;
    const keypair = loadKeypair();
    _cached = { keypair, address: keypair.toSuiAddress() };
    return keypair;
}

export function getAdminAddress(): string {
    if (!_cached) loadAdminKeypair();
    return _cached!.address;
}

/** Build a Sui client targeting the deployed network. */
export function getAdminClient(): SuiClient {
    return makeSuiClient({ network: resolveNetwork() });
}

/** Pair: client + signer, for admin server actions. */
export interface AdminContext {
    client: SuiClient;
    signer: Ed25519Keypair;
    address: string;
}

export function getAdminContext(): AdminContext {
    const signer = loadAdminKeypair();
    return {
        client: getAdminClient(),
        signer,
        address: signer.toSuiAddress(),
    };
}
