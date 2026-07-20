'use client';

/**
 * Client data layer for the cinema-lab: thin fetch helpers over /api/lab plus
 * the polling live hook. Beats accumulate client-side into a rolling feed so
 * a viewer sees the scene loop breathe line by line while a tick runs.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabLiveSnapshot } from '@/lib/lab/live';
import type {
    LabLiveBeat,
    LabRunConfig,
    LabRunMeta,
    LabRunSummary,
    LabSeasonSummary,
    LabSeedSummary,
    LabTickRecord,
    LabWorldConfig,
} from '@/lib/lab/types';

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

export const labApi = {
    seeds: () => request<{ seeds: LabSeedSummary[]; seasons: LabSeasonSummary[] }>('/api/lab/seeds'),
    seedText: (source: string, id: string, kind: 'seed' | 'season' = 'seed') =>
        request<{ json: string }>(`/api/lab/seeds/${source}/${encodeURIComponent(id)}${kind === 'season' ? '?kind=season' : ''}`),
    saveSeed: (kind: 'seed' | 'season', id: string, json: string) =>
        request<{ saved: LabSeedSummary | LabSeasonSummary }>('/api/lab/seeds', {
            method: 'POST',
            body: JSON.stringify({ kind, id, json }),
        }),
    runs: () => request<{ runs: LabRunSummary[] }>('/api/lab/runs'),
    createRun: (input: { title: string; note?: string; config: Partial<LabRunConfig> }) =>
        request<{ meta: LabRunMeta }>('/api/lab/runs', { method: 'POST', body: JSON.stringify(input) }),
    deleteRun: (id: string) => request<{ deleted: string }>(`/api/lab/runs/${id}`, { method: 'DELETE' }),
    patchRun: (id: string, patch: { title?: string; note?: string }) =>
        request<{ meta: LabRunMeta }>(`/api/lab/runs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    control: (id: string, body: { action: string; ticks?: number; title?: string; note?: string }) =>
        request<{ meta?: LabRunMeta; queued?: number }>(`/api/lab/runs/${id}/control`, {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    live: (id: string, after: number) => request<LabLiveSnapshot>(`/api/lab/runs/${id}/live?after=${after}`),
    /** 診斷導出 — fetch the run's diagnostic Markdown as a downloadable blob. Uses
     *  the same cookie auth every other lab fetch relies on (same-origin fetch
     *  carries `es_lab_key`); returns the blob + server-suggested filename. */
    export: async (id: string): Promise<{ blob: Blob; filename: string }> => {
        const res = await fetch(`/api/lab/runs/${id}/export`, { cache: 'no-store' });
        if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(data?.error ?? `${res.status} ${res.statusText}`);
        }
        const disposition = res.headers.get('Content-Disposition') ?? '';
        const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `endless-story-${id}.md`;
        return { blob: await res.blob(), filename };
    },
    ticks: (id: string, limit?: number) =>
        request<{ records: LabTickRecord[] }>(`/api/lab/runs/${id}/ticks${limit ? `?limit=${limit}` : ''}`),
    archive: (id: string) =>
        request<{ entries: Array<{ file: string; kind: string; day: number; tick: number; slug: string }> }>(
            `/api/lab/runs/${id}/archive`,
        ),
    archiveFile: (id: string, file: string) =>
        request<{ content: string }>(`/api/lab/runs/${id}/archive?file=${encodeURIComponent(file)}`),
    dossiers: (id: string) =>
        request<{
            dossiers: Array<{ slug: string; title: string; day: number; scene: string; perspectives: string[] }>;
            editorial: { anthology?: string };
        }>(`/api/lab/runs/${id}/dossiers`),
    config: (id: string) => request<{ config: LabWorldConfig }>(`/api/lab/runs/${id}/config`),
    configOp: (id: string, op: unknown) =>
        request<{ config: LabWorldConfig }>(`/api/lab/runs/${id}/config`, { method: 'POST', body: JSON.stringify(op) }),
    memories: (id: string, characterId: string) =>
        request<{ memories: Array<{ seq: number; content: string; kind: string; day: number; importance: number }> }>(
            `/api/lab/runs/${id}/memories?characterId=${encodeURIComponent(characterId)}`,
        ),
    memoryOp: (id: string, op: unknown) =>
        request<{ memories: Array<{ seq: number; content: string; kind: string; day: number; importance: number }> }>(
            `/api/lab/runs/${id}/memories`,
            { method: 'POST', body: JSON.stringify(op) },
        ),
    assets: () =>
        request<{
            assets: Array<{ kind: string; file: string; key: string; url: string; bytes: number }>;
            notes: Array<{ kind: string; key: string; note: string }>;
        }>('/api/lab/assets'),
    saveAssetNote: (kind: string, name: string, note: string) =>
        request<{ noted: string }>('/api/lab/assets', { method: 'POST', body: JSON.stringify({ kind, name, note }) }),
    gallery: (kind: string, name: string) =>
        request<{ gallery: Array<{ file: string; url: string; type: 'image' | 'video' }> }>(
            `/api/lab/assets?galleryKind=${kind}&galleryName=${encodeURIComponent(name)}`,
        ),
    addGalleryItem: (kind: string, name: string, dataUrl: string) =>
        request<{ added: { file: string; url: string } }>('/api/lab/assets', {
            method: 'POST',
            body: JSON.stringify({ kind, name, galleryDataUrl: dataUrl }),
        }),
    deleteGalleryItem: (kind: string, key: string, file: string) =>
        request<{ deleted: string }>(
            `/api/lab/assets?kind=${kind}&galleryKey=${encodeURIComponent(key)}&galleryFile=${encodeURIComponent(file)}`,
            { method: 'DELETE' },
        ),
    clearGallery: (kind: string, name: string) =>
        request<{ cleared: number }>(
            `/api/lab/assets?kind=${kind}&galleryClearName=${encodeURIComponent(name)}`,
            { method: 'DELETE' },
        ),
    uploadAsset: (kind: string, name: string, dataUrl: string) =>
        request<{ saved: { kind: string; file: string; key: string; url: string } }>('/api/lab/assets', {
            method: 'POST',
            body: JSON.stringify({ kind, name, dataUrl }),
        }),
    deleteAsset: (kind: string, file: string) =>
        request<{ deleted: string }>(`/api/lab/assets?kind=${kind}&file=${encodeURIComponent(file)}`, { method: 'DELETE' }),
};

