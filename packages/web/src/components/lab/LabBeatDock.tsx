'use client';

/**
 * LabBeatDock — 拍流的懸浮匣：浮在手卷右緣、可折。展開是一窄幅直簾
 * （固定寬、內部自捲，再長也不撐版面）；折起只剩一枚豎籤＋活點。
 * 手卷的橫向完整性由它讓路：折起時整幅畫卷無遮。
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LabBeatFeed } from './LabBeatFeed';
import type { LabLiveBeat } from '@/lib/lab/types';

export function LabBeatDock({ feed, running }: { feed: LabLiveBeat[]; running: boolean }) {
    const [open, setOpen] = useState(true);

    return (
        <div className="pointer-events-none absolute inset-y-3 right-3 z-30 flex items-start justify-end">
            <AnimatePresence mode="wait" initial={false}>
                {open ? (
                    <motion.aside
                        key="open"
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 24 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="pointer-events-auto flex max-h-full w-[min(86vw,330px)] flex-col overflow-hidden rounded-lg border border-hairline/70 bg-surface/85 shadow-lg backdrop-blur-md dark:bg-elevated/80"
                    >
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            title="折起拍流"
                            className="flex shrink-0 items-center justify-between border-b border-hairline/50 px-3.5 py-2 text-left"
                        >
                            <span className="font-serif text-2xs tracking-[0.35em] text-cinnabar/90">拍流</span>
                            <span className="flex items-center gap-2">
                                {running ? <span className="h-1.5 w-1.5 rounded-full bg-cinnabar animate-lab-live-dot" /> : null}
                                <span className="font-serif text-xs text-mute">»</span>
                            </span>
                        </button>
                        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 no-scrollbar">
                            <LabBeatFeed feed={feed} />
                        </div>
                    </motion.aside>
                ) : (
                    <motion.button
                        key="closed"
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.22 }}
                        type="button"
                        onClick={() => setOpen(true)}
                        title="展開拍流"
                        aria-label="展開拍流"
                        className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-full border border-hairline/70 bg-surface/85 px-2 py-3 shadow-md backdrop-blur-md transition hover:border-cinnabar/50 dark:bg-elevated/80"
                    >
                        {running ? <span className="h-1.5 w-1.5 rounded-full bg-cinnabar animate-lab-live-dot" /> : null}
                        <span className="font-serif text-2xs tracking-[0.2em] text-ink/85 [writing-mode:vertical-rl]">拍流</span>
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}
