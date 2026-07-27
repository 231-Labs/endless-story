'use client';

/**
 * LabFirstVisit — 陌生觀眾第一次進入的編排：
 * 外景標示 → 地點亮起 → 劇院主鏡 → 拉遠露出世界 → 「想跟著誰？」
 */

import { useEffect, useState } from 'react';
import type { DailyShot } from '@/lib/lab/daily-shot';
import { markFirstVisitDone } from './viewer-state';

type Phase = 'establishing' | 'spotlight' | 'theater-hint' | 'pullback' | 'ask';

export function LabFirstVisit({
    brand,
    clockLabel,
    locationName,
    shot,
    onEnterTheater,
    onDone,
}: {
    brand: string;
    clockLabel: string;
    locationName: string;
    shot: DailyShot | null;
    onEnterTheater: () => void;
    onDone: () => void;
}) {
    const [phase, setPhase] = useState<Phase>('establishing');

    useEffect(() => {
        if (phase !== 'establishing') return;
        const t = setTimeout(() => setPhase('spotlight'), 1800);
        return () => clearTimeout(t);
    }, [phase]);

    useEffect(() => {
        if (phase !== 'spotlight') return;
        const t = setTimeout(() => setPhase('theater-hint'), 1600);
        return () => clearTimeout(t);
    }, [phase]);

    const finish = (next?: () => void) => {
        markFirstVisitDone();
        next?.();
        onDone();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-canvas">
            <div
                aria-hidden
                className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ${
                    phase === 'pullback' || phase === 'ask' ? 'scale-100 opacity-50' : 'scale-110 opacity-70'
                } bg-[url('/hero/saga-day.webp')] dark:bg-[url('/hero/saga-night.webp')]`}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-transparent to-canvas/80" />

            <div className="relative z-10 flex max-w-lg flex-col items-center px-6 text-center">
                {(phase === 'establishing' || phase === 'spotlight' || phase === 'theater-hint') && (
                    <>
                        <p className="font-serif text-xs tracking-[0.5em] text-cinnabar animate-focus-in">
                            {brand}・{clockLabel}
                        </p>
                        {phase !== 'establishing' ? (
                            <p className="mt-8 font-serif text-lg tracking-[0.2em] text-ink animate-focus-in">
                                {locationName || '某處'}發生了一件事
                            </p>
                        ) : null}
                        {phase === 'theater-hint' ? (
                            <button
                                type="button"
                                onClick={() => {
                                    if (shot) {
                                        markFirstVisitDone();
                                        onEnterTheater();
                                        onDone();
                                    } else {
                                        setPhase('pullback');
                                    }
                                }}
                                className="mt-10 border border-hairline bg-surface/80 px-6 py-3 font-serif text-sm tracking-[0.35em] text-ink transition hover:border-cinnabar/50 hover:text-cinnabar"
                            >
                                {shot ? '觀看今日主鏡' : '進入世界'}
                            </button>
                        ) : null}
                    </>
                )}

                {phase === 'pullback' || phase === 'ask' ? (
                    <>
                        <p className="font-serif text-sm tracking-[0.35em] text-mute animate-focus-in">
                            世界仍在繼續。
                        </p>
                        <p className="mt-4 font-serif text-xl tracking-[0.2em] text-ink">你想跟著誰？</p>
                        <button
                            type="button"
                            onClick={() => finish()}
                            className="mt-10 font-serif text-xs tracking-[0.4em] text-cinnabar"
                        >
                            展開春雪社
                        </button>
                    </>
                ) : null}

                {phase === 'theater-hint' && !shot ? null : null}
            </div>

            {/* Auto-advance pullback when no shot path */}
            {phase === 'spotlight' && !shot ? (
                <AutoAdvance onFire={() => setPhase('pullback')} ms={2000} />
            ) : null}
            {phase === 'pullback' ? <AutoAdvance onFire={() => setPhase('ask')} ms={1200} /> : null}
        </div>
    );
}

function AutoAdvance({ onFire, ms }: { onFire: () => void; ms: number }) {
    useEffect(() => {
        const t = setTimeout(onFire, ms);
        return () => clearTimeout(t);
    }, [onFire, ms]);
    return null;
}
