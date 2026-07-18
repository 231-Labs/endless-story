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
import { IconBurn, IconGallery, IconSeed } from '@/components/lab/LabIcons';
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
                    <h1
                        className="es-page-lead-title mt-1"
                        title="底層如戲：時間、位置、慾望、物件、因果，一拍一拍自己走。表面如卷：展卷靜看，靜場撥物。"
                    >
                        片場 · Cinema Lab
                    </h1>
                    <p className="mx-auto mt-2 font-serif text-xs tracking-[0.3em] text-mute/80">底層如戲 · 表面如卷</p>
                </div>
            </header>

            {error ? (
                <p className="mt-6 rounded-md border border-cinnabar/40 bg-cinnabar/5 px-3 py-2 font-serif text-sm text-cinnabar" role="alert">
                    {error}
                </p>
            ) : null}

            {/* 開新一卷 */}
            <section className="mt-10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2
                        className="font-serif text-lg tracking-[0.25em] text-ink"
                        title="選一部劇本（seed 批量帶入人物、場景、記憶與爭奪之物），點一盞燈。"
                    >
                        開新一卷
                    </h2>
                    <span className="flex items-center gap-2">
                        <Link
                            href="/lab/seeds"
                            aria-label="劇本館"
                            title="劇本館 · 撰改 seed"
                            className="es-icon-button !h-9 !w-9 text-[15px]"
                        >
                            <IconSeed />
                        </Link>
                        <Link
                            href="/lab/assets"
                            aria-label="圖庫"
                            title="圖庫 · 人物與場景之圖"
                            className="es-icon-button !h-9 !w-9 text-[15px]"
                        >
                            <IconGallery />
                        </Link>
                    </span>
                </div>
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
                                    {seed.source === 'custom' ? '自撰' : '館藏'} · {seed.id}
                                </p>
                                <p
                                    className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-serif text-xs text-ink/75"
                                    title={`${seed.castCount} 名角 · ${seed.sceneCount} 場景 · ${seed.locationCount} 地界 · ${seed.memoryCount} 條創世記憶${seed.resources.length ? ` · 爭奪：${seed.resources.join('、')}` : ''}`}
                                >
                                    <span>角 {seed.castCount}</span>
                                    <span>景 {seed.sceneCount}</span>
                                    <span>界 {seed.locationCount}</span>
                                    <span>憶 {seed.memoryCount}</span>
                                    {seed.resources.length ? <span className="text-jade/90">爭 {seed.resources.length}</span> : null}
                                </p>
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
                    <label
                        className="inline-flex items-center gap-1.5 font-serif text-xs text-mute"
                        title="關係底稿：種入劇本裡的初始關係視角＋每夜自我整理（建議開）"
                    >
                        <input
                            type="checkbox"
                            checked={form.relationshipFallback}
                            onChange={(e) => setForm({ ...form, relationshipFallback: e.target.checked })}
                        />
                        關係底稿
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-serif text-xs text-mute" title="一日幾拍（時辰數）">
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
                        title={form.llm === 'real' ? '實錄：需伺服端備一把文字模型鑰（ZAI／POE／ANTHROPIC），一拍約數分鐘' : '排演：確定性假角，零鑰即走，機制與實錄同一份'}
                        className="es-button-primary px-5 py-2 text-sm disabled:opacity-40"
                    >
                        {creating ? '點燈中…' : '點燈開拍'}
                    </button>
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
                        <p className="font-serif text-sm text-mute/70" title="選一部劇本，點燈開拍——第一卷會從創世記憶裡自己醒來">
                            卷架尚空。
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
                    <p
                        className="flex shrink-0 gap-x-3 font-serif text-xs tracking-[0.15em] text-ink/75"
                        title={`第${s.day}日 · 第${s.tick}拍 · ${s.partOfDay} · ${s.liveWants} 樁活著的心事 · ${s.eventsTotal} 件已成之事`}
                    >
                        <span>日{s.day}</span>
                        <span>拍{s.tick}</span>
                        <span>{s.partOfDay}</span>
                        <span className="text-cinnabar/80">心{s.liveWants}</span>
                        <span className="text-jade/90">事{s.eventsTotal}</span>
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
                    aria-label={`焚毀「${run.meta.title}」`}
                    title="焚毀此卷（不可復）"
                    className="shrink-0 text-mute/60 transition hover:text-cinnabar"
                >
                    <IconBurn />
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
