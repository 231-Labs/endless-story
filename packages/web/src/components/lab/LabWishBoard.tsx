'use client';

/**
 * 願榜 —— the wish board. Gathers EVERY character's live 心事 into one place, so
 * the operator can read the whole troupe's desires at a glance: what each person
 * is set on right now, toward whom, and how hard it pulls. Sorted hottest-first
 * so the world's strongest currents surface at the top. Read-only aggregate of
 * the live snapshot's per-character wants — no new data, just a different lens.
 */

import { useMemo } from 'react';
import type { LabCharacterLive } from '@/lib/lab/types';

/** A want lifted out with its owner, for the flat hottest-first board. */
interface WishRow {
    charId: string;
    charName: string;
    portraitUrl?: string;
    desc: string;
    layer: string;
    tension: number;
    targetName?: string;
}

/** Layer → a subtle tint. 情/愛/戀 read warm (the emotional lines); 志/圖/業 read
 *  cinnabar (ambition/livelihood); everything else stays muted. */
function layerTone(layer: string): string {
    if (/情|愛|戀|慾|溫|眷/.test(layer)) return 'text-rose-400/90 border-rose-400/30 bg-rose-400/[0.07]';
    if (/志|圖|業|功|名|利|錢/.test(layer)) return 'text-cinnabar/90 border-cinnabar/30 bg-cinnabar/[0.07]';
    if (/恨|仇|怨|懼|怕/.test(layer)) return 'text-seal/90 border-seal/30 bg-seal/[0.08]';
    return 'text-mute border-hairline bg-ink/[0.04]';
}

export function LabWishBoard({
    characters,
    onSelectCharacter,
}: {
    characters: LabCharacterLive[];
    onSelectCharacter?: (characterId: string) => void;
}) {
    const nameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of characters) map.set(c.id, c.name);
        return map;
    }, [characters]);

    const rows = useMemo<WishRow[]>(() => {
        const out: WishRow[] = [];
        for (const c of characters) {
            for (const w of c.wants ?? []) {
                out.push({
                    charId: c.id,
                    charName: c.name,
                    portraitUrl: c.portraitUrl,
                    desc: w.desc,
                    layer: w.layer,
                    tension: w.tension,
                    targetName: w.target ? nameById.get(w.target) : undefined,
                });
            }
        }
        return out.sort((a, b) => b.tension - a.tension);
    }, [characters, nameById]);

    const withWants = characters.filter((c) => (c.wants?.length ?? 0) > 0).length;

    if (!rows.length) {
        return (
            <p className="mt-6 font-serif text-xs tracking-[0.2em] text-mute/70">
                此刻眾人心裡都還空著 —— 開拍後，各人的心事會在此收攏。
            </p>
        );
    }

    return (
        <div className="mt-5">
            <p className="font-serif text-2xs tracking-[0.28em] text-mute/70">
                {rows.length} 樁心事 · {withWants} 人 · 張力高者在前
            </p>
            <ul className="mt-3 space-y-1.5">
                {rows.map((row, i) => {
                    const pct = Math.max(4, Math.min(100, Math.round(row.tension * 100)));
                    return (
                        <li
                            key={`${row.charId}-${i}`}
                            className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-lg border border-hairline bg-canvas/70 px-3 py-2 backdrop-blur-sm transition hover:border-cinnabar/40 dark:bg-white/[0.03]"
                        >
                            {/* who */}
                            <button
                                type="button"
                                onClick={() => onSelectCharacter?.(row.charId)}
                                className="flex items-center gap-2 text-left"
                                title={`開 ${row.charName} 內頁`}
                            >
                                {row.portraitUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={row.portraitUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                                ) : (
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cinnabar/80 font-serif text-xs text-white">
                                        {row.charName.slice(0, 1)}
                                    </span>
                                )}
                                <span className="w-14 shrink-0 truncate font-serif text-2xs tracking-[0.1em] text-ink/85 transition group-hover:text-cinnabar">
                                    {row.charName}
                                </span>
                            </button>

                            {/* the wish */}
                            <div className="min-w-0">
                                <p className="truncate font-serif text-sm leading-snug text-ink/90" title={row.desc}>
                                    {row.desc}
                                    {row.targetName ? (
                                        <span className="ml-1.5 font-serif text-2xs text-mute">→ {row.targetName}</span>
                                    ) : null}
                                </p>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className={`shrink-0 rounded-sm border px-1.5 py-px font-serif text-[10px] tracking-[0.1em] ${layerTone(row.layer)}`}>
                                        {row.layer}
                                    </span>
                                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink/[0.07] dark:bg-white/10">
                                        <span
                                            className="block h-full rounded-full bg-cinnabar/60"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </span>
                                </div>
                            </div>

                            {/* tension figure */}
                            <span className="shrink-0 font-serif text-2xs tabular-nums text-mute/70">{row.tension.toFixed(2)}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
