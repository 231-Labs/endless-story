/**
 * Character inner-life secret store — off-chain, per-character, process-local
 * (same shape as spatial-routing.ts's homeByCharacter). Founding-cast secrets
 * (spring-snow.json founding_cast[].secret) are seeded here at mint time so
 * POV / plan / want-engine scene prompts can inject them WITHOUT ever putting
 * them in the on-chain description.
 *
 * Perception boundary: a row is keyed by its owner's characterId only. Callers
 * must look it up per-character and thread it into that character's OWN prompt
 * call — never into a shared/co-present prompt (see RULES.md P4).
 */

const secretByCharacter = new Map<string, string>();

export function setCharacterSecret(characterId: string, secret: string): void {
    const trimmed = secret.trim();
    if (trimmed) secretByCharacter.set(characterId, trimmed);
}

export function getCharacterSecret(characterId: string): string | undefined {
    return secretByCharacter.get(characterId);
}

/** Reset (tests / harness isolation). */
export function clearCharacterSecrets(): void {
    secretByCharacter.clear();
}
