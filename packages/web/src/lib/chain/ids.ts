/** A 0x-prefixed 32-byte Sui object id (64 hex chars). */
export const SUI_ID_RE = /^0x[0-9a-fA-F]{64}$/;

/** Type-guard: is `id` a well-formed Sui object id string? */
export function isSuiObjectId(id: string | null | undefined): id is string {
    return typeof id === 'string' && SUI_ID_RE.test(id);
}
