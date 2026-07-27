'use client';

/**
 * LabReadingEmbed — 看客「讀章回」嵌在觀測台殼內，不另開首頁。
 * 精簡自讀卷處：卷宗 + 章回兩籤。
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { NarrativeProse, ReaderScaleControl, useReaderScale } from '@/components/lab/NarrativeProse';
import { labApi } from '@/components/lab/useLab';

type Mode = 'dossiers' | 'chapters';

interface ArchiveEntry {
    file: string;
    kind: string;
    day: number;
    tick: number;
    slug: string;
}

export function LabReadingEmbed({
    runId,
    source = 'lab',
}: {
    runId: string;
    initialDossierSlug?: string | null;
    source?: 'lab' | 'public';
}) {
    const [mode, setMode] = useState<Mode>('chapters');
    const [error, setError] = useState<string | null>(null);
    const reader = useReaderScale();
    const [dossiers, setDossiers] = useState<Array<{ slug: string; title: string; day: number; scene: string; perspectives: string[] }>>([]);
    const [entries, setEntries] = useState<ArchiveEntry[]>([]);
    const [openFile, setOpenFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState('');

    const load = useCallback(async () => {
        try {
            if (source === 'public') {
                const [dossierRes, archiveRes] = await Promise.all([labApi.publicReadingDossiers(), labApi.publicReadingArchive()]);
                setDossiers(dossierRes.dossiers);
                setEntries(archiveRes.entries as ArchiveEntry[]);
            } else {
                const [dossierRes, archiveRes] = await Promise.all([labApi.dossiers(runId), labApi.archive(runId)]);
                setDossiers(dossierRes.dossiers);
                setEntries(archiveRes.entries as ArchiveEntry[]);
            }
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [runId, source]);

    useEffect(() => {
        void load();
    }, [load]);

    const openArchive = useCallback(
        async (file: string) => {
            setOpenFile(file);
            try {
                const res =
                    source === 'public'
                        ? await labApi.publicReadingFile(file)
                        : await labApi.archiveFile(runId, file);
                setFileContent(res.content);
            } catch (e) {
                setFileContent(e instanceof Error ? e.message : String(e));
            }
        },
        [runId, source],
    );

    const chapters = entries.filter((e) =>
        /chapter|episode|織回|日終|手卷|章回/i.test(`${e.kind} ${e.file} ${e.slug}`),
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-6 sm:px-8">
            <div className="flex items-center justify-between gap-3">
                <div className="flex gap-3">
                    <Tab active={mode === 'chapters'} onClick={() => setMode('chapters')} label="章回" />
                    <Tab active={mode === 'dossiers'} onClick={() => setMode('dossiers')} label="卷宗" />
                </div>
                <ReaderScaleControl reader={reader} />
            </div>
            {error ? <p className="mt-3 font-serif text-xs text-cinnabar">{error}</p> : null}

            <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
                <aside className="max-h-48 shrink-0 overflow-y-auto lg:max-h-none lg:w-72">
                    {mode === 'dossiers'
                        ? dossiers.map((d) => (
                              <Link
                                  key={d.slug}
                                  href={`/lab/run/${encodeURIComponent(runId)}/dossier/${encodeURIComponent(d.slug)}`}
                                  className="block border-b border-hairline/50 py-3 font-serif text-sm tracking-[0.12em] text-ink hover:text-cinnabar"
                              >
                                  <span className="text-2xs text-mute">第 {d.day} 日 · {d.scene}</span>
                                  <span className="mt-1 block">{d.title}</span>
                              </Link>
                          ))
                        : chapters.map((e) => (
                              <button
                                  key={e.file}
                                  type="button"
                                  onClick={() => void openArchive(e.file)}
                                  className={`block w-full border-b border-hairline/50 py-3 text-left font-serif text-sm tracking-[0.12em] hover:text-cinnabar ${
                                      openFile === e.file ? 'text-cinnabar' : 'text-ink'
                                  }`}
                              >
                                  <span className="text-2xs text-mute">第 {e.day} 日 · {e.kind}</span>
                                  <span className="mt-1 block truncate">{e.slug || e.file}</span>
                              </button>
                          ))}
                    {mode === 'dossiers' && !dossiers.length ? (
                        <p className="font-serif text-xs tracking-[0.2em] text-mute">尚無卷宗</p>
                    ) : null}
                    {mode === 'chapters' && !chapters.length ? (
                        <p className="font-serif text-xs tracking-[0.2em] text-mute">尚無章回</p>
                    ) : null}
                </aside>
                <div className="min-h-0 flex-1 overflow-y-auto" style={{ fontSize: reader.px }}>
                    {openFile && mode === 'chapters' ? (
                        <NarrativeProse body={fileContent || '展卷中…'} />
                    ) : mode === 'dossiers' ? (
                        <p className="font-serif text-sm tracking-[0.2em] text-mute">點左列開卷宗全文</p>
                    ) : (
                        <p className="font-serif text-sm tracking-[0.2em] text-mute">點左列展開章回</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`font-serif text-sm tracking-[0.35em] ${active ? 'text-cinnabar' : 'text-mute hover:text-ink'}`}
        >
            {label}
        </button>
    );
}
