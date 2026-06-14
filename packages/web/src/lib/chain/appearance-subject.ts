import { createHash } from 'node:crypto';

/** Deterministic per-character appearance subject address (own commitment namespace). */
export function appearanceSubject(characterId: string): string {
    return '0x' + createHash('sha256').update(characterId.toLowerCase() + ':appearance').digest('hex');
}
