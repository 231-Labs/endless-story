'use client';

/**
 * 卷宗與章回 — the reading room of one run: event dossiers (客觀/主觀選集),
 * woven tick chapters + day episodes, the raw tick timeline (objective beats
 * with each witness's POV beside them), and the season editorial anthology.
 */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Markdown } from '@/components/common/Markdown';
import { IconBack } from '@/components/lab/LabIcons';
import { BeadCurtain, LabEaves } from '@/components/lab/LabOrnaments';
import { labApi } from '@/components/lab/useLab';
import type { LabTickRecord } from '@/lib/lab/types';

type Mode = 'dossiers' | 'chapters' | 'ticks' | 'anthology';

const MODES: Array<{ key: Mode; label: string }> = [
    { key: 'dossiers', label: '事件卷宗' },
    { key: 'chapters', label: '章回' },
    { key: 'ticks', label: '拍案' },
    { key: 'anthology', label: '選集' },
];

interface ArchiveEntry {
    file: string;
    kind: string;
    day: number;
    tick: number;
    slug: string;
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

    const openArchive = async (file: string) => {
        setOpenFile(file);
        setFileContent('');
        try {
            const { content } = await labApi.archiveFile(id, file);
            setFileContent(content);
        } catch (e) {
            setFileContent(`讀取失敗：${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const chapters = entries.filter((e) => e.kind === 'chapter' || e.kind === 'episode');
    const povs = entries.filter((e) => e.kind === 'pov');

    return (
        <main className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
            <header className="relative pt-5">
                <LabEaves />
                <BeadCurtain className="-mt-2 h-14 opacity-60" />
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                        <p className="es-page-lead-eyebrow">片場 · 讀卷處</p>
                        <h1 className="font-serif text-2xl tracking-[0.18em] text-ink">卷宗與章回</h1>
                    </div>
                    <Link
                        href={`/lab/run/${id}`}
                        aria-label="回觀測台"
                        title="回觀測台"
                        className="inline-flex items-center gap-1.5 font-serif text-base text-mute hover:text-cinnabar"
                    >
                        <IconBack />
                    </Link>
                </div>
                <nav className="mt-5 flex gap-1 overflow-x-auto no-scrollbar">
                    {MODES.map((m) => (
                        <button
                            key={m.key}
                            type="button"
                            onClick={() => setMode(m.key)}
                            className={`shrink-0 rounded-full px-4 py-1.5 font-serif text-xs tracking-[0.25em] transition ${
                                mode === m.key ? 'bg-cinnabar text-white' : 'text-mute hover:text-ink'
                            }`}
                        >
                            {m.label}
                        </button>
                    ))}
                </nav>
            </header>

            {error ? <p className="mt-4 font-serif text-sm text-cinnabar" role="alert">{error}</p> : null}

            {/* 事件卷宗 */}
            {mode === 'dossiers' ? (
                <section className="mt-6 grid gap-3 sm:grid-cols-2">
                    {dossiers.map((d) => (
                        <Link
                            key={d.slug}
                            href={`/lab/run/${id}/dossier/${d.slug}`}
                            className="es-lab-row p-4 transition hover:shadow-[0_4px_18px_rgba(176,74,60,0.20)]"
                        >
                            <p className="font-serif text-2xs tracking-[0.25em] text-mute">第{d.day}日 · {d.scene}</p>
                            <p className="mt-1 font-serif text-base tracking-[0.08em] text-ink">{d.title}</p>
                            <p className="mt-2 font-serif text-xs text-jade/90">
                                {d.perspectives.length} 種說法：{d.perspectives.join('、')}
                            </p>
                        </Link>
                    ))}
                    {!dossiers.length ? (
                        <p className="font-serif text-sm text-mute/70" title="公開事件湊足兩份以上的視角，才立一卷">
                            尚無卷宗。
                        </p>
                    ) : null}
                </section>
            ) : null}

            {/* 章回（織回 + 日終） */}
            {mode === 'chapters' ? (
                <section className="mt-6 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="max-h-[68vh] overflow-y-auto no-scrollbar">
                        <ul className="space-y-1.5">
                            {chapters.map((e) => (
                                <li key={e.file}>
                                    <button
                                        type="button"
                                        onClick={() => void openArchive(e.file)}
                                        className={`w-full rounded-lg px-3 py-2 text-left font-serif text-xs transition ${
                                            openFile === e.file ? 'bg-cinnabar/10 text-ink' : 'text-mute hover:text-ink'
                                        }`}
                                    >
                                        <span className="tracking-[0.2em]">{e.kind === 'chapter' ? '織回' : '日終'}</span>
                                        <span className="ml-2">第{e.day}日 · 第{e.tick}拍 · {e.slug}</span>
                                    </button>
                                </li>
                            ))}
                            {!chapters.length ? <li className="font-serif text-xs text-mute/60">尚未織回。</li> : null}
                        </ul>
                        {povs.length ? (
                            <>
                                <p className="mt-5 font-serif text-2xs tracking-[0.3em] text-mute">單角 POV（原料）</p>
                                <ul className="mt-1.5 space-y-1">
                                    {povs.map((e) => (
                                        <li key={e.file}>
                                            <button
                                                type="button"
                                                onClick={() => void openArchive(e.file)}
                                                className={`w-full rounded-lg px-3 py-1.5 text-left font-serif text-2xs transition ${
                                                    openFile === e.file ? 'bg-cinnabar/10 text-ink' : 'text-mute/85 hover:text-ink'
                                                }`}
                                            >
                                                d{e.day} · {e.slug}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                    </div>
                    <article className="es-lab-panel min-h-[40vh] max-h-[68vh] overflow-y-auto p-5 no-scrollbar sm:p-7">
                        {openFile ? (
                            <Markdown source={fileContent || '展卷中…'} className="chapter-prose" />
                        ) : (
                            <p className="font-serif text-sm text-mute/70">左手邊揀一回。</p>
                        )}
                    </article>
                </section>
            ) : null}

            {/* 拍案：客觀逐拍 × 各自主觀 */}
            {mode === 'ticks' ? (
                <section className="mt-6 space-y-5">
                    {[...records].reverse().map((r) => (
                        <details key={`${r.day}-${r.tick}`} className="es-lab-row p-4" open={r.tick === records[records.length - 1]?.tick}>
                            <summary className="cursor-pointer list-none font-serif text-sm tracking-[0.15em] text-ink">
                                第{r.day}日 · 第{r.tick}拍 · {r.partOfDay}
                                <span className="ml-3 font-serif text-2xs tracking-[0.15em] text-mute">
                                    {r.scenesPlayed} 場 · {r.beats} 拍 · 落定 {r.resolved} · 心事 {r.liveWants}
                                    {r.wove ? ' · 已織回' : ''}{r.episode ? ' · 已收日' : ''}
                                </span>
                            </summary>
                            <div className="mt-3 space-y-4">
                                {r.events.map((ev) => (
                                    <div key={ev.id} className="border-l-2 border-hairline/70 pl-3">
                                        <p className="font-serif text-xs tracking-[0.2em] text-jade/90">
                                            {ev.sceneName}
                                            {ev.visibility === 'private' ? <span className="ml-2 text-jade/70">窗內事</span> : null}
                                            <span className="ml-2 text-mute/70">{ev.id}</span>
                                        </p>
                                        <ol className="mt-2 space-y-1.5">
                                            {ev.beats.map((b, i) => (
                                                <li key={i} className="font-serif text-sm leading-relaxed text-ink/85">
                                                    <span className="text-ink">{b.name}</span>：{b.text}
                                                    {b.inner ? <span className="ml-1 text-xs text-mute/80">（心聲：{b.inner}）</span> : null}
                                                </li>
                                            ))}
                                        </ol>
                                        {r.eventPovs.filter((p) => p.eventId === ev.id).length ? (
                                            <div className="mt-2 space-y-1.5 border-t border-hairline/40 pt-2">
                                                {r.eventPovs
                                                    .filter((p) => p.eventId === ev.id)
                                                    .map((p) => (
                                                        <p key={p.characterId} className="font-serif text-xs leading-relaxed text-mute/90">
                                                            <span className="text-cinnabar/85">{p.name}所見</span>｜{p.body}
                                                        </p>
                                                    ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
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
