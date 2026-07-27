/** Client-side stable anonymous viewer id. */

export const VIEWER_ID_STORAGE_KEY = 'es-chunxue-viewer-id';
export const VIEWER_ID_HEADER = 'x-viewer-id';

export function getOrCreateViewerId(): string {
    if (typeof window === 'undefined') return 'anon-ssr';
    try {
        const existing = window.localStorage.getItem(VIEWER_ID_STORAGE_KEY);
        if (existing && /^[\w.-]{8,80}$/.test(existing)) return existing;
        const id = `v-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(0, 20);
        window.localStorage.setItem(VIEWER_ID_STORAGE_KEY, id);
        return id;
    } catch {
        return `anon-${Date.now()}`;
    }
}
