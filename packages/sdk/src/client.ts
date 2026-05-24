/**
 * Sui client factory + keypair loading.
 *
 * **The only place** in this repo allowed to construct a Sui client.
 * web / runner / cli MUST go through here — see AGENTS.md 「鏈上架構」原則 2.
 *
 * Uses `SuiJsonRpcClient` from `@mysten/sui/jsonRpc` (v2.17+ renamed from
 * the old `SuiClient`). web code in browser contexts should pass an
 * externally-provided client (e.g. from dapp-kit's `useSuiClient`) via
 * the optional `client` arg on builders, rather than calling this directly.
 */
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SuiNetwork } from '@endless-story/shared/contract-ids';

export type SuiClient = SuiJsonRpcClient;

export interface MakeClientOptions {
  /** Defaults to 'devnet'. */
  network?: SuiNetwork;
  /** Override fullnode URL (e.g. for localnet or custom RPC). */
  url?: string;
}

/** Construct a Sui client pinned to a given network. Node / cli usage. */
export function makeSuiClient(opts: MakeClientOptions = {}): SuiClient {
  const network = opts.network ?? 'devnet';
  const url = opts.url ?? getJsonRpcFullnodeUrl(network);
  return new SuiJsonRpcClient({ url, network });
}

/**
 * Load the Sui keypair from `~/.endless-wuxia/keypair.json`.
 *
 * Note: the dir name is a legacy path retained from the previous repo
 * (where keypair was first created). Renaming would invalidate the
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
