'use client';

/**
 * LabInterludeStrip — 折子卡。幕間小戲，獨立於拍流懸浮匣（大拍的地盤）之外，
 * 自成一條窄帶：誰、何時（HH:MM · 時辰）、捎話內容、角色回應。newest first。
 */

import type { LabInterludeLive } from '@/lib/lab/types';

function hm(realMs: number): string {
    const d = new Date(realMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function LabInterludeStrip({ interludes }: { interludes: LabInterludeLive[] }) {
    if (!interludes.length) return null;
    const recent = [...interludes].slice(-8).reverse();
    return (
        <div className="flex items-start gap-2 overflow-x-auto pb-1 no-scrollbar">
            {recent.map((it) => (
                <article
                    key={it.id}
                    title={it.stimuli.map((s) => s.text).join('；')}
                    className="w-56 shrink-0 rounded-lg border border-jade/25 bg-jade/[0.06] px-3 py-2 dark:bg-jade/[0.08]"
                >
                    <p className="flex items-center gap-1.5 font-serif text-2xs tracking-[0.15em] text-mute">
                        <span className="rounded-sm bg-jade/20 px-1 text-jade/90">折子</span>
                        <span className="truncate text-ink/90">{it.name}</span>
                        <span className="ml-auto shrink-0">{hm(it.realMs)} · {it.partOfDay}</span>
                    </p>
                    <p className="mt-1 line-clamp-2 font-serif text-xs leading-relaxed text-mute/90">
                        捎話「{it.stimuli.map((s) => s.text).join('、')}」
                    </p>
                    <p className="mt-0.5 line-clamp-2 font-serif text-xs leading-relaxed text-ink/90">
                        {it.response}
                    </p>
                </article>
            ))}
        </div>
    );
}
