import type { WorldTimeSnapshot } from '@/lib/actions/world-time';

/** Read-only world clock — narrative day / part-of-day / tick. */
export function TimePanel({ initial: snapshot }: { initial: WorldTimeSnapshot | null }) {
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3 rounded border border-hairline bg-canvas/40 p-4">
                <div>
                    <div className="flex items-center gap-1.5 text-2xs tracking-widest text-mute">
                        {snapshot ? (
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-jade" aria-hidden />
                        ) : null}
                        當前敘事日
                    </div>
                    <div className="mt-1 font-serif text-3xl leading-none text-ink">
                        {snapshot ? `第 ${snapshot.day} 日` : '—'}
                    </div>
                </div>
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
            <p className="text-2xs tracking-widest text-mute">
                {snapshot
                    ? `每 ${snapshot.ticksPerDay} tick 跨一日（${snapshot.daysPerTickBp} bp）。world-loop 自動推進。`
                    : 'World 尚未種子化。'}
            </p>
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
