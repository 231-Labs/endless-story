'use client';

/**
 * LabWatchPanel — 看戲：今日主鏡劇照（不自動出聲），點擊進劇院。
 */

import type { DailyShot } from '@/lib/lab/daily-shot';

export function LabWatchPanel({
    shot,
    brand,
    clockLabel,
    onEnterTheater,
}: {
    shot: DailyShot | null;
    brand: string;
    clockLabel: string;
    onEnterTheater: () => void;
}) {
    if (!shot) {
        return (
            <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-6">
                <div
                    aria-hidden
                    className="absolute inset-0 bg-cover bg-center opacity-40 dark:opacity-30 bg-[url('/hero/saga-day.webp')] dark:bg-[url('/hero/saga-night.webp')]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/70 to-canvas/30" />
                <div className="relative z-10 text-center">
                    <p className="font-serif text-2xs tracking-[0.45em] text-cinnabar">{brand}</p>
                    <h2 className="mt-3 font-serif text-2xl tracking-[0.15em] text-ink sm:text-3xl">{clockLabel}</h2>
                    <p className="mt-6 max-w-md font-serif text-sm leading-loose tracking-[0.18em] text-mute">
                        今日主鏡尚未掛上。世界仍在運轉——可先看世界或讀章回。
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <button
                type="button"
                onClick={onEnterTheater}
                className="group relative flex min-h-0 flex-1 flex-col items-stretch justify-end overflow-hidden text-left"
                aria-label={`播放今日主鏡：${shot.title}`}
            >
                <div
                    aria-hidden
                    className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.03]"
                    style={{
                        backgroundImage: `url(${shot.posterUrl || '/hero/saga-day.webp'})`,
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/55 to-transparent" />
                <div className="relative z-10 px-6 pb-10 pt-24 sm:px-10 sm:pb-14">
                    <p className="font-serif text-2xs tracking-[0.45em] text-cinnabar">今日主鏡</p>
                    <h2 className="mt-3 max-w-2xl font-serif text-3xl tracking-[0.12em] text-ink sm:text-4xl">
                        {shot.title}
                    </h2>
                    {shot.caption ? (
                        <p className="mt-4 max-w-xl font-serif text-sm leading-loose tracking-[0.12em] text-mute">
                            {shot.caption}
                        </p>
                    ) : null}
                    <p className="mt-8 font-serif text-xs tracking-[0.4em] text-ink/80 transition group-hover:text-cinnabar">
                        點擊進入劇院
                    </p>
                </div>
            </button>
        </div>
    );
}
