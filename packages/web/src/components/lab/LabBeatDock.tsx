'use client';

/**
 * LabBeatDock — 拍流貼底橫帶：與手卷同向的一條「底片帶」，浮在第一屏底緣。
 * 每一拍是一格底片：毛玻璃質地、同一尺寸、無邊線；筆致以名前一點記色
 * （言＝朱砂、幽＝翠、世＝金、行＝墨）。懸停預覽全文，點按釘住展開
 * （心聲與機制動作也在展開時現身），再點收回。可折成一線細帶；
 * 名帖引也棲在帶上，底部只此一道 chrome。
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LabLiveBeat } from '@/lib/lab/types';

function toneDot(b: LabLiveBeat): string {
    if (b.kind === 'world') return 'bg-seal';
    if (b.kind === 'move') return 'bg-mute/60';
    return b.isPrivate ? 'bg-jade/80' : 'bg-cinnabar/80';
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
    const [hoverSeq, setHoverSeq] = useState<number | null>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    const lastSeq = feed.length ? feed[feed.length - 1].seq : 0;

    // 新箋落帶即追尾（使用者若正回看，追尾也只是輕輕帶到最新）
    useEffect(() => {
        const el = stripRef.current;
        if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    }, [lastSeq, open]);

    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
            <div className="pointer-events-auto bg-gradient-to-t from-canvas/90 via-canvas/55 to-transparent pb-1.5 pt-6">
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
                                className="mt-2 flex items-start gap-2.5 overflow-x-auto px-4 pb-1.5 no-scrollbar sm:px-8"
                            >
                                {feed.map((b) => {
                                    const expanded = pinnedSeq === b.seq || hoverSeq === b.seq;
                                    return (
                                        <article
                                            key={b.seq}
                                            onMouseEnter={() => setHoverSeq(b.seq)}
                                            onMouseLeave={() => setHoverSeq((s) => (s === b.seq ? null : s))}
                                            onClick={() => setPinnedSeq((s) => (s === b.seq ? null : b.seq))}
                                            title={pinnedSeq === b.seq ? '點收此格' : '點釘全文'}
                                            className={`animate-beat-in w-[300px] shrink-0 cursor-pointer rounded-lg bg-surface/45 px-3.5 py-2.5 shadow-[0_2px_14px_rgba(20,12,8,0.10)] backdrop-blur-md no-scrollbar dark:bg-white/[0.06] ${
                                                expanded ? 'max-h-[34vh] overflow-y-auto' : 'h-[8.5rem] overflow-hidden'
                                            }`}
                                        >
                                            <p className="flex items-baseline gap-x-2 truncate font-serif text-2xs tracking-[0.16em] text-mute">
                                                <span aria-hidden className={`h-1.5 w-1.5 shrink-0 self-center rounded-full ${toneDot(b)}`} />
                                                <span className="shrink-0 text-ink/90">{b.name}</span>
                                                <span className="shrink-0 text-jade/90">{b.sceneName}</span>
                                                <span className="shrink-0">{b.clock}</span>
                                                {b.isPrivate && b.kind !== 'world' ? <span className="shrink-0 text-jade/80">幽</span> : null}
                                            </p>
                                            <p className={`mt-1.5 font-serif text-sm leading-relaxed ${b.kind === 'move' ? 'text-mute' : 'text-ink/90'} ${expanded ? '' : 'line-clamp-3'}`}>
                                                {b.text}
                                            </p>
                                            {expanded && b.kind === 'beat' && b.inner ? (
                                                <p className="mt-1.5 border-l border-hairline/50 pl-2 font-serif text-xs leading-relaxed text-mute/85">
                                                    {b.inner}
                                                </p>
                                            ) : null}
                                            {expanded && b.kind === 'beat' && b.acts?.length ? (
                                                <p className="mt-1 font-serif text-2xs leading-relaxed tracking-[0.06em] text-seal">
                                                    {b.acts.join('　')}
                                                </p>
                                            ) : null}
                                        </article>
                                    );
                                })}
                                {!feed.length ? (
                                    <p className="px-1 py-2 font-serif text-xs text-mute/70">尚無一拍。點「走一拍」，看世界自己動。</p>
                                ) : null}
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </div>
        </div>
    );
}
