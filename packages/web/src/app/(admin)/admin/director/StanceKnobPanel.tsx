'use client';

import { useEffect, useState, useTransition } from 'react';
import {
    getSagaStanceSnapshot,
    setSagaStanceAction,
    type StanceSnapshot,
} from '@/lib/actions/saga-stance';

type Stance = 'restrained' | 'tender' | 'consummate';

const STOPS: { key: Stance; label: string; note: string }[] = [
    { key: 'restrained', label: '克制', note: '含蓄留白，情止乎禮。genre 預設，文字最省。' },
    { key: 'tender', label: '溫存', note: '筆調轉暖，親近與眷戀可以明寫。' },
    { key: 'consummate', label: '盡致', note: '許幽微情事在窗內演成；公開層仍隱去，僅私密場景放行。' },
];

/**
 * 氣質旋鈕 — the backstage half of the read-only 規章 spectrum. Writes a local
 * override (no wallet/gas; prose-craft config, not on-chain) that
 * loadNarrativeProfile merges over the preset baseline from the next tick.
 */
export function StanceKnobPanel() {
    const [snap, setSnap] = useState<StanceSnapshot | null>(null);
    const [pick, setPick] = useState<Stance>('restrained');
    const [msg, setMsg] = useState('');
    const [ok, setOk] = useState<boolean | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        getSagaStanceSnapshot()
            .then((s) => {
                setSnap(s);
                setPick(s.stance);
            })
            .catch(() => {});
    }, []);

    const apply = (stance: Stance | null) => {
        setMsg('套用中…');
        setOk(null);
        startTransition(async () => {
            const res = await setSagaStanceAction({ stance });
            if (!res.ok) {
                setOk(false);
                setMsg(`FAIL ${res.error ?? ''}`);
                return;
            }
            setOk(true);
            setMsg(stance === null ? '已還原為劇本預設' : '已套用（下個 tick 生效）');
            if (res.snapshot) {
                setSnap(res.snapshot);
                setPick(res.snapshot.stance);
            }
        });
    };

    const presetLabel = snap
        ? STOPS.find((s) => s.key === snap.presetStance)?.label ?? snap.presetStance
        : '—';

    return (
        <div className="space-y-6">
            <div className="text-sm text-ink/80">
                目前生效：
                <span className="mx-1 font-serif text-cinnabar">
                    {snap ? STOPS.find((s) => s.key === snap.stance)?.label : '…'}
                </span>
                {snap?.overridden ? (
                    <span className="text-2xs tracking-widest text-mute">（後台覆寫 · 劇本預設為「{presetLabel}」）</span>
                ) : (
                    <span className="text-2xs tracking-widest text-mute">（劇本預設）</span>
                )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                {STOPS.map((s) => {
                    const active = pick === s.key;
                    return (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => setPick(s.key)}
                            className={`rounded-2xl border p-4 text-left transition-colors ${
                                active
                                    ? 'border-cinnabar/60 bg-cinnabar/5'
                                    : 'border-hairline/50 bg-canvas/40 hover:border-hairline'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-cinnabar' : 'border border-hairline bg-surface'}`}
                                />
                                <span className={`font-serif text-lg tracking-widest ${active ? 'text-cinnabar' : 'text-ink'}`}>
                                    {s.label}
                                </span>
                            </div>
                            <p className="mt-2 text-2xs leading-relaxed text-mute">{s.note}</p>
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    disabled={isPending || pick === snap?.stance}
                    onClick={() => apply(pick)}
                    className="rounded-full bg-cinnabar px-5 py-2 text-sm font-medium text-canvas transition-opacity disabled:opacity-40"
                >
                    套用氣質
                </button>
                <button
                    type="button"
                    disabled={isPending || !snap?.overridden}
                    onClick={() => apply(null)}
                    className="rounded-full border border-hairline/60 px-5 py-2 text-sm text-ink/80 transition-colors hover:border-hairline disabled:opacity-40"
                >
                    還原為劇本預設
                </button>
                {msg ? (
                    <span
                        className={`text-2xs tracking-widest ${
                            ok === false ? 'text-cinnabar' : ok ? 'text-jade' : 'text-mute'
                        }`}
                    >
                        {msg}
                    </span>
                ) : null}
            </div>
        </div>
    );
}
