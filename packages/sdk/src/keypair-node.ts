/**
 * Node-only keypair loading + signer context.
 *
 * Split out from `client.ts` so the browser bundle never pulls in
 * `node:fs` / `node:os` / `node:path`. Server actions and cli scripts
 * import from `@endless-story/sdk/node`; web client components stay on
 * the main `@endless-story/sdk` entry.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { fromBase64 } from '@mysten/sui/utils';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { makeSuiClient, type MakeClientOptions, type SuiClient } from './client.js';
import type { SuiNetwork } from '@endless-story/shared/contract-ids';

/**
 * Load the Sui keypair. Resolution order:
 *
 *   1. `SUI_ADMIN_PRIVATE_KEY` env var (bech32 `suiprivkey1...`)
 *   2. `~/.endless-wuxia/keypair.json` — accepts three shapes:
 *      - `{ "privateKey": "suiprivkey1..." }`          (bech32, current)
 *      - `"suiprivkey1..."`                            (bare string)
 *      - `["base64-of-33-bytes", ...]`                 (legacy array)
 *
 * The legacy dir name is retained because renaming would invalidate the
 * existing on-chain identity (gas, owned objects). Treated as user data,
 * not code.
 *
 * Node-only — do not call from browser code.
 */
export function loadKeypair(index = 0): Ed25519Keypair {
  // ── 1. env var override ────────────────────────────────────────────
  const envKey = process.env.SUI_ADMIN_PRIVATE_KEY?.trim();
  if (envKey && envKey.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(envKey);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  // ── 2. file fallback ──────────────────────────────────────────────
  const path = join(homedir(), '.endless-wuxia', 'keypair.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(
      `loadKeypair: neither SUI_ADMIN_PRIVATE_KEY env nor ${path} usable: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Maybe the file is a bare bech32 string without JSON wrapping.
    const trimmed = raw.trim();
    if (trimmed.startsWith('suiprivkey')) {
      const { secretKey } = decodeSuiPrivateKey(trimmed);
      return Ed25519Keypair.fromSecretKey(secretKey);
    }
    throw new Error(`loadKeypair: ${path} is not valid JSON and not a bare suiprivkey string`);
  }

  // Shape A: { "privateKey": "suiprivkey1..." }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const candidate =
      typeof obj.privateKey === 'string'
        ? obj.privateKey
        : typeof obj.key === 'string'
          ? obj.key
          : null;
    if (candidate && candidate.startsWith('suiprivkey')) {
      const { secretKey } = decodeSuiPrivateKey(candidate);
      return Ed25519Keypair.fromSecretKey(secretKey);
    }
    throw new Error(
      `loadKeypair: ${path} object has no recognised key. ` +
        `Expected { "privateKey": "suiprivkey1..." }, got keys [${Object.keys(obj).join(', ')}]`,
    );
  }

  // Shape B: bare string
  if (typeof parsed === 'string' && parsed.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(parsed);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  // Shape C: legacy array of base64-encoded 33-byte strings
  if (Array.isArray(parsed)) {
    if (index >= parsed.length) {
      throw new Error(`loadKeypair: ${path} array index ${index} out of range (length ${parsed.length})`);
    }
    const entry = parsed[index];
    if (typeof entry !== 'string') {
      throw new Error(`loadKeypair: ${path}[${index}] is not a string`);
    }
    if (entry.startsWith('suiprivkey')) {
      const { secretKey } = decodeSuiPrivateKey(entry);
      return Ed25519Keypair.fromSecretKey(secretKey);
    }
    const decoded = fromBase64(entry);
    if (decoded.length !== 33) {
      throw new Error(
        `loadKeypair: ${path}[${index}] expected 33 bytes (flag + secret) base64, got ${decoded.length}`,
      );
    }
    return Ed25519Keypair.fromSecretKey(decoded.slice(1));
  }

  throw new Error(`loadKeypair: ${path} has unrecognised JSON shape ${typeof parsed}`);
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
