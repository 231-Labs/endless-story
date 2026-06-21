/**
 * Decode Move `vector<u8>` byte-string fields that arrive over JSON-RPC as
 * either an already-decoded UTF-8 string or a raw number[]. Shared by the
 * chain read modules (previously copy-pasted per file).
 */

/** Decode a UTF-8 byte-string field. Returns '' for null/undefined/malformed input. */
export function decodeByteString(raw: number[] | string | undefined): string {
    if (raw == null) return '';
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
        try {
            return new TextDecoder().decode(Uint8Array.from(raw));
        } catch {
            return '';
        }
    }
    return '';
}

/** Decode a byte field as a lowercase hex string (e.g. a digest or 0x id). */
export function decodeBytesHex(raw: number[] | string | undefined): string {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
        return raw.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return '';
}
