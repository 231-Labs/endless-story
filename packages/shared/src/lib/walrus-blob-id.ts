/**
 * Decode + validate Walrus blob ids stored on-chain as `vector<u8>` (UTF-8
 * string bytes). Rejects placeholders like "0" that LLMs emit when the real
 * id was missing at compile time.
 */

export function decodeCommitmentBlobId(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (raw instanceof Uint8Array) return new TextDecoder().decode(raw).trim();
  if (Array.isArray(raw)) {
    const bytes = raw
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 255);
    return bytes.length > 0 ? new TextDecoder().decode(new Uint8Array(bytes)).trim() : '';
  }
  return '';
}

/** Walrus blob ids are content-addressed hashes — never single-digit placeholders. */
export function isValidWalrusBlobId(id: string): boolean {
  const s = id.trim();
  if (s.length < 8) return false;
  if (/^0+$/.test(s)) return false;
  return /^[A-Za-z0-9_-]+$/.test(s);
}

export function normalizeWalrusBlobId(raw: unknown): string {
  const decoded = decodeCommitmentBlobId(raw);
  return isValidWalrusBlobId(decoded) ? decoded : '';
}
