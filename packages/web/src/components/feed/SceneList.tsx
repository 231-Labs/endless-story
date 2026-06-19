'use client';

import { useState } from 'react';
import { moodLabel, type XiZheScene } from '@/lib/feed/xizhe-format';

/**
 * 分場 as a clickable accordion — each 折 opens to its 劇本 (科介 / 念白 / 唱).
 * The 唱 lines (the 唱段) are set in cinnabar serif so the 唱詞 stands out from
 * spoken 念白. Scenes with no 劇本 (older blobs) render as a flat, non-clickable row.
 */
export function SceneList({ scenes }: { scenes: XiZheScene[] }) {
    const [open, setOpen] = useState<number | null>(null);

    return (
        <div className="mt-5 divide-y divide-hairline/30 border-y border-hairline/30">
            {scenes.map((s) => {
                const hasScript = s.lines.length > 0;
                const isOpen = open === s.n && hasScript;
                return (
                    <div key={s.n}>
                        <button
                            type="button"
                            onClick={() => hasScript && setOpen(isOpen ? null : s.n)}
                            disabled={!hasScript}
                            aria-expanded={isOpen}
                            className="flex w-full items-center gap-3 py-3 text-left transition-colors enabled:hover:text-cinnabar disabled:cursor-default"
                        >
                            <span className="text-2xs text-mute/50">{String(s.n).padStart(2, '0')}</span>
                            <span className="font-serif text-base text-ink">〈{s.title}〉</span>
                            {moodLabel(s.mood) ? (
                                <span className="text-2xs text-cinnabar/70">{moodLabel(s.mood)}</span>
                            ) : null}
                            {hasScript ? (
                                <span className="ml-auto flex items-center gap-1.5 text-2xs tracking-widest text-mute/60">
                                    {isOpen ? '收起' : '展開戲文'}
                                    <span aria-hidden className={isOpen ? 'rotate-90 transition-transform' : 'transition-transform'}>
                                        ›
                                    </span>
                                </span>
                            ) : null}
                        </button>
                        {isOpen ? (
                            <div className="space-y-2 pb-5 pl-7 pr-1">
                                {s.lines.map((l, i) =>
                                    l.type === 'stage' ? (
                                        <p key={i} className="text-sm italic leading-relaxed text-mute/70">
                                            （科介）{l.text}
                                        </p>
                                    ) : (
                                        <p key={i} className="leading-relaxed">
                                            <span className="text-sm text-mute">{l.who}</span>
                                            <span
                                                className={
                                                    l.type === 'sing' ? 'text-sm text-cinnabar' : 'text-sm text-mute/60'
                                                }
                                            >
                                                {l.type === 'sing' ? '（唱）' : '（白）'}
                                            </span>
                                            <span
                                                className={
                                                    l.type === 'sing'
                                                        ? 'font-serif text-base text-ink'
                                                        : 'text-base text-ink/85'
                                                }
                                            >
                                                {l.text}
                                            </span>
                                        </p>
                                    ),
                                )}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
