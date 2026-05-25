/**
 * Deterministic attribute roll from voucher.attribute_seed.
 *
 * **Why deterministic?** The voucher's `attribute_seed` (`vector<u8>` set at
 * mint time) is the public source of truth for "what did this user roll".
 * Same seed = same character forever, no double-rolls allowed, fully auditable.
 *
 * Algorithm:
 *   For each axis in `schemaKeys` (order matters):
 *     bytes = HKDF-SHA256(ikm = seed, salt = BRAND, info = `attr:${key}`, length = 4)
 *     value = u32be(bytes) % (max - min + 1) + min
 *
 * Why HKDF and not just SHA256(seed || key)?
 * - HKDF gives a documented cryptographic guarantee of independent outputs
 *   for distinct `info` even when `ikm` is small / structured.
 * - Cheap to swap to a different hash if needed (info-only domain separation).
 *
 * **Bias note**: modulo-N over uniform u32 has negligible bias when
 * `(max - min + 1) ≪ 2^32` (true for our 0–100 ranges). Don't use this
 * for cryptographic randomness — only for game stats.
 */

import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import type { AttributeKey, RolledAttribute } from '../prompts/character.js';

/** Domain separation — bump suffix if the algorithm ever changes. */
export const ROLL_BRAND = new TextEncoder().encode('endless-story:roll:v1');

export function rollAttributesFromSeed(
  seed: Uint8Array,
  schemaKeys: AttributeKey[],
): RolledAttribute[] {
  if (seed.length === 0) {
    throw new Error('rollAttributesFromSeed: seed is empty');
  }
  return schemaKeys.map((axis) => {
    const info = new TextEncoder().encode(`attr:${axis.key}`);
    const bytes = hkdf(sha256, seed, ROLL_BRAND, info, 4);
    const u32 = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    // `>>> 0` coerces back to unsigned (JS `<<` returns signed int32).
    const unsigned = u32 >>> 0;
    const range = axis.max - axis.min + 1;
    const value = (unsigned % range) + axis.min;
    return { key: axis.key, label: axis.label, value };
  });
}

/**
 * Generate a fresh attribute_seed for a new voucher.
 *
 * 32 bytes of crypto-grade entropy via Web Crypto. The client computes this
 * when minting a voucher; the bytes go into `vector<u8>` on-chain. Same seed
 * = same roll forever, so the client should treat this like a one-shot
 * lottery ticket.
 *
 * Requires `globalThis.crypto` (Node ≥ 19, all modern browsers, Edge runtime).
 * Our `.nvmrc` pins Node 23.
 */
export function generateAttributeSeed(): Uint8Array {
  const out = new Uint8Array(32);
  globalThis.crypto.getRandomValues(out);
  return out;
}
