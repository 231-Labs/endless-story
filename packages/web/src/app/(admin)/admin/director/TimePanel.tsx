'use client';

import { useState, useTransition } from 'react';
import {
    advanceTickAction,
    type AdvanceTickResult,
    type WorldTimeSnapshot,
} from '@/lib/actions/world-time';
import { txUrl } from '@/lib/explorer';

/**
 * Admin panel: advance the World tick (the chain-canonical narrative
 * clock). Day / part-of-day are derived from tick + days_per_tick_bp.
 * The gazette compiler reads this to title each issue "Day N".
 *
 * This is the manual driver until the Phase 2 scheduler advances ticks
 * automatically.
 */
export function TimePanel({ initial }: { initial: WorldTimeSnapshot | null }) {
    const [snapshot, setSnapshot] = useState<WorldTimeSnapshot | null>(initial);
    const [result, setResult] = useState<AdvanceTickResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleAdvance = () => {
        setResult(null);
        startTransition(async () => {
            const r = await advanceTickAction();
            setResult(r);
            if (r.ok && r.snapshot) setSnapshot(r.snapshot);
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-6 rounded border border-hairline bg-canvas/40 p-4">
                <TimeStat label="當前日" value={snapshot ? `第 ${snapshot.day} 日` : '—'} />
                <TimeStat label="時辰" value={snapshot?.partOfDay ?? '—'} />
                <TimeStat
                    label="tick"
                    value={
                        snapshot
                            ? `${snapshot.currentTick}（日內 ${snapshot.tickOfDay + 1}/${snapshot.ticksPerDay}）`
                            : '—'
                    }
                />
            </div>

            <div className="flex items-center justify-between gap-3">
                <p className="text-2xs tracking-widest text-mute">
                    {snapshot
                        ? `每 ${snapshot.ticksPerDay} tick 跨一日（${snapshot.daysPerTickBp} bp）。推進 tick 後，下次編公報就會用新日數。`
                        : 'World 尚未種子化。'}
                </p>
                <button
                    type="button"
                    onClick={handleAdvance}
                    disabled={isPending || !snapshot}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '推進中…' : '推進一個 tick'}
                </button>
            </div>

            {result ? (
                <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                    <span
                        className={`inline-block h-2 w-2 rounded-full ${
                            result.ok ? 'bg-jade' : 'bg-cinnabar'
                        }`}
                    />
                    <span className="text-mute">{result.ok ? '已推進' : '失敗'}</span>
                    {result.digest ? (
                        <a
                            href={txUrl(result.digest)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cinnabar hover:underline"
                        >
                            tx
                        </a>
                    ) : null}
                    {result.error ? (
                        <span className="text-cinnabar">{result.error}</span>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function TimeStat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-2xs tracking-widest text-mute">{label}</div>
            <div className="mt-1 font-serif text-lg text-ink">{value}</div>
        </div>
    );
}