const FEED_CAP = 240;

export interface LiveState {
    snapshot: LabLiveSnapshot | null;
    /** Rolling beat feed, oldest → newest. */
    feed: LabLiveBeat[];
    error?: string;
    refresh: () => void;
}

/** Poll the live view. Fast cadence while a tick is running, slow when idle. */
export function useLabLive(runId: string): LiveState {
    const [snapshot, setSnapshot] = useState<LabLiveSnapshot | null>(null);
    const [feed, setFeed] = useState<LabLiveBeat[]>([]);
    const [error, setError] = useState<string | undefined>();
    const cursorRef = useRef(0);
    const kickRef = useRef(0);
    const [kick, setKick] = useState(0);

    const refresh = useCallback(() => {
        kickRef.current += 1;
        setKick(kickRef.current);
    }, []);

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let epoch: string | undefined;
        cursorRef.current = 0;
        setFeed([]);
        const tick = async () => {
            let delay = 6000;
            if (typeof document === 'undefined' || document.visibilityState === 'visible') {
                try {
                    const snap = await labApi.live(runId, cursorRef.current);
                    if (cancelled) return;
                    setSnapshot(snap);
                    setError(undefined);
                    if (epoch !== undefined && epoch !== snap.epoch) {
                        // seq space changed (run reopened) — restart the cursor;
                        // the next poll backfills from the new ring.
                        cursorRef.current = 0;
                        setFeed([]);
                        delay = 200;
                    } else {
                        if (snap.beats.length) {
                            setFeed((prev) => {
                                const merged = [...prev, ...snap.beats];
                                return merged.length > FEED_CAP ? merged.slice(merged.length - FEED_CAP) : merged;
                            });
                        }
                        cursorRef.current = Math.max(cursorRef.current, snap.seq);
                        delay = snap.phase === 'running' ? 1800 : 6000;
                    }
                    epoch = snap.epoch;
                } catch (e) {
                    if (cancelled) return;
                    setError(e instanceof Error ? e.message : String(e));
                }
            }
            if (!cancelled) timer = setTimeout(tick, delay);
        };
        void tick();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [runId, kick]);

    return { snapshot, feed, error, refresh };
}
