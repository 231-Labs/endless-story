/**
 * Client persistence for 春雪社看客 — first visit, tracking, discovered cast.
 * localStorage only; no identity server in phase 1.
 */

export type GuestViewMode = 'watch' | 'world' | 'read';

const KEYS = {
    firstVisitDone: 'es-chunxue-first-visit',
    trackCharacterId: 'es-chunxue-track-character',
    trackLocationId: 'es-chunxue-track-location',
    discovered: 'es-chunxue-discovered',
    lastMode: 'es-chunxue-last-mode',
} as const;

function canUseStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function isFirstVisitDone(): boolean {
    if (!canUseStorage()) return true;
    return window.localStorage.getItem(KEYS.firstVisitDone) === '1';
}

export function markFirstVisitDone(): void {
    if (!canUseStorage()) return;
    window.localStorage.setItem(KEYS.firstVisitDone, '1');
}

export function getTrackedCharacterId(): string | null {
    if (!canUseStorage()) return null;
    return window.localStorage.getItem(KEYS.trackCharacterId);
}

export function setTrackedCharacterId(id: string | null): void {
    if (!canUseStorage()) return;
    if (!id) window.localStorage.removeItem(KEYS.trackCharacterId);
    else window.localStorage.setItem(KEYS.trackCharacterId, id);
}

export function getTrackedLocationId(): string | null {
    if (!canUseStorage()) return null;
    return window.localStorage.getItem(KEYS.trackLocationId);
}

export function setTrackedLocationId(id: string | null): void {
    if (!canUseStorage()) return;
    if (!id) window.localStorage.removeItem(KEYS.trackLocationId);
    else window.localStorage.setItem(KEYS.trackLocationId, id);
}

export function getDiscoveredCharacterIds(): string[] {
    if (!canUseStorage()) return [];
    try {
        const raw = window.localStorage.getItem(KEYS.discovered);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

export function discoverCharacter(id: string): string[] {
    const current = getDiscoveredCharacterIds();
    if (current.includes(id)) return current;
    const next = [...current, id];
    if (canUseStorage()) window.localStorage.setItem(KEYS.discovered, JSON.stringify(next));
    return next;
}

export function getLastMode(): GuestViewMode | null {
    if (!canUseStorage()) return null;
    const v = window.localStorage.getItem(KEYS.lastMode);
    if (v === 'watch' || v === 'world' || v === 'read') return v;
    return null;
}

export function setLastMode(mode: GuestViewMode): void {
    if (!canUseStorage()) return;
    window.localStorage.setItem(KEYS.lastMode, mode);
}
