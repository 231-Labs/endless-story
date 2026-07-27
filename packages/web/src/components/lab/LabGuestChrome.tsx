'use client';

/**
 * LabGuestChrome — 看客頂欄：春雪社・日時 + 看戲／看世界／讀章回 + 次要入口。
 * 片場模式不使用此元件（導演頂欄仍在 LabRunPage）。
 */

import type { GuestViewMode } from './viewer-state';
import { LabGuestSecondary } from './LabGuestSecondary';

const MODES: Array<{ id: GuestViewMode; label: string }> = [
    { id: 'watch', label: '看戲' },
    { id: 'world', label: '看世界' },
    { id: 'read', label: '讀章回' },
];

export function LabGuestChrome({
    brand,
    clockLabel,
    mode,
    onModeChange,
    trackingName,
    cast = [],
}: {
    brand: string;
    clockLabel: string;
    mode: GuestViewMode;
    onModeChange: (mode: GuestViewMode) => void;
    trackingName?: string | null;
    cast?: Array<{ id: string; name: string; role?: string }>;
}) {
    return (
        <header className="relative z-20 border-b border-hairline/60 bg-surface/70 px-4 pb-3 pt-4 backdrop-blur-md dark:bg-elevated/50 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-serif text-2xs tracking-[0.45em] text-cinnabar/90">{brand}</p>
                    <h1 className="mt-1 truncate font-serif text-xl tracking-[0.12em] text-ink sm:text-2xl">
                        {clockLabel}
                    </h1>
                    {trackingName ? (
                        <p className="mt-1 font-serif text-2xs tracking-[0.28em] text-mute">追蹤 · {trackingName}</p>
                    ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                    <nav className="flex items-center gap-1" aria-label="觀看方式">
                        {MODES.map((m) => {
                            const active = mode === m.id;
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => onModeChange(m.id)}
                                    className={`px-3 py-2 font-serif text-sm tracking-[0.35em] transition ${
                                        active ? 'text-cinnabar' : 'text-mute hover:text-ink'
                                    }`}
                                    aria-current={active ? 'page' : undefined}
                                >
                                    {m.label}
                                </button>
                            );
                        })}
                    </nav>
                    <LabGuestSecondary cast={cast} />
                </div>
            </div>
        </header>
    );
}
