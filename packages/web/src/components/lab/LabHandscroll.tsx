'use client';

/**
 * LabHandscroll — the cinema-lab's live scroll. Same visual grammar as the
 * reader-site SagaHandscroll (location oil columns, 團扇 scene fans, 題字流),
 * but fully props-driven: no server actions, no chain polling, no wallet.
 * The lab page owns the data (useLabLive) and passes it in.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { Saga, SagaLocation, Scene } from '@endless-story/shared';
import { BlobImage } from '@/components/common/BlobImage';
import { FloatingStream } from '@/components/saga/handscroll/FloatingQuote';
import { SceneFan } from '@/components/saga/handscroll/SceneFan';
import { computeHandscrollLayout } from '@/components/saga/handscroll/handscrollLayout';
import { terrainArtFor } from '@/components/saga/handscroll/terrainArt';
import type { LabStreamLine } from '@/lib/lab/live';

const DAY_WASH: Record<string, { color: string; opacity: number }> = {
    morning: { color: 'rgba(255,245,225,0.35)', opacity: 0.5 },
    noon: { color: 'rgba(255,250,235,0.25)', opacity: 0.4 },
    dusk: { color: 'rgba(200,110,70,0.5)', opacity: 0.55 },
    night: { color: 'rgba(70,80,130,0.6)', opacity: 0.55 },
};

interface Props {
    saga: Saga;
    scenes: Scene[];
    locations: SagaLocation[];
    streams: Record<string, LabStreamLine[]>;
    /** 圖庫 location art overrides (by location id); falls back to name-matched
     *  built-in oils, then plain paper. */
    artByLocationId?: Record<string, string>;
    onSelectScene: (sceneId: string) => void;
}

export function LabHandscroll({ saga, scenes, locations, streams, artByLocationId, onSelectScene }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const layout = useMemo(() => computeHandscrollLayout(locations, scenes), [locations, scenes]);
    const partOfDay = saga.worldTime?.partOfDay ?? 'noon';
    const wash = DAY_WASH[partOfDay] ?? DAY_WASH.noon;

    // Vertical wheel → horizontal column paging (same rAF tween as the reader
    // handscroll, minus the outer full-page snap handoff the lab doesn't have).
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        let isScrolling = false;
        let raf = 0;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
        const tween = (to: number) => {
            isScrolling = true;
            const from = el.scrollLeft;
            const delta = to - from;
            if (reducedMotion.matches || Math.abs(delta) < 1) {
                el.scrollLeft = to;
                isScrolling = false;
                return;
            }
            const prevSnap = el.style.scrollSnapType;
            el.style.scrollSnapType = 'none';
            const t0 = performance.now();
            const duration = 480;
            const step = (now: number) => {
                const t = Math.min(1, (now - t0) / duration);
                el.scrollLeft = from + delta * easeOut(t);
                if (t < 1) raf = requestAnimationFrame(step);
                else {
                    el.style.scrollSnapType = prevSnap;
                    isScrolling = false;
                }
            };
            raf = requestAnimationFrame(step);
        };
        const handleWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            const isDown = e.deltaY > 0;
            const maxLeft = el.scrollWidth - el.clientWidth;
            const atRight = el.scrollLeft >= maxLeft - 2;
            const atLeft = el.scrollLeft <= 2;
            if ((isDown && atRight) || (!isDown && atLeft)) return;
            e.preventDefault();
            if (isScrolling) return;
            const columns = Array.from(el.firstElementChild?.children ?? []) as HTMLElement[];
            if (!columns.length) return;
            const centre = el.scrollLeft + el.clientWidth / 2;
            let nearest = 0;
            let best = Infinity;
            columns.forEach((c, i) => {
                const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - centre);
                if (d < best) {
                    best = d;
                    nearest = i;
                }
            });
            const next = Math.min(columns.length - 1, Math.max(0, nearest + (isDown ? 1 : -1)));
            const col = columns[next];
            const left = Math.min(maxLeft, Math.max(0, col.offsetLeft + col.offsetWidth / 2 - el.clientWidth / 2));
            if (Math.abs(left - el.scrollLeft) < 1) return;
            tween(left);
        };
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            el.removeEventListener('wheel', handleWheel);
            cancelAnimationFrame(raf);
        };
    }, []);

    const byId = new Map(scenes.map((s) => [s.id, s]));

    return (
        <div
            ref={scrollRef}
            className="h-full min-h-0 flex-1 touch-pan-x snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain no-scrollbar"
        >
            <div className="flex h-full w-max items-stretch">
                {layout.segments.map((seg) => {
                    const locScenes = seg.scenes.map((sp) => byId.get(sp.scene.id) ?? sp.scene);
                    const art = artByLocationId?.[seg.location.id] ?? terrainArtFor(seg.location.name);
                    const streamScene = locScenes.find((sc) => streams[sc.id]?.length);
                    return (
                        <div
                            key={seg.location.id}
                            className="flex h-full w-[clamp(300px,58vh,640px)] shrink-0 snap-center snap-always flex-col border-r border-black/[0.08] last:border-r-0 dark:border-white/[0.05]"
                        >
                            <div className="relative h-[clamp(170px,34vh,380px)] w-full shrink-0 overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-b from-surface to-canvas dark:from-elevated/50 dark:to-canvas" />
                                {art ? (
                                    <BlobImage src={art} alt={seg.location.name} className="object-cover" sizes="(min-width: 640px) 640px, 100vw" />
                                ) : null}
                                <div
                                    className="pointer-events-none absolute inset-0 mix-blend-soft-light"
                                    style={{ background: wash.color, opacity: wash.opacity }}
                                />
                                <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap font-serif text-sm tracking-[0.4em] text-white/85 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
                                    {seg.location.name}
                                </span>
                                {streamScene ? (
                                    <FloatingStream lines={streams[streamScene.id]} leftPct={50} topPct={14} />
                                ) : null}
                            </div>
                            <div className="flex w-full flex-1 min-h-0 flex-wrap content-start justify-center gap-x-4 gap-y-3 overflow-y-auto bg-canvas/30 px-3 pt-4 no-scrollbar">
                                {locScenes.length ? (
                                    locScenes.map((sc) => (
                                        <SceneFan
                                            key={sc.id}
                                            scene={sc}
                                            onSelect={onSelectScene}
                                            present={sc.currentCharacterIds?.length ?? 0}
                                        />
                                    ))
                                ) : (
                                    <span className="pt-4 font-serif text-2xs tracking-[0.2em] text-mute/50">尚無場景</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
