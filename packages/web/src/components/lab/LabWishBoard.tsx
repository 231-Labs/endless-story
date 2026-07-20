'use client';

/**
 * 願榜 —— the wish board. Gathers EVERY character's live 心事 into one place, so
 * the operator can read the whole troupe's desires at a glance: what each person
 * is set on right now, toward whom, and how hard it pulls. Read-only aggregate of
 * the live snapshot's per-character wants — no new data, just a different lens.
 *
 * 篩選 (filter) 依人 / 依種類 + 排序 (sort) 依濃度：pick one person and/or one 種類
 * to narrow the board, and flip the 濃度 (tension) order. 種類 splits a compound
 * layer (`愛/妒`) into atoms, so a want surfaces under BOTH 愛 and 妒.
 */

import { useMemo, useState } from 'react';
import type { LabCharacterLive } from '@/lib/lab/types';

/** A want lifted out with its owner, for the flat board. */
interface WishRow {
    charId: string;
    charName: string;
    portraitUrl?: string;
    desc: string;
    layer: string;
    /** the layer split into atoms（`愛/妒` → ['愛','妒']）for the 種類 filter. */
    kinds: string[];
    tension: number;
    targetName?: string;
}

const ALL = '__all__';

/** Split a compound layer into atomic 種類（tolerates / ／ · ・ 、 separators）. */
function layerAtoms(layer: string): string[] {
    return layer
        .split(/[/／·・、]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Layer → a subtle tint. 情/愛/戀 read warm (the emotional lines); 志/圖/業 read
 *  cinnabar (ambition/livelihood); everything else stays muted. */
function layerTone(layer: string): string {
    if (/情|愛|戀|慾|溫|眷/.test(layer)) return 'text-rose-400/90 border-rose-400/30 bg-rose-400/[0.07]';
    if (/志|圖|業|功|名|利|錢/.test(layer)) return 'text-cinnabar/90 border-cinnabar/30 bg-cinnabar/[0.07]';
    if (/恨|仇|怨|懼|怕/.test(layer)) return 'text-seal/90 border-seal/30 bg-seal/[0.08]';
    return 'text-mute border-hairline bg-ink/[0.04]';
}

const SELECT_CLS =
    'rounded-md border border-hairline bg-canvas/70 px-2 py-1 font-serif text-2xs tracking-[0.08em] text-ink/85 outline-none transition focus:border-cinnabar/50 dark:bg-white/[0.04]';

export function LabWishBoard({
    characters,
    onSelectCharacter,
}: {
    characters: LabCharacterLive[];
    onSelectCharacter?: (characterId: string) => void;
}) {
    const [person, setPerson] = useState<string>(ALL);
    const [kind, setKind] = useState<string>(ALL);
    const [desc, setDesc] = useState<boolean>(true); // 濃度 高→低 by default

    const nameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of characters) map.set(c.id, c.name);
        return map;
    }, [characters]);

    /** Every want, flattened (unfiltered) — the pool the options + board draw from. */
    const all = useMemo<WishRow[]>(() => {
        const out: WishRow[] = [];
        for (const c of characters) {
            for (const w of c.wants ?? []) {
                out.push({
                    charId: c.id,
                    charName: c.name,
                    portraitUrl: c.portraitUrl,
                    desc: w.desc,
                    layer: w.layer,
                    kinds: layerAtoms(w.layer),
                    tension: w.tension,
                    targetName: w.target ? nameById.get(w.target) : undefined,
                });
            }
        }
        return out;
    }, [characters, nameById]);

    /** 人 options — only those who actually carry a want, hottest person first. */
    const personOptions = useMemo(() => {
        const peak = new Map<string, { name: string; t: number }>();
        for (const r of all) {
            const cur = peak.get(r.charId);
            if (!cur || r.tension > cur.t) peak.set(r.charId, { name: r.charName, t: r.tension });
        }
        return [...peak.entries()]
            .sort((a, b) => b[1].t - a[1].t)
            .map(([id, v]) => ({ id, name: v.name }));
    }, [all]);

    /** 種類 options — distinct atoms across all layers, most common first. */
    const kindOptions = useMemo(() => {
        const count = new Map<string, number>();
        for (const r of all) for (const k of r.kinds) count.set(k, (count.get(k) ?? 0) + 1);
        return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }, [all]);

    /** Apply the two filters, then sort by 濃度 in the chosen direction. */
    const rows = useMemo<WishRow[]>(() => {
        const filtered = all.filter(
            (r) => (person === ALL || r.charId === person) && (kind === ALL || r.kinds.includes(kind)),
        );
        return filtered.sort((a, b) => (desc ? b.tension - a.tension : a.tension - b.tension));
    }, [all, person, kind, desc]);

    const peopleShown = new Set(rows.map((r) => r.charId)).size;
    const filtering = person !== ALL || kind !== ALL;

    if (!all.length) {
        return (
            <p className="mt-6 font-serif text-xs tracking-[0.2em] text-mute/70">
                此刻眾人心裡都還空著 —— 開拍後，各人的心事會在此收攏。
            </p>
        );
    }

    return (
        <div className="mt-5">
            {/* 篩選 + 排序 */}
            <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5" title="依人篩選">
                    <span aria-hidden className="font-serif text-2xs tracking-[0.2em] text-mute/60">依人</span>
                    <select className={SELECT_CLS} value={person} onChange={(e) => setPerson(e.target.value)}>
                        <option value={ALL}>全部（{personOptions.length}）</option>
                        {personOptions.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </label>
                <label className="flex items-center gap-1.5" title="依種類篩選（複合如「愛/妒」拆為原子）">
                    <span aria-hidden className="font-serif text-2xs tracking-[0.2em] text-mute/60">依種類</span>
                    <select className={SELECT_CLS} value={kind} onChange={(e) => setKind(e.target.value)}>
                        <option value={ALL}>全部（{kindOptions.length}）</option>
                        {kindOptions.map(([k, n]) => (
                            <option key={k} value={k}>{k}·{n}</option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    onClick={() => setDesc((d) => !d)}
                    title="依濃度排序"
                    className="flex items-center gap-1 rounded-md border border-hairline bg-canvas/70 px-2 py-1 font-serif text-2xs tracking-[0.12em] text-ink/80 transition hover:border-cinnabar/40 hover:text-cinnabar dark:bg-white/[0.04]"
                >
                    濃度 <span aria-hidden>{desc ? '高→低' : '低→高'}</span>
                </button>
                {filtering ? (
                    <button
                        type="button"
                        onClick={() => { setPerson(ALL); setKind(ALL); }}
                        title="清除篩選"
                        className="font-serif text-2xs tracking-[0.12em] text-mute/60 underline-offset-2 transition hover:text-cinnabar hover:underline"
                    >
                        清除
                    </button>
                ) : null}
                <span className="ml-auto font-serif text-2xs tracking-[0.2em] text-mute/70">
                    {rows.length} 樁 · {peopleShown} 人
                </span>
            </div>

            {!rows.length ? (
                <p className="mt-4 font-serif text-xs tracking-[0.2em] text-mute/70">此篩選下無心事 —— 換個人或種類看看。</p>
            ) : (
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
            )}
        </div>
    );
}
