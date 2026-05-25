/**
 * Admin (storyteller) keypair loading + client construction.
 *
 * Node-only — DO NOT import from client components. Server actions only.
 *
 * Two env-var paths:
 *   - SUI_ADMIN_PRIVATE_KEY: a suiprivkey-prefixed bech32 string (preferred,
 *     no file IO, works on serverless). Generate via
 *     `sui keytool export --key-identity <alias> --json | jq -r .exportedPrivateKey`
 *   - SUI_ADMIN_KEYPAIR_PATH: path to a keypair.json file matching the format
 *     used by sdk/src/client.ts loadKeypair (base64-encoded 33-byte strings).
 *     Falls back to ~/.endless-wuxia/keypair.json if neither set.
 *
 * The admin keypair holds:
 *   - World AdminCap
 *   - Saga StorytellerCap (after bootstrap)
 *   - Faucet AdminCap
 * So it can: redeem vouchers, mint admin ENDLESS, advance world ticks, etc.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { makeSuiClient, loadKeypair, type SuiClient } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';

let _cached: { keypair: Ed25519Keypair; address: string } | null = null;

export function loadAdminKeypair(): Ed25519Keypair {
    if (_cached) return _cached.keypair;
    const envKey = process.env.SUI_ADMIN_PRIVATE_KEY?.trim();
    let keypair: Ed25519Keypair;
    if (envKey && envKey.startsWith('suiprivkey')) {
        const { secretKey } = decodeSuiPrivateKey(envKey);
        keypair = Ed25519Keypair.fromSecretKey(secretKey);
    } else {
        // Fallback to file-based loader (matches cli scripts' behaviour).
        keypair = loadKeypair(0);
    }
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
