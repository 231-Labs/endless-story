'use client';

/**
 * 片場首頁 — the cinema-lab lobby: seed library (batch story configuration),
 * new-run commissioning, and the run shelf with fork lineage. Everything is
 * server-side + filesystem behind /api/lab; no chain, no wallet.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BeadCurtain, LabEaves } from '@/components/lab/LabOrnaments';
import { labApi } from '@/components/lab/useLab';
import type { LabRunSummary, LabSeasonSummary, LabSeedSummary } from '@/lib/lab/types';

export default function LabHomePage() {
    const router = useRouter();
    const [seeds, setSeeds] = useState<LabSeedSummary[]>([]);
    const [seasons, setSeasons] = useState<LabSeasonSummary[]>([]);
    const [runs, setRuns] = useState<LabRunSummary[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const [form, setForm] = useState({
        presetId: '',
        seedSource: 'builtin' as 'builtin' | 'custom',
        seasonId: '',
        title: '',
        llm: 'fake' as 'fake' | 'real',
        relationshipFallback: true,
        ticksPerDay: 6,
    });

    const load = useCallback(async () => {
        try {
            const [seedRes, runRes] = await Promise.all([labApi.seeds(), labApi.runs()]);
            setSeeds(seedRes.seeds);
            setSeasons(seedRes.seasons);
            setRuns(runRes.runs);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    useEffect(() => {
        void load();
        const t = setInterval(() => void load(), 8000);
        return () => clearInterval(t);
    }, [load]);

    const chosenSeed = useMemo(
        () => seeds.find((s) => s.id === form.presetId && s.source === form.seedSource),
        [seeds, form.presetId, form.seedSource],
    );

    const create = async () => {
        if (!chosenSeed) return;
        setCreating(true);
        setError(null);
        try {
            const { meta } = await labApi.createRun({
                title: form.title.trim() || `${chosenSeed.label ?? chosenSeed.id}`,
                config: {
                    presetId: chosenSeed.id,
                    seedSource: chosenSeed.source,
                    seasonId: form.seasonId || undefined,
                    llm: form.llm,
                    relationshipFallback: form.relationshipFallback,
                    ticksPerDay: form.ticksPerDay,
                },
            });
            router.push(`/lab/run/${meta.id}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setCreating(false);
        }
    };

    // 世系：children grouped under parents for the shelf
    const childrenOf = useMemo(() => {
        const m = new Map<string, LabRunSummary[]>();
        for (const run of runs) {
            if (run.meta.parentRunId) {
                const list = m.get(run.meta.parentRunId) ?? [];
                list.push(run);
                m.set(run.meta.parentRunId, list);
            }
        }
        return m;
    }, [runs]);

    return (
        <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
            {/* 簷下入場 */}
            <header className="relative pt-6">
                <LabEaves />
                <BeadCurtain className="-mt-2 h-20" />
                <div className="mt-4 text-center">
                    <p className="es-page-lead-eyebrow">endless story · 完全鏈下實驗場</p>
                    <h1 className="es-page-lead-title mt-1">片場 · Cinema Lab</h1>
                    <p className="mx-auto mt-3 max-w-xl font-serif text-sm leading-relaxed text-mute">
                        底層如戲：時間、位置、慾望、物件、因果，一拍一拍自己走。
                        表面如卷：你只展卷靜看，或在靜場時撥一撥物界。
                    </p>
                </div>
            </header>

            {error ? (
                <p className="mt-6 rounded-md border border-cinnabar/40 bg-cinnabar/5 px-3 py-2 font-serif text-sm text-cinnabar" role="alert">
                    {error}
                </p>
            ) : null}

            {/* 開新一卷 */}
            <section className="mt-10">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="font-serif text-lg tracking-[0.25em] text-ink">開新一卷</h2>
                    <Link href="/lab/seeds" className="font-serif text-2xs tracking-[0.3em] text-mute hover:text-cinnabar">
                        劇本館 · 撰改 seed →
                    </Link>
                </div>
                <p className="mt-1 font-serif text-xs text-mute/80">
                    選一部劇本（seed 批量帶入人物、場景、記憶與爭奪之物），點一盞燈。
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {seeds.map((seed) => {
                        const chosen = seed.id === form.presetId && seed.source === form.seedSource;
                        return (
                            <button
                                key={`${seed.source}/${seed.id}`}
                                type="button"
                                onClick={() => setForm({ ...form, presetId: seed.id, seedSource: seed.source })}
                                className={`es-choice-card p-4 text-left transition ${chosen ? 'border-cinnabar/70 ring-1 ring-cinnabar/40' : ''}`}
                            >
                                <p className="font-serif text-base tracking-[0.12em] text-ink">{seed.label ?? seed.id}</p>
                                <p className="mt-1 font-serif text-2xs tracking-[0.15em] text-mute">
                                    {seed.source === 'custom' ? '自撰 · ' : '館藏 · '}{seed.id}
                                </p>
                                <p className="mt-2 font-serif text-xs leading-relaxed text-ink/70">
                                    {seed.castCount} 名角 · {seed.sceneCount} 場景 · {seed.locationCount} 地界 · {seed.memoryCount} 條創世記憶
                                </p>
                                {seed.resources.length ? (
                                    <p className="mt-1 truncate font-serif text-2xs text-jade/90" title={seed.resources.join('、')}>
                                        爭：{seed.resources.join('、')}
                                    </p>
                                ) : null}
                            </button>
                        );
                    })}
                    {!seeds.length ? <p className="font-serif text-sm text-mute/70">未見劇本。</p> : null}
                </div>

                <div className="es-soft-panel mt-4 flex flex-wrap items-center gap-3 p-4">
                    <input
                        placeholder="這一卷之名（可空）"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        className="es-field w-56 px-3 py-2 text-sm"
                    />
                    <span className="inline-flex overflow-hidden rounded-full border border-hairline">
                        {(['fake', 'real'] as const).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => setForm({ ...form, llm: mode })}
                                className={`px-3 py-1.5 font-serif text-xs tracking-[0.2em] transition ${
                                    form.llm === mode ? 'bg-cinnabar text-white' : 'text-mute hover:text-ink'
                                }`}
                            >
                                {mode === 'fake' ? '排演' : '實錄'}
                            </button>
                        ))}
                    </span>
                    <label className="inline-flex items-center gap-1.5 font-serif text-xs text-mute">
                        <input
                            type="checkbox"
                            checked={form.relationshipFallback}
                            onChange={(e) => setForm({ ...form, relationshipFallback: e.target.checked })}
                        />
                        關係底稿
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-serif text-xs text-mute">
                        一日
                        <input
                            type="number"
                            min={2}
                            max={12}
                            value={form.ticksPerDay}
                            onChange={(e) => setForm({ ...form, ticksPerDay: Math.max(2, Math.min(12, Number(e.target.value) || 6)) })}
                            className="es-field w-14 px-2 py-1 text-center text-xs"
                        />
                        拍
                    </label>
                    {seasons.length ? (
                        <select
                            value={form.seasonId}
                            onChange={(e) => setForm({ ...form, seasonId: e.target.value })}
                            className="es-field px-2 py-1.5 text-xs"
                        >
                            <option value="">不掛季框</option>
                            {seasons.map((s) => (
                                <option key={`${s.source}/${s.id}`} value={s.id}>{s.title ?? s.id}</option>
                            ))}
                        </select>
                    ) : null}
                    <button
                        type="button"
                        disabled={!chosenSeed || creating}
                        onClick={() => void create()}
                        className="es-button-primary px-5 py-2 text-sm disabled:opacity-40"
                    >
                        {creating ? '點燈中…' : '點燈開拍'}
                    </button>
                    {form.llm === 'real' ? (
                        <span className="w-full font-serif text-2xs text-mute/75">
                            實錄需伺服端備一把文字模型鑰（ZAI / POE / ANTHROPIC）；一拍約數分鐘。排演零鑰即走，機制與實錄同一份。
                        </span>
                    ) : null}
                </div>
            </section>

            {/* 卷架 */}
            <section className="mt-12">
                <div className="flex items-baseline justify-between">
                    <h2 className="font-serif text-lg tracking-[0.25em] text-ink">卷架</h2>
                    <p className="font-serif text-2xs tracking-[0.2em] text-mute">{runs.length} 卷</p>
                </div>
                <div className="mt-4 space-y-3">
                    {runs.filter((r) => !r.meta.parentRunId).map((run) => (
                        <RunCard key={run.meta.id} run={run} childrenRuns={childrenOf.get(run.meta.id) ?? []} onChanged={load} />
                    ))}
                    {/* 孤兒分卷（父卷已刪）也要能看見 */}
                    {runs.filter((r) => r.meta.parentRunId && !runs.some((p) => p.meta.id === r.meta.parentRunId)).map((run) => (
                        <RunCard key={run.meta.id} run={run} childrenRuns={childrenOf.get(run.meta.id) ?? []} onChanged={load} />
                    ))}
                    {!runs.length ? (
                        <p className="font-serif text-sm leading-relaxed text-mute/70">
                            卷架尚空。上面選一部劇本，點燈開拍——第一卷會從創世記憶裡自己醒來。
                        </p>
                    ) : null}
                </div>
            </section>
        </main>
    );
}

