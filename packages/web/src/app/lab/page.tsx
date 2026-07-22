'use client';

/**
 * 片場首頁 — the cinema-lab lobby, staged like a theatre door:
 * 簷下入場（飛簷＋珠簾）→ 點戲（seed 戲單海報牆：地界畫作為底、直書題名、
 * 主演名單，點中者蓋一方「點」印）→ 點戲台（開拍參數一列）→ 卷架（每一卷
 * 是一軸手卷：兩端卷杆、走拍時杆上有燈）。No chain, no wallet.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BeadCurtain, LabEaves } from '@/components/lab/LabOrnaments';
import { IconBurn, IconExhibit, IconGallery, IconSeed } from '@/components/lab/LabIcons';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { LAB_ICON_BUTTON } from '@/components/lab/LabPageHeader';
import { terrainArtFor } from '@/components/saga/handscroll/terrainArt';
import { useLabDialog } from '@/components/lab/LabDialog';
import { labApi } from '@/components/lab/useLab';
import { useToast } from '@/components/common/Toaster';
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
        emergentProduction: false,
        heartsCanFade: false,
        beatPicksWant: false,
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
            // the season picker value encodes "source/id" so custom frames resolve
            const [seasonSource, ...seasonRest] = form.seasonId ? form.seasonId.split('/') : [];
            const { meta } = await labApi.createRun({
                title: form.title.trim() || `${chosenSeed.label ?? chosenSeed.id}`,
                config: {
                    presetId: chosenSeed.id,
                    seedSource: chosenSeed.source,
                    seasonId: seasonRest.length ? seasonRest.join('/') : undefined,
                    seasonSource: seasonSource === 'custom' ? 'custom' : 'builtin',
                    llm: form.llm,
                    relationshipFallback: form.relationshipFallback,
                    emergentProduction: form.emergentProduction,
                    heartsCanFade: form.heartsCanFade,
                    beatPicksWant: form.beatPicksWant,
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
                {/* 印鍵一列在簾「下」的常流 —— 永不與珠簾相疊（與各分頁頂欄同律） */}
                <div className="mt-2 flex justify-end gap-2">
                    <ThemeToggle className={LAB_ICON_BUTTON} />
                    <Link
                        href="/lab/seeds"
                        aria-label="劇本館"
                        title="劇本館 · 撰改劇本與季框"
                        className={LAB_ICON_BUTTON}
                    >
                        <IconSeed />
                    </Link>
                    <Link
                        href="/lab/assets"
                        aria-label="圖庫"
                        title="圖庫 · 人物與場景之圖"
                        className={LAB_ICON_BUTTON}
                    >
                        <IconGallery />
                    </Link>
                    <Link
                        href="/lab/exhibits"
                        aria-label="展覽室"
                        title="展覽室 · 認領外來卷／實驗報告／自上展品"
                        className={LAB_ICON_BUTTON}
                    >
                        <IconExhibit />
                    </Link>
                </div>
                <div className="mt-2 text-center lg:-mt-6">
                    <p className="es-page-lead-eyebrow">endless story · 完全鏈下實驗場</p>
                    <h1
                        className="mt-1 font-serif text-xl tracking-[0.4em] text-ink sm:text-2xl"
                        title="底層如戲：時間、位置、慾望、物件、因果，一拍一拍自己走。表面如卷：展卷靜看，靜場撥物。"
                    >
                        Cinema Lab
                    </h1>
                    <p className="mx-auto mt-2 font-serif text-xs tracking-[0.3em] text-mute/80">底層如戲 · 表面如卷</p>
                </div>
            </header>

            {error ? (
                <p className="mt-6 rounded-lg bg-cinnabar/10 px-3 py-2 font-serif text-sm text-cinnabar" role="alert">
                    {error}
                </p>
            ) : null}

            {/* 點戲 —— 戲單海報牆 */}
            <section className="mt-10">
                <h2
                    className="font-serif text-lg tracking-[0.25em] text-ink"
                    title="點戲：選一張戲單（seed 批量帶入人物、場景、記憶與爭奪之物），中者蓋印。"
                >
                    點戲
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                    {seeds.map((seed) => {
                        const chosen = seed.id === form.presetId && seed.source === form.seedSource;
                        const art = (seed.locationNames ?? []).map((n) => terrainArtFor(n)).find(Boolean) ?? null;
                        const castNames = seed.castNames ?? [];
                        return (
                            <button
                                key={`${seed.source}/${seed.id}`}
                                type="button"
                                onClick={() => setForm({ ...form, presetId: seed.id, seedSource: seed.source })}
                                title={`${seed.label ?? seed.id} · ${seed.castCount} 名角 · ${seed.sceneCount} 場景 · ${seed.locationCount} 地界 · ${seed.memoryCount} 條創世記憶${seed.resources.length ? ` · 爭奪：${seed.resources.join('、')}` : ''}`}
                                className={`group relative aspect-[3/4] overflow-hidden rounded-xl text-left shadow-[0_2px_16px_rgba(20,12,8,0.18)] outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-cinnabar ${
                                    chosen
                                        ? 'shadow-[0_6px_30px_rgba(176,74,60,0.35)] ring-2 ring-cinnabar/70'
                                        : 'hover:shadow-[0_6px_28px_rgba(20,12,8,0.28)]'
                                }`}
                            >
                                {/* 底圖 —— 地界畫作；無畫者以紙面代 */}
                                {art ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={art}
                                        alt=""
                                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
                                    />
                                ) : (
                                    <span className="absolute inset-0 bg-gradient-to-b from-surface via-canvas to-surface dark:from-elevated dark:via-canvas dark:to-elevated" />
                                )}
                                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/15" />

                                {/* 直書題名 —— 戲單式 */}
                                <span className="absolute right-3 top-3 max-h-[62%] font-serif text-lg leading-snug tracking-[0.25em] text-white drop-shadow-md [writing-mode:vertical-rl] sm:text-xl">
                                    {seed.label ?? seed.id}
                                </span>

                                {/* 出處籤 */}
                                <span className="absolute left-3 top-3 rounded-sm bg-ink/55 px-1.5 py-0.5 font-serif text-2xs tracking-[0.2em] text-white/85 backdrop-blur-[2px] dark:bg-black/45">
                                    {seed.source === 'custom' ? '自撰' : '館藏'}
                                </span>

                                {/* 點戲之印 */}
                                {chosen ? (
                                    <span
                                        className="animate-stamp absolute left-3 top-11 flex h-10 w-10 -rotate-6 items-center justify-center rounded-sm bg-cinnabar font-serif text-xl text-white shadow-md"
                                        title="已點此戲"
                                    >
                                        點
                                    </span>
                                ) : null}

                                {/* 單底 —— 一句本事、主演名單、家底 */}
                                <span className="absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-8">
                                    {seed.premise ? (
                                        <span className="line-clamp-2 font-serif text-2xs leading-relaxed text-white/80">
                                            {seed.premise}
                                        </span>
                                    ) : null}
                                    {castNames.length ? (
                                        <span className="mt-1 block truncate font-serif text-2xs tracking-[0.1em] text-white/70">
                                            主演 {castNames.slice(0, 4).join('、')}
                                            {castNames.length > 4 ? ` 等${castNames.length}人` : ''}
                                        </span>
                                    ) : null}
                                    <span className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 font-serif text-2xs tracking-[0.1em] text-white/60">
                                        <span>角{seed.castCount}</span>
                                        <span>景{seed.sceneCount}</span>
                                        <span>界{seed.locationCount}</span>
                                        <span>憶{seed.memoryCount}</span>
                                        {seed.resources.length ? <span className="text-white/85">爭{seed.resources.length}</span> : null}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                    {!seeds.length ? <p className="col-span-full font-serif text-sm text-mute/70">未見戲單 —— 到劇本館撰一部。</p> : null}
                </div>

                {/* 點戲台 —— 開拍參數一列 */}
                <div className="es-lab-panel mt-5 flex flex-wrap items-center gap-3 p-4">
                    <input
                        placeholder={chosenSeed ? `這一卷之名（默認「${chosenSeed.label ?? chosenSeed.id}」）` : '先點一齣戲'}
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
                    <label
                        className="inline-flex items-center gap-1.5 font-serif text-xs text-mute"
                        title="劇本產出：角色白天抽空提議／入夥／寫戲／排練，攢夠了便首演（實驗，預設關）"
                    >
                        <input
                            type="checkbox"
                            checked={form.emergentProduction}
                            onChange={(e) => setForm({ ...form, emergentProduction: e.target.checked })}
                        />
                        劇本產出
                    </label>
                    {/* 叩門夜訪 / 借賒有據 / 尋人掛心 已畢業為常駐，不再需要開關 */}
                    <label
                        className="inline-flex items-center gap-1.5 font-serif text-xs text-mute"
                        title="情分會淡：久不相見的情願會慢慢淡去（記一筆心事、角色自己看著辦，引擎不收鑰匙也不拆相許）——去掉「種下的情永不死」，讓每卷情路走得不一樣（實驗，預設關）"
                    >
                        <input
                            type="checkbox"
                            checked={form.heartsCanFade}
                            onChange={(e) => setForm({ ...form, heartsCanFade: e.target.checked })}
                        />
                        情分會淡
                    </label>
                    <label
                        className="inline-flex items-center gap-1.5 font-serif text-xs text-mute"
                        title="執念自揀：把角色心裡所有的執念一次全攤在他眼前（只給火候、不給數字），讓他自己挑這一拍要推哪一件；熱度與了結跟著他真正推的那條走，而不是引擎替他選最熱的那條——更貼近「給現況與選擇、讓角色自主」的原則（實驗，預設關）"
                    >
                        <input
                            type="checkbox"
                            checked={form.beatPicksWant}
                            onChange={(e) => setForm({ ...form, beatPicksWant: e.target.checked })}
                        />
                        執念自揀
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
                            className="es-field max-w-56 px-2 py-1.5 text-xs"
                            title="季框：季目標＋契約紙＋天時＋（若帶 economy）簽約錢物理"
                        >
                            <option value="">不掛季框</option>
                            {seasons.map((s) => (
                                <option key={`${s.source}/${s.id}`} value={`${s.source}/${s.id}`}>
                                    {s.title ?? s.id}{s.source === 'custom' ? ' ·自撰' : ''}
                                </option>
                            ))}
                        </select>
                    ) : null}
                    <button
                        type="button"
                        disabled={!chosenSeed || creating}
                        onClick={() => void create()}
                        title={form.llm === 'real' ? '實錄：需伺服端備一把文字模型鑰（ZAI／POE／ANTHROPIC），一拍約數分鐘' : '排演：確定性假角，零鑰即走，機制與實錄同一份'}
                        className="es-button-primary ml-auto px-5 py-2 text-sm transition-shadow disabled:opacity-40 hover:shadow-[0_0_24px_rgba(176,74,60,0.45)]"
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
                        <p className="font-serif text-sm text-mute/70" title="點一齣戲，點燈開拍——第一卷會從創世記憶裡自己醒來">
                            卷架尚空。
                        </p>
                    ) : null}
                </div>
            </section>
        </main>
    );
}

