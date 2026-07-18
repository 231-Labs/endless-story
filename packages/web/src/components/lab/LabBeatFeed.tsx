'use client';

/**
 * LabBeatFeed — the live stream of committed beats: who just said/did what,
 * where, at which hour. Newest on top; 心聲 (inner) shown muted; private
 * scenes marked 幽. This is the "每一個角色此刻回的話" surface.
 */

import type { LabLiveBeat } from '@/lib/lab/types';

export function LabBeatFeed({ feed, emptyHint }: { feed: LabLiveBeat[]; emptyHint?: string }) {
    const items = [...feed].reverse();
    return (
        <ol className="space-y-3">
            {items.map((b) => (
                <li key={b.seq} className="animate-beat-in es-soft-panel px-3 py-2.5">
                    <p className="flex flex-wrap items-baseline gap-x-2 font-serif text-2xs tracking-[0.18em] text-mute">
                        <span className="text-ink/80">{b.name}</span>
                        <span>第{b.day}日·{b.clock}</span>
                        <span className="text-jade/90">{b.sceneName}</span>
                        {b.isPrivate ? <span className="text-jade/80">幽</span> : null}
                    </p>
                    <p className="mt-1 font-serif text-sm leading-relaxed text-ink/90">{b.text}</p>
                    {b.inner ? (
                        <p className="mt-1 border-l border-hairline/60 pl-2 font-serif text-xs leading-relaxed text-mute/85">
                            {b.inner}
                        </p>
                    ) : null}
                </li>
            ))}
            {!items.length ? (
                <li className="px-1 font-serif text-sm leading-relaxed text-mute/70">
                    {emptyHint ?? '尚無一拍。點「走一拍」，看世界自己動。'}
                </li>
            ) : null}
        </ol>
    );
}
