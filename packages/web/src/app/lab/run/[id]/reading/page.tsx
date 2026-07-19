'use client';

/**
 * 讀卷處 — the reading room of one run, re-planned (batch 4):
 * 共用簷下頂欄（日夜鍵在列）＋五道計數籤頁 ——
 *   卷宗  event dossiers（客觀×多視角，點入獨立卷宗頁）
 *   章回  woven tick chapters ＋ day episodes（按日分節，進頁自展最新一回）
 *   眾聲  單角 POV 原料（按日分節，同一閱讀面）
 *   拍案  raw tick timeline（按日分節，摘要成籤，末拍自展）
 *   選集  season editorial anthology
 * 左列右讀：清單永在左，讀面永在右（窄屏縱疊）。
 */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Markdown } from '@/components/common/Markdown';
import { LabPageHeader } from '@/components/lab/LabPageHeader';
import { labApi } from '@/components/lab/useLab';
import type { LabTickRecord } from '@/lib/lab/types';

type Mode = 'dossiers' | 'chapters' | 'voices' | 'ticks' | 'anthology';

interface ArchiveEntry {
    file: string;
    kind: string;
    day: number;
    tick: number;
    slug: string;
}

/** 按日分組（保持原序）。 */
function groupByDay<T extends { day: number }>(items: T[]): Array<{ day: number; items: T[] }> {
    const out: Array<{ day: number; items: T[] }> = [];
    for (const it of items) {
        const last = out[out.length - 1];
        if (last && last.day === it.day) last.items.push(it);
        else out.push({ day: it.day, items: [it] });
    }
    return out;
}

