'use client';

/**
 * LabControls — the operator's hand: step one beat of the world (一拍 = one
 * tick), run a stretch, pause, or fork the run into a sibling branch.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { labApi } from './useLab';
import type { LabLiveSnapshot } from '@/lib/lab/live';

export function LabControls({ snapshot, onChanged }: { snapshot: LabLiveSnapshot; onChanged: () => void }) {
    const router = useRouter();
    const [ticks, setTicks] = useState(6);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const running = snapshot.phase === 'running';

    const act = async (label: string, fn: () => Promise<unknown>) => {
        setBusy(label);
        setError(null);
        try {
            await fn();
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-serif text-2xs tracking-[0.2em] ${
                    snapshot.phase === 'error'
                        ? 'border-cinnabar/60 text-cinnabar'
                        : running
                            ? 'border-cinnabar/40 text-ink/85'
                            : 'border-hairline text-mute'
                }`}
            >
                <span
                    className={`h-1.5 w-1.5 rounded-full ${
                        running ? 'bg-cinnabar animate-lab-live-dot' : snapshot.phase === 'error' ? 'bg-cinnabar' : 'bg-jade/70'
                    }`}
                />
                {running ? `走拍中 · 餘 ${snapshot.pendingTicks}` : snapshot.phase === 'error' ? '出錯' : '靜場'}
            </span>

            <button
                type="button"
                disabled={busy !== null || running}
                onClick={() => act('step', () => labApi.control(snapshot.runId, { action: 'step' }))}
                className="es-button-primary px-3 py-1.5 text-xs disabled:opacity-40"
            >
                走一拍
            </button>
            <span className="inline-flex items-center gap-1">
                <button
                    type="button"
                    disabled={busy !== null || running}
                    onClick={() => act('run', () => labApi.control(snapshot.runId, { action: 'run', ticks }))}
                    className="es-button-ghost px-3 py-1.5 text-xs disabled:opacity-40"
                >
                    連走
                </button>
                <input
                    type="number"
                    min={1}
                    max={600}
                    value={ticks}
                    onChange={(e) => setTicks(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
                    className="es-field w-16 px-2 py-1.5 text-center text-xs"
                    aria-label="連走拍數"
                />
                <span className="font-serif text-2xs tracking-[0.2em] text-mute">拍</span>
            </span>
            <button
                type="button"
                disabled={!running}
                onClick={() => act('pause', () => labApi.control(snapshot.runId, { action: 'pause' }))}
                className="es-button-ghost px-3 py-1.5 text-xs disabled:opacity-40"
            >
                停
            </button>
            <button
                type="button"
                disabled={busy !== null || running}
                onClick={() =>
                    act('fork', async () => {
                        const title = window.prompt('分支之名（自此一拍另開一卷）', `${snapshot.meta.title} · 別卷`);
                        if (!title) return;
                        const { meta } = await labApi.control(snapshot.runId, { action: 'fork', title });
                        if (meta) router.push(`/lab/run/${meta.id}`);
                    })
                }
                className="es-button-ghost px-3 py-1.5 text-xs disabled:opacity-40"
            >
                另開一卷
            </button>

            {snapshot.provider ? (
                <span className="font-serif text-2xs tracking-[0.15em] text-mute/80">
                    {snapshot.provider} · {snapshot.model}
                </span>
            ) : (
                <span className="font-serif text-2xs tracking-[0.15em] text-mute/80">排演（確定性假角）</span>
            )}

            {(error || snapshot.lastError) ? (
                <span className="w-full font-serif text-xs text-cinnabar" role="alert">
                    {error ?? snapshot.lastError}
                </span>
            ) : null}
        </div>
    );
}
