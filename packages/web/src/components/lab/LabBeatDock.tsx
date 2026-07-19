'use client';

/**
 * LabBeatDock — 拍流貼底橫帶：與手卷同向的一條「底片帶」，浮在第一屏底緣。
 * 每一拍是一格底片：毛玻璃質地、同一尺寸、無邊線；筆致以名前一點記色
 * （言＝朱砂、幽＝翠、世＝金、行＝墨）。懸停時該格自底緣向上生長成一枚
 * 展開紗（絕對定位覆蓋，整排不動不跳），點按釘住、再點收回；
 * 心聲與機制動作只在展開時現身。可折成一線細帶；名帖引也棲在帶上。
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LabLiveBeat } from '@/lib/lab/types';

const SLIP_W = 300;
const SLIP_W_SHORT = 112; // 行蹤／天時「事籤」—— 瘦成一條，字待 hover 紗再現
const SLIP_H = 136; // 8.5rem — 底片格恆定高度
const OVERLAY_W_SHORT = 280; // 事籤的展開紗回到可讀寬度

function toneDot(b: LabLiveBeat): string {
    if (b.kind === 'world') return 'bg-seal';
    if (b.kind === 'move') return 'bg-mute/60';
    return b.isPrivate ? 'bg-jade/80' : 'bg-cinnabar/80';
}

function isEventSlip(b: LabLiveBeat): boolean {
    return b.kind === 'move' || b.kind === 'world';
}

/** 言箋寬、事籤瘦。 */
function slipW(b: LabLiveBeat): number {
    return isEventSlip(b) ? SLIP_W_SHORT : SLIP_W;
}

/** 展開紗的寬：事籤放寬到可讀，言箋同幅。 */
function overlayW(b: LabLiveBeat): number {
    return isEventSlip(b) ? OVERLAY_W_SHORT : SLIP_W;
}

/** 箋底分色：言＝紙面、行＝墨染、世＝金染。 */
function slipTint(b: LabLiveBeat): string {
    if (b.kind === 'world') return 'bg-seal/[0.14] dark:bg-seal/[0.10]';
    if (b.kind === 'move') return 'bg-ink/[0.05] dark:bg-white/[0.03]';
    return 'bg-surface/45 dark:bg-white/[0.06]';
}

