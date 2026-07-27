/**
 * Product client — guest-facing fetch helpers over /api/lab/public/*.
 * Directors keep using labApi for control / 物界 / interview.
 */

import type { LabLiveSnapshot } from '@/lib/lab/live';
import type { DailyShot } from '@/lib/lab/daily-shot';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        cache: 'no-store',
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data?.error ?? `${res.status} ${res.statusText}`);
    return data;
}

export const productClient = {
    config: () =>
        request<{
            brand: string;
            runId: string | null;
            featuredCastNames: string[];
            runTitle: string | null;
            hasDailyShot: boolean;
            ready: boolean;
        }>('/api/lab/public'),
    backend: () => request<{ backend: string }>('/api/lab/public/ports'),
    live: (after: number) => request<LabLiveSnapshot>(`/api/lab/public/live?after=${after}`),
    dailyShot: () => request<{ runId: string; shot: DailyShot | null }>('/api/lab/public/daily-shot'),
    cast: () =>
        request<{
            runId: string;
            cast: Array<{ id: string; name: string; role?: string; portraitUrl?: string }>;
            featuredCastNames: string[];
        }>('/api/lab/public/cast'),
    dossiers: () =>
        request<{
            dossiers: Array<{ slug: string; title: string; day: number; scene: string; perspectives: string[] }>;
            editorial: { anthology?: string };
        }>('/api/lab/public/reading?kind=dossiers'),
    archive: () =>
        request<{ entries: Array<{ file: string; kind: string; day: number; tick: number; slug: string }> }>(
            '/api/lab/public/reading?kind=archive',
        ),
    archiveFile: (file: string) =>
        request<{ content: string }>(`/api/lab/public/reading?kind=file&file=${encodeURIComponent(file)}`),
};