export default function LabReadingPage({ params }: { params: Promise<{ id: string }> }) {
    // page params keep their percent-encoding; run ids may contain CJK
    const { id: rawId } = use(params);
    const id = decodeURIComponent(rawId);
    const [mode, setMode] = useState<Mode>('dossiers');
    const [error, setError] = useState<string | null>(null);

    const [dossiers, setDossiers] = useState<Array<{ slug: string; title: string; day: number; scene: string; perspectives: string[] }>>([]);
    const [anthology, setAnthology] = useState<string | undefined>();
    const [entries, setEntries] = useState<ArchiveEntry[]>([]);
    const [openFile, setOpenFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string>('');
    const [records, setRecords] = useState<LabTickRecord[]>([]);

    const load = useCallback(async () => {
        try {
            const [dossierRes, archiveRes, tickRes] = await Promise.all([
                labApi.dossiers(id),
                labApi.archive(id),
                labApi.ticks(id, 60),
            ]);
            setDossiers(dossierRes.dossiers);
            setAnthology(dossierRes.editorial.anthology);
            setEntries(archiveRes.entries as ArchiveEntry[]);
            setRecords(tickRes.records);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    const openArchive = useCallback(async (file: string) => {
        setOpenFile(file);
        setFileContent('');
        try {
            const { content } = await labApi.archiveFile(id, file);
            setFileContent(content);
        } catch (e) {
            setFileContent(`讀取失敗：${e instanceof Error ? e.message : String(e)}`);
        }
    }, [id]);

    const chapters = entries.filter((e) => e.kind === 'chapter' || e.kind === 'episode');
    const povs = entries.filter((e) => e.kind === 'pov');

    // 進「章回」自展最新一回；進「眾聲」自展最新一聲 —— 讀面不空等
    useEffect(() => {
        const pool = mode === 'chapters' ? chapters : mode === 'voices' ? povs : null;
        if (!pool?.length) return;
        if (openFile && pool.some((e) => e.file === openFile)) return;
        void openArchive(pool[pool.length - 1].file);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, entries.length]);

    const tabs: Array<{ key: Mode; label: string; count?: number; tip: string }> = [
        { key: 'dossiers', label: '卷宗', count: dossiers.length, tip: '公開事件湊足兩份以上的視角，立一卷（客觀 × 眾說）' },
        { key: 'chapters', label: '章回', count: chapters.length, tip: '織回（多事件成章）與日終（一日收束）' },
        { key: 'voices', label: '眾聲', count: povs.length, tip: '單角 POV 原料 —— 章回由此織成' },
        { key: 'ticks', label: '拍案', count: records.length, tip: '逐拍流水：客觀之拍 × 各自所見' },
        { key: 'anthology', label: '選集', tip: '季度編輯自全部卷宗揀出值得留名的事件，織成一冊' },
    ];

    /** 左列右讀的清單＋讀面（章回／眾聲共用）。 */
    const listReader = (pool: ArchiveEntry[], empty: string) => (
        <section className="mt-6 grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
            <div className="max-h-[68vh] overflow-y-auto no-scrollbar">
                {groupByDay(pool).map((g) => (
                    <div key={g.day} className="mb-4">
                        <p className="px-1 font-serif text-2xs tracking-[0.35em] text-mute">第{g.day}日</p>
                        <ul className="mt-1.5 space-y-1">
                            {g.items.map((e) => (
                                <li key={e.file}>
                                    <button
                                        type="button"
                                        onClick={() => void openArchive(e.file)}
                                        className={`flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left font-serif text-xs transition ${
                                            openFile === e.file ? 'bg-cinnabar/10 text-ink' : 'text-mute hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5'
                                        }`}
                                    >
                                        <span
                                            className={`shrink-0 rounded-sm px-1 py-0.5 text-2xs tracking-[0.2em] ${
                                                e.kind === 'chapter'
                                                    ? 'bg-cinnabar/85 text-white'
                                                    : e.kind === 'episode'
                                                        ? 'bg-seal/80 text-white'
                                                        : 'bg-ink/10 text-mute dark:bg-white/10'
                                            }`}
                                        >
                                            {e.kind === 'chapter' ? '織' : e.kind === 'episode' ? '日' : '聲'}
                                        </span>
                                        <span className="min-w-0 truncate tracking-[0.06em]">
                                            第{e.tick}拍 · {e.slug}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
                {!pool.length ? <p className="px-1 font-serif text-xs text-mute/60">{empty}</p> : null}
            </div>
            <article className="es-lab-panel min-h-[40vh] max-h-[68vh] overflow-y-auto p-5 no-scrollbar sm:p-7">
                {openFile ? (
                    <Markdown source={fileContent || '展卷中…'} className="chapter-prose" />
                ) : (
                    <p className="font-serif text-sm text-mute/70">左手邊揀一卷。</p>
                )}
            </article>
        </section>
    );

    return (
        <main className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
            <LabPageHeader
                eyebrow="片場 · 讀卷處"
                title="卷宗與章回"
                titleTip="一卷世界的全部文本：事件卷宗（客觀×眾說）、織回與日終、單角原料、逐拍流水、季選集。"
                backHref={`/lab/run/${id}`}
                backTitle="回觀測台"
            >
                <nav className="mt-5 flex gap-1 overflow-x-auto no-scrollbar">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setMode(t.key)}
                            title={t.tip}
                            className={`shrink-0 rounded-full px-4 py-1.5 font-serif text-xs tracking-[0.25em] transition ${
                                mode === t.key ? 'bg-cinnabar text-white shadow-[0_2px_12px_rgba(176,74,60,0.35)]' : 'text-mute hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5'
                            }`}
                        >
                            {t.label}
                            {t.count ? (
                                <span className={`ml-1.5 text-2xs tabular-nums ${mode === t.key ? 'text-white/80' : 'text-mute/70'}`}>{t.count}</span>
                            ) : null}
                        </button>
                    ))}
                </nav>
            </LabPageHeader>

            {error ? <p className="mt-4 rounded-lg bg-cinnabar/10 px-3 py-2 font-serif text-sm text-cinnabar" role="alert">{error}</p> : null}

            {/* 卷宗 —— 按日分節的事件卡牆 */}
            {mode === 'dossiers' ? (
                <section className="mt-6 space-y-6">
                    {groupByDay(dossiers).map((g) => (
                        <div key={g.day}>
                            <p className="font-serif text-2xs tracking-[0.35em] text-mute">第{g.day}日</p>
                            <div className="mt-2 grid gap-3 sm:grid-cols-2">
                                {g.items.map((d) => (
                                    <Link
                                        key={d.slug}
                                        href={`/lab/run/${id}/dossier/${d.slug}`}
                                        className="es-lab-row p-4 transition hover:shadow-[0_4px_18px_rgba(176,74,60,0.20)]"
                                    >
                                        <p className="font-serif text-2xs tracking-[0.25em] text-mute">{d.scene}</p>
                                        <p className="mt-1 font-serif text-base tracking-[0.08em] text-ink">{d.title}</p>
                                        <p className="mt-2 truncate font-serif text-xs text-jade/90" title={d.perspectives.join('、')}>
                                            {d.perspectives.length} 種說法：{d.perspectives.join('、')}
                                        </p>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                    {!dossiers.length ? (
                        <p className="font-serif text-sm text-mute/70" title="公開事件湊足兩份以上的視角，才立一卷">
                            尚無卷宗。
                        </p>
                    ) : null}
                </section>
            ) : null}

            {/* 章回 ／ 眾聲 —— 左列右讀 */}
            {mode === 'chapters' ? listReader(chapters, '尚未織回。') : null}
            {mode === 'voices' ? listReader(povs, '尚無單角之聲。') : null}

            {/* 拍案 —— 按日分節的逐拍流水 */}
            {mode === 'ticks' ? (
                <section className="mt-6 space-y-6">
                    {groupByDay([...records].reverse()).map((g) => (
                        <div key={g.day}>
                            <p className="font-serif text-2xs tracking-[0.35em] text-mute">第{g.day}日</p>
                            <div className="mt-2 space-y-3">
                                {g.items.map((r) => (
                                    <details key={`${r.day}-${r.tick}`} className="es-lab-row p-4" open={r.tick === records[records.length - 1]?.tick}>
                                        <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
                                            <span className="font-serif text-sm tracking-[0.15em] text-ink">第{r.tick}拍 · {r.partOfDay}</span>
                                            <span className="flex flex-wrap gap-1.5 font-serif text-2xs tracking-[0.1em]">
                                                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-mute dark:bg-white/5">{r.scenesPlayed} 場</span>
                                                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-mute dark:bg-white/5">{r.beats} 拍</span>
                                                {r.resolved ? <span className="rounded-full bg-jade/10 px-2 py-0.5 text-jade">落定 {r.resolved}</span> : null}
                                                <span className="rounded-full bg-cinnabar/10 px-2 py-0.5 text-cinnabar">心 {r.liveWants}</span>
                                                {r.wove ? <span className="rounded-full bg-cinnabar/85 px-2 py-0.5 text-white">織回</span> : null}
                                                {r.episode ? <span className="rounded-full bg-seal/80 px-2 py-0.5 text-white">收日</span> : null}
                                            </span>
                                        </summary>
                                        <div className="mt-3 space-y-3">
                                            {r.events.map((ev) => {
                                                const evPovs = r.eventPovs.filter((p) => p.eventId === ev.id);
                                                return (
                                                    <div key={ev.id} className="rounded-lg bg-ink/[0.02] p-3.5 dark:bg-white/[0.03]">
                                                        {/* 場籤一行：何地・質地・事號 */}
                                                        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                            <span className="rounded-sm bg-jade/15 px-1.5 py-0.5 font-serif text-2xs tracking-[0.2em] text-jade">
                                                                {ev.sceneName}
                                                            </span>
                                                            {ev.visibility === 'private' ? (
                                                                <span className="font-serif text-2xs tracking-[0.2em] text-jade/70">窗內事</span>
                                                            ) : null}
                                                            <span className="font-serif text-2xs tracking-[0.06em] text-mute/50">{ev.id}</span>
                                                        </p>

                                                        {/* 客觀之拍：名籤起行，心聲另起一縮行 —— 不再擠成一團 */}
                                                        <ol className="mt-2.5 max-w-3xl space-y-2.5">
                                                            {ev.beats.map((b, i) => (
                                                                <li key={i}>
                                                                    <p className="font-serif text-sm leading-relaxed text-ink/85">
                                                                        <span className="mr-1.5 text-ink">{b.name}</span>
                                                                        {b.text}
                                                                    </p>
                                                                    {b.inner ? (
                                                                        <p className="mt-1 border-l border-hairline/50 pl-2 font-serif text-xs leading-relaxed text-mute/80">
                                                                            心聲｜{b.inner}
                                                                        </p>
                                                                    ) : null}
                                                                </li>
                                                            ))}
                                                        </ol>

                                                        {/* 眾聲：一家一摺 —— 名籤＋一行預覽，點開才展全文 */}
                                                        {evPovs.length ? (
                                                            <div className="mt-3 space-y-1.5 border-t border-hairline/40 pt-2.5">
                                                                {evPovs.map((p) => (
                                                                    <details key={p.characterId} className="group max-w-3xl">
                                                                        <summary className="flex cursor-pointer list-none items-baseline gap-2">
                                                                            <span className="shrink-0 rounded-sm bg-cinnabar/10 px-1.5 py-0.5 font-serif text-2xs tracking-[0.2em] text-cinnabar">
                                                                                {p.name}所見
                                                                            </span>
                                                                            <span className="min-w-0 truncate font-serif text-xs text-mute/70 group-open:hidden">
                                                                                {p.body}
                                                                            </span>
                                                                            <span aria-hidden className="ml-auto shrink-0 font-serif text-2xs text-mute/50 transition-transform group-open:rotate-180">
                                                                                ▾
                                                                            </span>
                                                                        </summary>
                                                                        <p className="mt-1.5 whitespace-pre-wrap font-serif text-xs leading-relaxed text-ink/75">
                                                                            {p.body}
                                                                        </p>
                                                                    </details>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                            {r.economyNotices?.length ? (
                                                <div className="border-l-2 border-seal/50 pl-3">
                                                    {r.economyNotices.map((line, i) => (
                                                        <p key={i} className="font-serif text-xs text-mute/85">（帳）{line}</p>
                                                    ))}
                                                </div>
                                            ) : null}
                                            {!r.events.length ? <p className="font-serif text-xs text-mute/60">此拍無戲，各自過活。</p> : null}
                                        </div>
                                    </details>
                                ))}
                            </div>
                        </div>
                    ))}
                    {!records.length ? <p className="font-serif text-sm text-mute/70">尚未走拍。</p> : null}
                </section>
            ) : null}

            {/* 選集 */}
            {mode === 'anthology' ? (
                <section className="mt-6">
                    {anthology ? (
                        <article className="es-lab-panel p-5 sm:p-8">
                            <Markdown source={anthology} className="chapter-prose" />
                        </article>
                    ) : (
                        <p className="font-serif text-sm text-mute/70" title="季度編輯從全部卷宗揀出值得留名的事件織成一冊">
                            選集未成，多走幾拍再來。
                        </p>
                    )}
                </section>
            ) : null}
        </main>
    );
}
