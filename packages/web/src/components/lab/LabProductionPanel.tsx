'use client';

/**
 * 製作中 —— the emergent-production panel. A floating glass card on the main
 * stage, present only when a run has the 劇本產出 flag on and a play has begun.
 * Collapsed it is a slim chip (title + a rehearsal-progress bar); expanded it
 * shows who is making it, how much script + effort has banked, and the recent
 * lifecycle. Mirrors LabBeatDock's floating-glass idiom. Read-only — the engine
 * owns the accumulator; this only reflects it.
 */

import { useState } from 'react';
import type { LabProductionLive } from '@/lib/lab/live';

const STATUS_ZH: Record<LabProductionLive['status'], string> = {
    proposed: '立項招人',
    scripted: '撰戲文',
    rehearsing: '排練中',
    premiered: '已首演',
};

export function LabProductionPanel({ production }: { production: LabProductionLive }) {
    const [open, setOpen] = useState(false);
    const premiered = production.status === 'premiered';
    const pct = premiered
        ? 100
        : Math.min(100, Math.round((production.effort / Math.max(1, production.threshold)) * 100));
    const barTone = premiered ? 'bg-jade/80' : 'bg-cinnabar/70';

    return (
        <div className="pointer-events-auto absolute left-3 top-3 z-30 w-[min(20rem,calc(100%-1.5rem))] sm:left-5 sm:top-5">
            <div className="overflow-hidden rounded-xl border border-hairline bg-canvas/80 shadow-[0_4px_20px_rgba(20,12,8,0.14)] backdrop-blur-md dark:bg-black/60">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="flex w-full items-center gap-2 px-3 pt-2.5 text-left"
                    title="劇本產出：角色白日排的新戲，攢夠了便首演"
                >
                    <span className={`font-serif text-2xs tracking-[0.35em] ${premiered ? 'text-jade' : 'text-cinnabar/90'}`}>
                        {premiered ? '已首演' : '製作中'}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-serif text-xs tracking-[0.12em] text-ink/90">
                        《{production.title}》
                    </span>
                    <span aria-hidden className="text-mute/70">{open ? '▾' : '▴'}</span>
                </button>

                {/* rehearsal-progress bar — always visible, the at-a-glance state */}
                <div className="px-3 pb-2.5 pt-1.5">
                    <div className="flex items-baseline justify-between font-serif text-2xs tracking-[0.14em] text-mute">
                        <span>{STATUS_ZH[production.status]}</span>
                        <span>{premiered ? `積功 ${production.effort}` : `積功 ${production.effort}／${production.threshold}`}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/[0.08] dark:bg-white/10">
                        <div className={`h-full rounded-full ${barTone} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                </div>

                {open ? (
                    <div className="border-t border-hairline px-3 py-2.5">
                        <dl className="space-y-1.5 font-serif text-2xs tracking-[0.1em] text-mute">
                            <div className="flex gap-2">
                                <dt className="shrink-0 text-mute/70">成之者</dt>
                                <dd className="text-ink/85">
                                    {production.contributors.length
                                        ? production.contributors.map((c) => c.name).join('、')
                                        : '—'}
                                </dd>
                            </div>
                            <div className="flex gap-2">
                                <dt className="shrink-0 text-mute/70">戲文</dt>
                                <dd className="text-ink/85">{production.scriptFragments} 段</dd>
                            </div>
                            {production.premieredDay ? (
                                <div className="flex gap-2">
                                    <dt className="shrink-0 text-mute/70">首演</dt>
                                    <dd className="text-jade">第 {production.premieredDay} 日</dd>
                                </div>
                            ) : null}
                        </dl>

                        {production.timeline.length ? (
                            <ul className="mt-2 space-y-1 border-t border-hairline pt-2 font-serif text-2xs leading-relaxed text-ink/70">
                                {production.timeline.map((line, i) => (
                                    <li key={i} className="truncate" title={line}>· {line}</li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
