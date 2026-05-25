/**
 * Node-only keypair loading + signer context.
 *
 * Split out from `client.ts` so the browser bundle never pulls in
 * `node:fs` / `node:os` / `node:path`. Server actions and cli scripts
 * import from `@endless-story/sdk/node`; web client components stay on
 * the main `@endless-story/sdk` entry.
 *
 * **Single source of truth**: `SUI_ADMIN_PRIVATE_KEY` env var (bech32
 * `suiprivkey1...`). No file fallback — keep one canonical path so
 * server actions, cli scripts, and runner all behave identically.
 *
 * For terminal-invoked cli scripts (which don't auto-load `.env.local`),
 * the `cli/package.json` scripts use Node's `--env-file` flag to point
 * at `packages/web/.env.local`.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { makeSuiClient, type MakeClientOptions, type SuiClient } from './client.js';
import type { SuiNetwork } from '@endless-story/shared/contract-ids';

export function loadKeypair(): Ed25519Keypair {
  const envKey = process.env.SUI_ADMIN_PRIVATE_KEY?.trim();
  if (!envKey) {
    throw new Error(
      'loadKeypair: SUI_ADMIN_PRIVATE_KEY env var not set. ' +
        'Add it to packages/web/.env.local (suiprivkey1... bech32 format). ' +
        'Export from sui CLI: `sui keytool export --key-identity <alias>`.',
    );
  }
  if (!envKey.startsWith('suiprivkey')) {
    throw new Error(
      `loadKeypair: SUI_ADMIN_PRIVATE_KEY must start with "suiprivkey" (bech32), got "${envKey.slice(0, 12)}…"`,
    );
  }
  const { secretKey } = decodeSuiPrivateKey(envKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

/** Convenience: client + signer paired together. Node / cli usage. */
export interface SuiContext {
  client: SuiClient;
  signer: Ed25519Keypair;
  network: SuiNetwork;
}

export function makeSuiContext(opts: MakeClientOptions = {}): SuiContext {
  const network = opts.network ?? 'devnet';
  return {
    client: makeSuiClient({ network, url: opts.url }),
    signer: loadKeypair(),
    network,
  };
}
