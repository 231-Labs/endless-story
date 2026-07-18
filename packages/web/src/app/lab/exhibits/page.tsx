'use client';

/**
 * 展覽室 — where experiment outputs go on display:
 *   認領外來卷  engine-CLI run dirs dropped under runs/ → become shelf runs
 *   館藏實驗報告  repo experiment report.md files, read in place
 *   自上之展品  markdown pasted/uploaded here, stored on the lab volume
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Markdown } from '@/components/common/Markdown';
import { IconBack, IconBurn, IconFork, IconScroll } from '@/components/lab/LabIcons';
import { BeadCurtain, LabEaves } from '@/components/lab/LabOrnaments';
import { labApi } from '@/components/lab/useLab';

interface RepoReport {
    rel: string;
    title: string;
    mtime: string;
    htmlRel?: string;
}

interface UploadedExhibit {
    id: string;
    title: string;
    mtime: string;
}

interface OrphanRun {
    dir: string;
    hasWorld: boolean;
    hasArchive: boolean;
    hasDossiers: boolean;
    day?: number;
    tick?: number;
    preset?: string;
    realLlm?: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, cache: 'no-store', headers: { 'content-type': 'application/json' } });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data?.error ?? `${res.status}`);
    return data;
}

export default function LabExhibitsPage() {
    const router = useRouter();
    const [reports, setReports] = useState<RepoReport[]>([]);
    const [uploads, setUploads] = useState<UploadedExhibit[]>([]);
    const [orphans, setOrphans] = useState<OrphanRun[]>([]);
    const [open, setOpen] = useState<{ kind: 'report' | 'upload'; id: string; title: string } | null>(null);
    const [content, setContent] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [draft, setDraft] = useState({ id: '', markdown: '' });
    const [composing, setComposing] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await request<{ reports: RepoReport[]; uploads: UploadedExhibit[]; orphans: OrphanRun[] }>(
                '/api/lab/exhibits',
            );
            setReports(data.reports);
            setUploads(data.uploads);
            setOrphans(data.orphans);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const openItem = async (kind: 'report' | 'upload', id: string, title: string) => {
        setOpen({ kind, id, title });
        setContent('');
        try {
            const key = kind === 'report' ? 'report' : 'upload';
            const { content } = await request<{ content: string }>(`/api/lab/exhibits?${key}=${encodeURIComponent(id)}`);
            setContent(content);
        } catch (e) {
            setContent(`讀取失敗：${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const adopt = async (orphan: OrphanRun) => {
        setBusy(true);
        setError(null);
        try {
            const title = window.prompt('這卷之名', orphan.dir) ?? '';
            if (!title) return;
            const { meta } = await request<{ meta: { id: string } }>('/api/lab/exhibits', {
                method: 'POST',
                body: JSON.stringify({ kind: 'adopt', dir: orphan.dir, title }),
            });
            router.push(`/lab/run/${meta.id}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const saveDraft = async () => {
        setBusy(true);
        setError(null);
        try {
            await request('/api/lab/exhibits', {
                method: 'POST',
                body: JSON.stringify({ kind: 'upload', id: draft.id.trim(), markdown: draft.markdown }),
            });
            setDraft({ id: '', markdown: '' });
            setComposing(false);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
            <header className="relative pt-5">
                <LabEaves />
                <BeadCurtain className="-mt-2 h-14 opacity-60" />
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                        <p className="es-page-lead-eyebrow">片場 · 展覽室</p>
                        <h1
                            className="font-serif text-2xl tracking-[0.18em] text-ink"
                            title="實驗的產出在此展示：外來 engine run 認領上卷架；實驗報告與自撰展品直接展讀。"
                        >
                            實驗展品
                        </h1>
                    </div>
                    <Link href="/lab" aria-label="回片場" title="回片場" className="inline-flex items-center font-serif text-base text-mute hover:text-cinnabar">
                        <IconBack />
                    </Link>
                </div>
            </header>

            {error ? <p className="mt-4 font-serif text-xs text-cinnabar" role="alert">{error}</p> : null}

            {/* 認領外來卷 */}
            {orphans.length ? (
                <section className="mt-8">
                    <h2 className="font-serif text-sm tracking-[0.35em] text-cinnabar/90" title="runs/ 底下發現的 engine 跑卷目錄（缺 lab-run.json）——認領即上卷架，手卷/章回/卷宗全數可讀">
                        認領外來卷
                    </h2>
                    <div className="mt-3 space-y-2">
                        {orphans.map((orphan) => (
                            <div key={orphan.dir} className="es-card flex flex-wrap items-center gap-3 p-3.5">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-serif text-sm tracking-[0.1em] text-ink">{orphan.dir}</p>
                                    <p className="mt-0.5 flex gap-x-3 font-serif text-2xs tracking-[0.15em] text-mute">
                                        {orphan.preset ? <span>{orphan.preset}</span> : null}
                                        {orphan.day != null ? <span>日{orphan.day} · 拍{orphan.tick}</span> : null}
                                        <span>{orphan.realLlm ? '實錄' : '排演'}</span>
                                        {orphan.hasArchive ? <span className="text-jade/90">有章回</span> : null}
                                        {orphan.hasDossiers ? <span className="text-jade/90">有卷宗</span> : null}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void adopt(orphan)}
                                    aria-label={`認領 ${orphan.dir}`}
                                    title="認領上卷架"
                                    className="es-icon-button !h-9 !w-9 text-[15px] text-cinnabar disabled:opacity-40"
                                >
                                    <IconFork />
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="mt-8 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div>
                    {/* 館藏實驗報告 */}
                    <h2 className="font-serif text-sm tracking-[0.35em] text-cinnabar/90" title="repo 內建的實驗報告（packages/engine/experiments）">
                        館藏實驗報告
                    </h2>
                    <ul className="mt-2 max-h-[38vh] space-y-1 overflow-y-auto no-scrollbar">
                        {reports.map((report) => (
                            <li key={report.rel} className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => void openItem('report', report.rel, report.title)}
                                    className={`min-w-0 flex-1 rounded-md px-3 py-1.5 text-left font-serif text-xs transition ${
                                        open?.kind === 'report' && open.id === report.rel ? 'bg-cinnabar/10 text-ink' : 'text-mute hover:text-ink'
                                    }`}
                                    title={report.rel}
                                >
                                    <span className="block truncate">{report.title}</span>
                                    <span className="block truncate text-2xs opacity-60">{report.rel}</span>
                                </button>
                                {report.htmlRel ? (
                                    <a
                                        href={`/api/lab/exhibits/html?path=${encodeURIComponent(report.htmlRel)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label="開原版 HTML"
                                        title="原版 HTML 報告（新窗）"
                                        className="shrink-0 text-mute/60 hover:text-cinnabar"
                                    >
                                        <IconScroll />
                                    </a>
                                ) : null}
                            </li>
                        ))}
                        {!reports.length ? <li className="font-serif text-xs text-mute/60">此機無館藏。</li> : null}
                    </ul>

                    {/* 自上之展品 */}
                    <div className="mt-6 flex items-center justify-between">
                        <h2 className="font-serif text-sm tracking-[0.35em] text-cinnabar/90" title="貼上任何 markdown（研究筆記、season 報告、私庫產物）留展於此；存於 LAB_DATA_DIR/exhibits">
                            自上之展品
                        </h2>
                        <button
                            type="button"
                            onClick={() => setComposing((v) => !v)}
                            className="font-serif text-2xs tracking-[0.25em] text-mute hover:text-cinnabar"
                        >
                            {composing ? '收起' : '＋ 上展'}
                        </button>
                    </div>
                    {composing ? (
                        <div className="mt-2 space-y-1.5">
                            <input
                                value={draft.id}
                                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                                placeholder="展品之名（檔名）"
                                className="es-field w-full px-2.5 py-1.5 text-xs"
                            />
                            <textarea
                                value={draft.markdown}
                                onChange={(e) => setDraft({ ...draft, markdown: e.target.value })}
                                placeholder="# 標題……（markdown 全文貼此）"
                                rows={6}
                                className="es-field w-full px-2.5 py-2 font-mono text-2xs leading-relaxed"
                            />
                            <button
                                type="button"
                                disabled={busy || !draft.id.trim() || !draft.markdown.trim()}
                                onClick={() => void saveDraft()}
                                className="es-button-primary px-3 py-1.5 text-xs disabled:opacity-40"
                            >
                                上展
                            </button>
                        </div>
                    ) : null}
                    <ul className="mt-2 space-y-1">
                        {uploads.map((upload) => (
                            <li key={upload.id} className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => void openItem('upload', upload.id, upload.title)}
                                    className={`min-w-0 flex-1 rounded-md px-3 py-1.5 text-left font-serif text-xs transition ${
                                        open?.kind === 'upload' && open.id === upload.id ? 'bg-cinnabar/10 text-ink' : 'text-mute hover:text-ink'
                                    }`}
                                >
                                    <span className="block truncate">{upload.title}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (window.confirm(`焚去展品「${upload.title}」？`)) {
                                            void request(`/api/lab/exhibits?upload=${encodeURIComponent(upload.id)}`, { method: 'DELETE' })
                                                .then(load)
                                                .catch((e) => setError(String(e)));
                                        }
                                    }}
                                    aria-label={`焚去 ${upload.title}`}
                                    title="焚去此展品"
                                    className="shrink-0 text-mute/60 hover:text-cinnabar"
                                >
                                    <IconBurn />
                                </button>
                            </li>
                        ))}
                        {!uploads.length && !composing ? <li className="font-serif text-xs text-mute/60">尚無展品。</li> : null}
                    </ul>
                </div>

                {/* 展讀 */}
                <article className="es-card min-h-[46vh] max-h-[74vh] overflow-y-auto p-5 no-scrollbar sm:p-7">
                    {open ? (
                        <>
                            <p className="mb-4 border-b border-hairline/50 pb-2 font-serif text-2xs tracking-[0.25em] text-mute">
                                {open.kind === 'report' ? '館藏' : '自上'} · {open.id}
                            </p>
                            <Markdown source={content || '展開中…'} compact className="!max-w-none" />
                        </>
                    ) : (
                        <p className="font-serif text-sm text-mute/70">左手邊揀一件展品。</p>
                    )}
                </article>
            </section>
        </main>
    );
}
