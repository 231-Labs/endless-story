import { createHash } from 'node:crypto';

/** Deterministic per-character persona subject address (own commitment namespace). */
export function personaSubject(characterId: string): string {
    return '0x' + createHash('sha256').update(characterId.toLowerCase() + ':persona').digest('hex');
}
