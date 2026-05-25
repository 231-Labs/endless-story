/**
 * Node-only keypair loading + signer context.
 *
 * Split out from `client.ts` so the browser bundle never pulls in
 * `node:fs` / `node:os` / `node:path`. Server actions and cli scripts
 * import from `@endless-story/sdk/node`; web client components stay on
 * the main `@endless-story/sdk` entry.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { makeSuiClient, type MakeClientOptions, type SuiClient } from './client.js';
import type { SuiNetwork } from '@endless-story/shared/contract-ids';

/**
 * Load the Sui keypair from `~/.endless-wuxia/keypair.json`.
 *
 * Note: the dir name is a legacy path retained from the previous repo
 * (where the keypair was first created). Renaming would invalidate the
 * existing on-chain identity. Treated as user data, not code.
 *
 * Node-only — do not call from browser code.
 */
export function loadKeypair(index = 0): Ed25519Keypair {
  const path = join(homedir(), '.endless-wuxia', 'keypair.json');
  const raw = readFileSync(path, 'utf8');
  const arr = JSON.parse(raw) as string[];
  if (!Array.isArray(arr) || index >= arr.length) {
    throw new Error(`keypair.json index ${index} out of range (have ${arr.length})`);
  }
  // Format: each entry is a base64-encoded 33-byte string (scheme flag + 32-byte secret).
  const decoded = fromBase64(arr[index]);
  if (decoded.length !== 33) {
    throw new Error(`keypair[${index}] expected 33 bytes (flag + secret), got ${decoded.length}`);
  }
  return Ed25519Keypair.fromSecretKey(decoded.slice(1));
}

/** Convenience: client + signer paired together. Node / cli usage. */
export interface SuiContext {
  client: SuiClient;
  signer: Ed25519Keypair;
  network: SuiNetwork;
}

export function makeSuiContext(opts: MakeClientOptions & { keyIndex?: number } = {}): SuiContext {
  const network = opts.network ?? 'devnet';
  return {
    client: makeSuiClient({ network, url: opts.url }),
    signer: loadKeypair(opts.keyIndex ?? 0),
    network,
  };
}
