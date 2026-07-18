'use client';

/**
 * LabBeatFeed — the live stream of what the world just did, three registers:
 *   言（beat）  someone spoke/acted in a scene — text + 心聲 + mechanical acts
 *   行（move）  someone walked — a slim trace line, not a card
 *   世（world） a clock-bound world event entered canon
 * 物件操作與銀錢動作以「物 ·」「錢 ·」小行綴在其拍之下 — 機制動作顯性化。
 */

import type { LabLiveBeat } from '@/lib/lab/types';

export function LabBeatFeed({ feed, emptyHint }: { feed: LabLiveBeat[]; emptyHint?: string }) {
    const items = [...feed].reverse();
    return (
        <ol className="space-y-2.5">
            {items.map((b) => {
                if (b.kind === 'move') {
                    return (
                        <li key={b.seq} className="animate-beat-in flex items-baseline gap-2 px-1">
                            <span aria-hidden className="font-serif text-2xs text-mute/70">行</span>
                            <p className="min-w-0 font-serif text-xs leading-relaxed text-mute">
                                <span className="text-ink/75">{b.name}</span> {b.text}
                            </p>
                        </li>
                    );
                }
                if (b.kind === 'world') {
                    return (
                        <li key={b.seq} className="animate-beat-in border-l-2 border-cinnabar/50 bg-cinnabar/5 px-3 py-2">
                            <p className="font-serif text-2xs tracking-[0.25em] text-cinnabar/90">
                                天時 · 第{b.day}日·{b.clock} · {b.sceneName}
                            </p>
                            <p className="mt-1 font-serif text-sm leading-relaxed text-ink/90">{b.text}</p>
                        </li>
                    );
                }
                return (
                    <li key={b.seq} className="animate-beat-in es-soft-panel px-3 py-2.5">
                        <p className="flex flex-wrap items-baseline gap-x-2 font-serif text-2xs tracking-[0.18em] text-mute">
                            <span className="text-ink/80">{b.name}</span>
                            <span>第{b.day}日·{b.clock}</span>
                            <span className="text-jade/90">{b.sceneName}</span>
                            {b.isPrivate ? <span className="text-jade/80">幽</span> : null}
                        </p>
                        <p className="mt-1 font-serif text-sm leading-relaxed text-ink/90">{b.text}</p>
                        {b.inner ? (
                            <p className="mt-1 border-l border-hairline/60 pl-2 font-serif text-xs leading-relaxed text-mute/85">
                                {b.inner}
                            </p>
                        ) : null}
                        {b.acts?.length ? (
                            <ul className="mt-1.5 space-y-0.5">
                                {b.acts.map((act, i) => (
                                    <li key={i} className="font-serif text-2xs leading-relaxed tracking-[0.06em] text-seal">
                                        {act}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </li>
                );
            })}
            {!items.length ? (
                <li className="px-1 font-serif text-sm leading-relaxed text-mute/70">
                    {emptyHint ?? '尚無一拍。點「走一拍」，看世界自己動。'}
                </li>
            ) : null}
        </ol>
    );
}