/** 一卷 —— 卷軸樣：兩端卷杆夾一段紙身；走拍時杆頭有燈在呼吸。 */
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
    const dialog = useLabDialog();
    const toast = useToast();
    const s = run.status;
    const running = run.phase === 'running';
    const rod = running
        ? 'from-cinnabar/80 via-cinnabar/55 to-cinnabar/80'
        : 'from-ink/60 via-ink/35 to-ink/60 dark:from-white/25 dark:via-white/10 dark:to-white/25';
    return (
        <div style={{ marginLeft: depth ? depth * 18 : 0 }}>
            <div className="group relative flex items-stretch overflow-hidden rounded-lg shadow-[0_2px_14px_rgba(20,12,8,0.12)] transition-shadow duration-300 hover:shadow-[0_4px_22px_rgba(20,12,8,0.2)]">
                <span aria-hidden className={`relative w-2 shrink-0 bg-gradient-to-b ${rod}`}>
                    {running ? <span className="absolute left-1/2 top-1.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/90 animate-lab-live-dot" /> : null}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 bg-surface/85 px-4 py-3.5 dark:bg-elevated/45">
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
                        className={`shrink-0 rounded-full px-2 py-0.5 font-serif text-2xs tracking-[0.2em] ${
                            running
                                ? 'bg-cinnabar/10 text-cinnabar'
                                : run.phase === 'error'
                                    ? 'bg-cinnabar/15 text-cinnabar'
                                    : 'bg-ink/5 text-mute dark:bg-white/5'
                        }`}
                    >
                        {running ? `走拍 ${run.pendingTicks}` : run.phase === 'error' ? '出錯' : '靜場'}
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            void dialog
                                .confirm({
                                    title: `焚毀「${run.meta.title}」？`,
                                    body: '一卷連同記憶、章回、卷宗俱不可復。',
                                    confirmLabel: '焚',
                                    danger: true,
                                })
                                .then((ok) => {
                                    if (!ok) return;
                                    return labApi.deleteRun(run.meta.id).then(() => {
                                        toast('一卷成灰。', 'info');
                                        onChanged();
                                    });
                                })
                                .catch((e) => toast(String(e), 'error'));
                        }}
                        aria-label={`焚毀「${run.meta.title}」`}
                        title="焚毀此卷（不可復）"
                        className="shrink-0 text-mute/60 transition hover:text-cinnabar"
                    >
                        <IconBurn />
                    </button>
                </div>
                <span aria-hidden className={`w-2 shrink-0 bg-gradient-to-b ${rod}`} />
            </div>
            {childrenRuns.map((child) => (
                <div key={child.meta.id} className="mt-2 border-l border-hairline/60 pl-3">
                    <RunCard run={child} childrenRuns={[]} onChanged={onChanged} depth={depth + 1} />
                </div>
            ))}
        </div>
    );
}
