'use client';

/**
 * LabHandscroll — the cinema-lab's live scroll. Same visual grammar as the
 * reader-site SagaHandscroll (location oil columns, 團扇 scene fans, 題字流),
 * but fully props-driven: no server actions, no chain polling, no wallet.
 * The lab page owns the data (useLabLive) and passes it in.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Saga, SagaLocation, Scene } from '@endless-story/shared';
import { BlobImage } from '@/components/common/BlobImage';
import { FloatingStream } from '@/components/saga/handscroll/FloatingQuote';
import { SceneFan } from '@/components/saga/handscroll/SceneFan';
import { computeHandscrollLayout } from '@/components/saga/handscroll/handscrollLayout';
import { terrainArtFor } from '@/components/saga/handscroll/terrainArt';
import type { LabStreamLine } from '@/lib/lab/live';

/** 穩定偽隨機（djb2）——飄字的段數與落點由地界＋最新一拍決定：
 *  同一拍之內紋絲不動，新一拍落卷才換一口氣。 */
function hashStr(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
}

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

type FanFilter = 'occupied' | 'performing' | 'private';

export function LabHandscroll({ saga, scenes, locations, streams, artByLocationId, onSelectScene }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [filters, setFilters] = useState<Set<FanFilter>>(new Set());
    // 界籤摺扇：收合時只留「此刻所在」一枚小籤（油畫幾乎全裸），點開才展全戲目。
    // 選了地界不收——連跳是常態；點進畫裡（外點）或 Esc 才收。
    const [navOpen, setNavOpen] = useState(false);
    const [centerIdx, setCenterIdx] = useState(0);
    const navRef = useRef<HTMLDivElement>(null);

    // 跟著捲軸記「此刻視窗中央是哪一欄」——收合籤的名字由它決定。
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        let raf = 0;
        const measure = () => {
            raf = 0;
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
            setCenterIdx((prev) => (prev === nearest ? prev : nearest));
        };
        const onScroll = () => {
            if (!raf) raf = requestAnimationFrame(measure);
        };
        measure();
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', onScroll);
            cancelAnimationFrame(raf);
        };
    }, []);

    // 展開時：點到籤外（畫裡）或 Esc 即收。只在展開時掛，收合／unmount 清掉。
    useEffect(() => {
        if (!navOpen) return;
        const onDown = (e: PointerEvent) => {
            if (navRef.current && !navRef.current.contains(e.target as Node)) setNavOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setNavOpen(false);
        };
        window.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [navOpen]);

    const layout = useMemo(() => computeHandscrollLayout(locations, scenes), [locations, scenes]);
    const partOfDay = saga.worldTime?.partOfDay ?? 'noon';
    const wash = DAY_WASH[partOfDay] ?? DAY_WASH.noon;

    const toggleFilter = (f: FanFilter) =>
        setFilters((prev) => {
            const next = new Set(prev);
            if (next.has(f)) next.delete(f);
            else next.add(f);
            return next;
        });

    /** All active filters must hold (AND) — 篩的是「此刻要看的質地」. */
    const fanMatches = (scene: Scene): boolean => {
        if (filters.has('occupied') && !(scene.currentCharacterIds?.length ?? 0)) return false;
        if (filters.has('performing') && !scene.performance) return false;
        if (filters.has('private') && (scene.privacyLevel ?? 0) < 3) return false;
        return true;
    };

    const jumpToColumn = (index: number) => {
        const el = scrollRef.current;
        const column = el?.firstElementChild?.children[index] as HTMLElement | undefined;
        column?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    };

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
        <div className="relative h-full min-h-0">
            {/* 界籤摺扇 —— 收合只留「此刻所在」，點開才展全戲目與篩子。
                選了地界不收（連跳是常態）；點進畫裡或 Esc 才收。 */}
            <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-3">
                <div
                    ref={navRef}
                    className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-hairline/60 bg-surface/80 px-2 py-1 shadow-sm backdrop-blur-md no-scrollbar dark:bg-elevated/75"
                >
                    {navOpen ? (
                        <>
                            {layout.segments.map((seg, i) => (
                                <button
                                    key={seg.location.id}
                                    type="button"
                                    onClick={() => jumpToColumn(i)}
                                    title={`跳到 ${seg.location.name}`}
                                    className={`shrink-0 rounded-full px-2.5 py-0.5 font-serif text-2xs tracking-[0.15em] transition hover:text-cinnabar ${
                                        i === centerIdx ? 'text-ink/90' : 'text-mute'
                                    }`}
                                >
                                    {seg.location.name}
                                </button>
                            ))}
                            <span aria-hidden className="mx-1 h-3 w-px shrink-0 bg-hairline/70" />
                            {([
                                ['occupied', '有人', '只亮此刻有人的場景'],
                                ['performing', '上演', '只亮正走拍的場景'],
                                ['private', '幽', '只亮窗內私地'],
                            ] as Array<[FanFilter, string, string]>).map(([key, label, hint]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleFilter(key)}
                                    title={hint}
                                    className={`shrink-0 rounded-full px-2.5 py-0.5 font-serif text-2xs tracking-[0.2em] transition ${
                                        filters.has(key) ? 'bg-cinnabar text-white' : 'text-mute hover:text-ink'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </>
                    ) : (
                        <button
                            type="button"
                            aria-expanded={false}
                            onClick={() => setNavOpen(true)}
                            title="戲目與篩子——點開跳地界、篩場景"
                            className="group inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 font-serif text-2xs tracking-[0.15em] text-mute transition hover:text-ink"
                        >
                            <span className="text-ink/85">{layout.segments[centerIdx]?.location.name ?? '戲目'}</span>
                            {/* 篩子開著卻收了扇——留一顆硃點提醒「你看到的不是全部」 */}
                            {filters.size > 0 ? (
                                <span
                                    aria-hidden
                                    title="有篩子開著"
                                    className="h-1 w-1 shrink-0 rounded-full bg-cinnabar"
                                />
                            ) : null}
                            <span aria-hidden className="text-2xs text-mute/70 transition group-hover:text-ink/70">
                                ▾
                            </span>
                        </button>
                    )}
                </div>
            </div>

            <div
                ref={scrollRef}
                className="h-full min-h-0 touch-pan-x snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain no-scrollbar"
            >
            <div className="flex h-full w-max items-stretch">
                {layout.segments.map((seg) => {
                    const locScenes = seg.scenes.map((sp) => byId.get(sp.scene.id) ?? sp.scene);
                    const art = artByLocationId?.[seg.location.id] ?? terrainArtFor(seg.location.name);

                    // 飄字：隨機 1～2 段，橫軸落在左右兩翼（避開中軸的地名與界籤），
                    // 兩段時高低錯落一點點。段數與落點以 hash 定 —— 拍不動位不動。
                    const linesByScene = locScenes
                        .map((sc) => streams[sc.id] ?? [])
                        .filter((ls) => ls.length);
                    const quoteSegs: Array<{ key: string; lines: LabStreamLine[]; leftPct: number; topPct: number }> = [];
                    if (linesByScene.length) {
                        const seed = hashStr(`${seg.location.id}|${linesByScene[0][0]?.key ?? ''}`);
                        const canTwo = linesByScene.length > 1 || linesByScene[0].length >= 4;
                        const two = canTwo && (seed & 1) === 1;
                        const leftWing = 20 + ((seed >> 2) % 15); // 20–34%
                        const rightWing = 66 + ((seed >> 4) % 15); // 66–80%
                        const firstOnLeft = ((seed >> 6) & 1) === 0;
                        const top1 = 20 + ((seed >> 7) % 9); // 20–28%
                        const top2 = top1 + 6 + ((seed >> 9) % 5); // 低 6–10%
                        const [a, b] =
                            linesByScene.length > 1
                                ? [linesByScene[0], linesByScene[1]]
                                : [
                                      linesByScene[0].filter((_, i) => i % 2 === 0),
                                      linesByScene[0].filter((_, i) => i % 2 === 1),
                                  ];
                        quoteSegs.push({
                            key: 'q1',
                            lines: a,
                            leftPct: firstOnLeft ? leftWing : rightWing,
                            topPct: top1,
                        });
                        if (two && b.length) {
                            quoteSegs.push({
                                key: 'q2',
                                lines: b,
                                leftPct: firstOnLeft ? rightWing : leftWing,
                                topPct: top2,
                            });
                        }
                    }
                    return (
                        <div
                            key={seg.location.id}
                            className="flex h-full w-[clamp(320px,62vh,680px)] shrink-0 snap-center snap-always flex-col border-r border-black/[0.08] last:border-r-0 dark:border-white/[0.05]"
                        >
                            <div className="relative h-[clamp(210px,42vh,480px)] w-full shrink-0 overflow-hidden">
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
                                {quoteSegs.map((q) => (
                                    <FloatingStream key={q.key} lines={q.lines} leftPct={q.leftPct} topPct={q.topPct} />
                                ))}
                            </div>
                            <div className="flex w-full flex-1 min-h-0 flex-wrap content-start justify-center gap-x-4 gap-y-3 overflow-y-auto bg-canvas/30 px-3 pt-4 no-scrollbar">
                                {locScenes.length ? (
                                    locScenes.map((sc) => (
                                        <span
                                            key={sc.id}
                                            className={`transition-opacity duration-300 ${fanMatches(sc) ? 'opacity-100' : 'opacity-20'}`}
                                        >
                                            <SceneFan
                                                scene={sc}
                                                onSelect={onSelectScene}
                                                present={sc.currentCharacterIds?.length ?? 0}
                                            />
                                        </span>
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
        </div>
    );
}