function RunCard({
    run,
    childrenRuns,
    onChanged,
    depth = 0,
}: {
    run: LabRunSummary;
    childrenRuns: LabRunSummary[];
    onChanged: () => void;
    depth?: number;
}) {
    const s = run.status;
    return (
        <div style={{ marginLeft: depth ? depth * 18 : 0 }}>
            <div className="es-card flex flex-wrap items-center gap-3 p-4">
                <Link href={`/lab/run/${run.meta.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-serif text-base tracking-[0.1em] text-ink hover:text-cinnabar">
                        {run.meta.title}
                        {run.meta.parentRunId ? (
                            <span className="ml-2 font-serif text-2xs tracking-[0.15em] text-jade/90">
                                分卷 · 自第{run.meta.forkedAtTick ?? '?'}拍
                            </span>
                        ) : null}
                    </p>
                    <p className="mt-0.5 truncate font-serif text-2xs tracking-[0.12em] text-mute">
                        {run.meta.id} · {run.meta.config.presetId}
                        {run.meta.config.seasonId ? ` · 季:${run.meta.config.seasonId}` : ''} ·{' '}
                        {run.meta.config.llm === 'real' ? '實錄' : '排演'}
                    </p>
                </Link>
                {s ? (
                    <p className="shrink-0 font-serif text-xs tracking-[0.15em] text-ink/75">
                        第{s.day}日 · 第{s.tick}拍 · {s.partOfDay} · 心事 {s.liveWants} · 事件 {s.eventsTotal}
                    </p>
                ) : (
                    <p className="shrink-0 font-serif text-xs text-mute/70">未醒</p>
                )}
                <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 font-serif text-2xs tracking-[0.2em] ${
                        run.phase === 'running'
                            ? 'border-cinnabar/50 text-cinnabar'
                            : run.phase === 'error'
                                ? 'border-cinnabar/60 text-cinnabar'
                                : 'border-hairline text-mute'
                    }`}
                >
                    {run.phase === 'running' ? `走拍 ${run.pendingTicks}` : run.phase === 'error' ? '出錯' : '靜場'}
                </span>
                <button
                    type="button"
                    onClick={() => {
                        if (window.confirm(`焚毀「${run.meta.title}」？一卷連同記憶、章回、卷宗俱不可復。`)) {
                            void labApi.deleteRun(run.meta.id).then(onChanged).catch((e) => window.alert(String(e)));
                        }
                    }}
                    className="shrink-0 font-serif text-2xs tracking-[0.2em] text-mute/70 hover:text-cinnabar"
                >
                    焚
                </button>
            </div>
            {childrenRuns.map((child) => (
                <div key={child.meta.id} className="mt-2 border-l border-hairline/60 pl-3">
                    <RunCard run={child} childrenRuns={[]} onChanged={onChanged} depth={depth + 1} />
                </div>
            ))}
        </div>
    );
}