function SlipHeader({ b }: { b: LabLiveBeat }) {
    return (
        <p className="flex items-baseline gap-x-2 truncate font-serif text-2xs tracking-[0.16em] text-mute">
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 self-center rounded-full ${toneDot(b)}`} />
            <span className="shrink-0 text-ink/90">{b.name}</span>
            <span className="shrink-0 text-jade/90">{b.sceneName}</span>
            <span className="shrink-0">{b.clock}</span>
            {b.isPrivate && b.kind !== 'world' ? <span className="shrink-0 text-jade/80">幽</span> : null}
        </p>
    );
}

export function LabBeatDock({
    feed,
    running,
    onCastClick,
}: {
    feed: LabLiveBeat[];
    running: boolean;
    onCastClick?: () => void;
}) {
    const [open, setOpen] = useState(true);
    const [pinnedSeq, setPinnedSeq] = useState<number | null>(null);
    /** 展開紗的錨位（相對 dock），量自被懸停那格的外框。 */
    const [overlay, setOverlay] = useState<{ seq: number; left: number; bottom: number } | null>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** 是否貼尾追新拍：只在使用者停在最右（最新）時追尾；一往回看即鬆手。 */
    const stickRef = useRef(true);
    const lastSeq = feed.length ? feed[feed.length - 1].seq : 0;

    const cancelHide = () => {
        if (hideTimer.current) {
            clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
    };

    const showOverlay = (seq: number, el: HTMLElement) => {
        cancelHide();
        const dock = dockRef.current;
        if (!dock) return;
        const dr = dock.getBoundingClientRect();
        const sr = el.getBoundingClientRect();
        setPinnedSeq((p) => (p === seq ? p : null));
        setOverlay({ seq, left: sr.left - dr.left, bottom: dr.bottom - sr.bottom });
    };

    /** 滑離後片刻再收 —— 給滑進展開紗本體留一口氣，不閃爍。 */
    const scheduleHide = () => {
        cancelHide();
        hideTimer.current = setTimeout(() => {
            setOverlay((o) => (o && o.seq === pinnedSeqRef.current ? o : null));
        }, 90);
    };
    // scheduleHide 的 timeout 裡要讀「當下」的釘住值，不吃閉包舊值
    const pinnedSeqRef = useRef<number | null>(null);
    pinnedSeqRef.current = pinnedSeq;

    // 新箋落帶即追尾 —— 但只在使用者停在最右時；正回看舊拍就不打擾
    useEffect(() => {
        if (!stickRef.current) return;
        const el = stripRef.current;
        if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    }, [lastSeq, open]);

    // PC 直輪即橫捲：一般滑鼠只有縱向滾輪，映成帶的左右捲，才回看得到先前的動作。
    // 監聽掛在整條 dock（不只 strip）—— 展開紗浮在 strip 之上會吃掉滾輪，掛 dock
    // 才不論游標在紗上或帶上都捲得動。到左右盡頭則放行給頁面（縱向雙屏 snap 照舊）。
    useEffect(() => {
        const dock = dockRef.current;
        if (!dock) return;
        const onWheel = (e: WheelEvent) => {
            const el = stripRef.current;
            if (!el) return;
            const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
            if (!delta) return;
            const maxLeft = el.scrollWidth - el.clientWidth;
            if (maxLeft <= 0) return;
            const atStart = el.scrollLeft <= 0;
            const atEnd = el.scrollLeft >= maxLeft - 1;
            if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return; // 盡頭放行
            e.preventDefault();
            el.scrollLeft += delta;
        };
        dock.addEventListener('wheel', onWheel, { passive: false });
        return () => dock.removeEventListener('wheel', onWheel);
    }, [open]);

    useEffect(() => cancelHide, []);

    const expandedBeat = overlay ? feed.find((x) => x.seq === overlay.seq) ?? null : null;

    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
            <div ref={dockRef} className="pointer-events-auto relative bg-gradient-to-t from-canvas/90 via-canvas/55 to-transparent pb-1.5 pt-6">
                {/* 帶首一线：拍流籤 + 活點 + 名帖引 */}
                <div className="flex items-center justify-between px-4 sm:px-8">
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        title={open ? '收起拍流' : '展開拍流'}
                        className="flex items-center gap-2 py-0.5 font-serif text-2xs tracking-[0.35em] text-cinnabar/90 transition hover:text-cinnabar"
                    >
                        拍流
                        {running ? <span className="h-1.5 w-1.5 rounded-full bg-cinnabar animate-lab-live-dot" /> : null}
                        <span aria-hidden className="text-mute/70">{open ? '▾' : '▴'}</span>
                    </button>
                    {onCastClick ? (
                        <button
                            type="button"
                            onClick={onCastClick}
                            title="下有名帖（人物內頁自此開）"
                            className="py-0.5 font-serif text-2xs tracking-[0.35em] text-mute/70 transition hover:text-cinnabar"
                        >
                            名帖 ▾
                        </button>
                    ) : null}
                </div>

                <AnimatePresence initial={false}>
                    {open ? (
                        <motion.div
                            key="strip"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                        >
                            <div
                                ref={stripRef}
                                onScroll={(e) => {
                                    // 帶一捲動，量好的錨位就作廢 —— 收紗（含釘住的）
                                    setOverlay(null);
                                    setPinnedSeq(null);
                                    // 停在最右才追新拍；往回看即鬆手（回到尾端會自動再貼上）
                                    const el = e.currentTarget;
                                    stickRef.current = el.scrollLeft >= el.scrollWidth - el.clientWidth - 24;
                                }}
                                className="mt-2 flex items-start gap-2.5 overflow-x-auto px-4 pb-1.5 no-scrollbar sm:px-8"
                            >
                                {feed.map((b) => (
                                    <article
                                        key={b.seq}
                                        onMouseEnter={(e) => showOverlay(b.seq, e.currentTarget)}
                                        onMouseLeave={scheduleHide}
                                        onClick={(e) => {
                                            showOverlay(b.seq, e.currentTarget);
                                            setPinnedSeq((s) => (s === b.seq ? null : b.seq));
                                        }}
                                        style={{ width: slipW(b), height: SLIP_H }}
                                        className={`animate-beat-in shrink-0 cursor-pointer overflow-hidden rounded-lg shadow-[0_2px_14px_rgba(20,12,8,0.10)] backdrop-blur-md ${slipTint(b)} ${
                                            isEventSlip(b) ? 'px-2 py-2' : 'px-3.5 py-2.5'
                                        }`}
                                    >
                                        {isEventSlip(b) ? (
                                            /* 事籤：只記「何時·何事·何人」，全文待 hover 紗 */
                                            <div className="flex h-full flex-col items-center justify-between">
                                                <span className="flex items-center gap-1.5 font-serif text-2xs tracking-[0.14em] text-mute">
                                                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${toneDot(b)}`} />
                                                    {b.clock}
                                                </span>
                                                <span aria-hidden className={`font-serif text-2xl ${b.kind === 'world' ? 'text-seal/75' : 'text-mute/60'}`}>
                                                    {b.kind === 'world' ? '世' : '行'}
                                                </span>
                                                <span className="max-w-full truncate font-serif text-2xs tracking-[0.12em] text-ink/80">
                                                    {b.kind === 'world' ? b.sceneName : b.name}
                                                </span>
                                            </div>
                                        ) : (
                                            <>
                                                <SlipHeader b={b} />
                                                <p className="mt-1.5 line-clamp-3 font-serif text-sm leading-relaxed text-ink/90">
                                                    {b.text}
                                                </p>
                                            </>
                                        )}
                                    </article>
                                ))}
                                {!feed.length ? (
                                    <p className="px-1 py-2 font-serif text-xs text-mute/70">尚無一拍。點「走一拍」，看世界自己動。</p>
                                ) : null}
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                {/* 展開紗 —— 錨在該格底緣、向上生長；覆蓋而不推擠，整排安然不動 */}
                <AnimatePresence>
                    {overlay && expandedBeat ? (
                        <motion.article
                            key={overlay.seq}
                            initial={{ height: SLIP_H, opacity: 0.85 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: SLIP_H, opacity: 0 }}
                            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                            style={{ left: overlay.left, bottom: overlay.bottom, width: overlayW(expandedBeat) }}
                            onMouseEnter={cancelHide}
                            onMouseLeave={scheduleHide}
                            onClick={() => setPinnedSeq((s) => (s === overlay.seq ? null : overlay.seq))}
                            title={pinnedSeq === overlay.seq ? '點收此格' : '點釘住'}
                            className="absolute z-20 min-h-[8.5rem] cursor-pointer overflow-hidden rounded-lg bg-surface/95 px-3.5 py-2.5 shadow-[0_-4px_28px_rgba(20,12,8,0.22)] backdrop-blur-lg dark:bg-elevated/95"
                        >
                            <div className="max-h-[32vh] overflow-y-auto no-scrollbar">
                                <SlipHeader b={expandedBeat} />
                                <p className={`mt-1.5 font-serif text-sm leading-relaxed ${expandedBeat.kind === 'move' ? 'text-mute' : 'text-ink/90'}`}>
                                    {expandedBeat.text}
                                </p>
                                {expandedBeat.kind === 'beat' && expandedBeat.inner ? (
                                    <p className="mt-1.5 border-l border-hairline/50 pl-2 font-serif text-xs leading-relaxed text-mute/85">
                                        {expandedBeat.inner}
                                    </p>
                                ) : null}
                                {expandedBeat.kind === 'beat' && expandedBeat.acts?.length ? (
                                    <p className="mt-1 font-serif text-2xs leading-relaxed tracking-[0.06em] text-seal">
                                        {expandedBeat.acts.join('　')}
                                    </p>
                                ) : null}
                            </div>
                        </motion.article>
                    ) : null}
                </AnimatePresence>
            </div>
        </div>
    );
}
