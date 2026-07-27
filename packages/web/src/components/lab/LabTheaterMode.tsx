'use client';

/**
 * LabTheaterMode — 劇院模式：主鏡影片／劇照擴張播放，播完三選一。
 * 世界全景仍在背景；結束後把選擇交回父層。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyShot } from '@/lib/lab/daily-shot';

export type TheaterChoice = 'follow' | 'before' | 'world';

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function LabTheaterMode({
    shot,
    open,
    onClose,
    onChoice,
}: {
    shot: DailyShot;
    open: boolean;
    onClose: () => void;
    onChoice: (choice: TheaterChoice) => void;
}) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [playing, setPlaying] = useState(true);
    const [muted, setMuted] = useState(false);
    const [ended, setEnded] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        if (!open) {
            videoRef.current?.pause();
            setEnded(false);
            setPlaying(false);
            return;
        }
        setEnded(false);
        setPlaying(true);
        setTime(0);
        const v = videoRef.current;
        if (v) {
            v.currentTime = 0;
            void v.play().catch(() => {});
        }
    }, [open, shot.id]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const togglePlay = useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) void v.play();
        else v.pause();
    }, []);

    if (!open) return null;

    const prompts = shot.promptAfter ?? {
        followFocus: '從柳安春視角繼續',
        readBefore: '查看此事之前發生了什麼',
        backToWorld: '回到今日世界',
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/85 backdrop-blur-sm">
            <button type="button" className="absolute inset-0 cursor-default" aria-label="關閉劇院" onClick={onClose} />
            <div className="relative z-10 flex w-full max-w-5xl flex-col gap-4 px-4 sm:px-8">
                <div className="relative overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 aspect-video">
                    {shot.videoUrl ? (
                        <video
                            ref={videoRef}
                            key={shot.id}
                            src={shot.videoUrl}
                            poster={shot.posterUrl}
                            autoPlay
                            playsInline
                            muted={muted}
                            onPlay={() => setPlaying(true)}
                            onPause={() => setPlaying(false)}
                            onEnded={() => {
                                setEnded(true);
                                setPlaying(false);
                            }}
                            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                            className="h-full w-full object-cover"
                        />
                    ) : shot.posterUrl ? (
                        <img src={shot.posterUrl} alt="" className="h-full w-full object-cover" onLoad={() => setEnded(true)} />
                    ) : (
                        <div className="flex h-full items-center justify-center font-serif text-sm tracking-[0.35em] text-white/50">
                            尚無主鏡影片
                        </div>
                    )}

                    <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-4 sm:p-6">
                        <p className="font-serif text-lg text-white/90">{shot.title}</p>
                        <p className="mt-1 text-2xs tracking-[0.3em] text-white/60">第 {shot.day} 日</p>
                    </div>

                    {shot.videoUrl ? (
                        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent p-4 sm:p-6">
                            <button
                                type="button"
                                onClick={togglePlay}
                                className="font-serif text-xs tracking-[0.3em] text-white/90"
                            >
                                {playing ? '暫停' : '播放'}
                            </button>
                            <span className="font-mono text-2xs tabular-nums text-white/70">
                                {formatTime(time)} / {formatTime(duration || shot.durationSeconds || 0)}
                            </span>
                            <button
                                type="button"
                                onClick={() => setMuted((m) => !m)}
                                className="ml-auto font-serif text-xs tracking-[0.3em] text-white/90"
                            >
                                {muted ? '靜音' : '聲'}
                            </button>
                        </div>
                    ) : null}
                </div>

                {ended || !shot.videoUrl ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                        <ChoiceButton label={prompts.followFocus} onClick={() => onChoice('follow')} />
                        <ChoiceButton label={prompts.readBefore} onClick={() => onChoice('before')} />
                        <ChoiceButton label={prompts.backToWorld} onClick={() => onChoice('world')} />
                    </div>
                ) : (
                    <p className="text-center font-serif text-2xs tracking-[0.35em] text-white/50">
                        播畢後可選擇下一步
                    </p>
                )}
            </div>
        </div>
    );
}

function ChoiceButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="border border-white/25 bg-white/5 px-4 py-3 font-serif text-sm tracking-[0.28em] text-white/90 transition hover:border-cinnabar/70 hover:bg-cinnabar/20"
        >
            {label}
        </button>
    );
}
