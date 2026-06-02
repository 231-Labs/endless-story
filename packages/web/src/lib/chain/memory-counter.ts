/**
 * Real per-character memory count from the self-hosted relayer's index.
 *
 * The relayer persistently indexes every appended memory per namespace, so it IS the source of
 * truth for "how many memories does this character have" — which drives the economy's storage
 * rent. Falls back to `null` (→ caller uses an age proxy) when MEMWAL_SERVER_URL is unset or the
 * relayer doesn't expose `/api/count` (e.g. the managed relayer). Server-only; never throws.
 */

const NS = (characterId: string): string => `char_${characterId}`;

export async function getMemoryCount(characterId: string): Promise<number | null> {
    const base = process.env.MEMWAL_SERVER_URL?.replace(/\/$/, '');
    if (!base) return null;
    try {
        const res = await fetch(`${base}/api/count?namespace=${encodeURIComponent(NS(characterId))}`, {
            // never let a slow/unreachable relayer hang a page render
            signal: AbortSignal.timeout(2_500),
        });
        if (!res.ok) return null;
        const j = (await res.json()) as { count?: number };
        return typeof j.count === 'number' ? j.count : null;
    } catch {
        return null;
    }
}
