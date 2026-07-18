'use client';

/**
 * LabBeatDock — 拍流貼底橫帶：與手卷同向的一條題跋帶，浮在第一屏底緣。
 * 無框線 — 一層由透明落向紙色的紗、頂緣一絲髮線；每一拍是一枚「箋」，
 * 只以左緣色籤記筆致（言＝朱砂、行＝墨、世＝金），新箋自右滑入、自動追尾。
 * 可折成一線細帶；名帖引也棲在帶上，底部只此一道 chrome。
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LabLiveBeat } from '@/lib/lab/types';

function slipTone(b: LabLiveBeat): string {
    if (b.kind === 'world') return 'border-l-seal';
    if (b.kind === 'move') return 'border-l-mute/50';
    return b.isPrivate ? 'border-l-jade/60' : 'border-l-cinnabar/70';
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
                                className="mt-2 flex items-start gap-3 overflow-x-auto px-4 pb-1.5 no-scrollbar sm:px-8"
                            >
                                {feed.map((b) => (
                                    <article
                                        key={b.seq}
                                        className={`animate-beat-in max-h-[34vh] w-[340px] shrink-0 overflow-y-auto border-l-2 no-scrollbar ${slipTone(b)} bg-ink/[0.02] px-3.5 py-2.5 backdrop-blur-[1.5px] dark:bg-white/[0.025]`}
                                    >
                                        <p className="flex items-baseline gap-x-2 truncate font-serif text-2xs tracking-[0.16em] text-mute">
                                            <span className="shrink-0 text-ink/90">{b.name}</span>
                                            <span className="shrink-0 text-jade/90">{b.sceneName}</span>
                                            <span className="shrink-0">{b.clock}</span>
                                            {b.isPrivate && b.kind !== 'world' ? <span className="shrink-0 text-jade/80">幽</span> : null}
                                        </p>
                                        <p className={`mt-1.5 font-serif text-sm leading-relaxed ${b.kind === 'move' ? 'text-mute' : 'text-ink/90'}`}>
                                            {b.text}
                                        </p>
                                        {b.kind === 'beat' && b.inner ? (
                                            <p className="mt-1.5 border-l border-hairline/50 pl-2 font-serif text-xs leading-relaxed text-mute/85">
                                                {b.inner}
                                            </p>
                                        ) : null}
                                        {b.kind === 'beat' && b.acts?.length ? (
                                            <p className="mt-1 font-serif text-2xs leading-relaxed tracking-[0.06em] text-seal">
                                                {b.acts.join('　')}
                                            </p>
                                        ) : null}
                                    </article>
                                ))}
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
