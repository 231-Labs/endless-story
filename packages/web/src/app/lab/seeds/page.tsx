'use client';

/**
 * 劇本館 — batch story configuration. Load any seed JSON (built-in library or
 * custom), edit it whole (cast / scenes / memories / stakes in one file), and
 * save it under a new custom id. Saving validates by building a WorldState
 * with the engine's own loader, so a bad seed fails here, not mid-run.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BeadCurtain, LabEaves } from '@/components/lab/LabOrnaments';
import { IconBack } from '@/components/lab/LabIcons';
import { labApi } from '@/components/lab/useLab';
import type { LabSeedSummary } from '@/lib/lab/types';

export default function LabSeedsPage() {
    const [seeds, setSeeds] = useState<LabSeedSummary[]>([]);
    const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
    const [text, setText] = useState('');
    const [saveId, setSaveId] = useState('');
    const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const { seeds } = await labApi.seeds();
            setSeeds(seeds);
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const openSeed = async (seed: LabSeedSummary) => {
        setMessage(null);
        try {
            const { json } = await labApi.seedText(seed.source, seed.id);
            setText(json);
            setLoadedFrom(`${seed.source}/${seed.id}`);
            setSaveId(seed.source === 'custom' ? seed.id : `${seed.id}-變奏`);
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
        }
    };

    const save = async () => {
        setBusy(true);
        setMessage(null);
        try {
            // keep the JSON id in sync with the file id so a run's provenance reads true
            const parsed = JSON.parse(text) as { id?: string };
            parsed.id = saveId.trim();
            const body = JSON.stringify(parsed, null, 2);
            await labApi.saveSeed('seed', saveId.trim(), body);
            setText(body);
            setMessage({ kind: 'ok', text: `已存為自撰劇本「${saveId.trim()}」，回片場即可點燈。` });
            await load();
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
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
                        <p className="es-page-lead-eyebrow">片場 · 劇本館</p>
                        <h1
                            className="font-serif text-2xl tracking-[0.18em] text-ink"
                            title="一份 seed JSON 就是一整個世界的批量配置：saga 前提、地界與場景、開班角色（persona／secret／memories／崗位居所）、爭奪之物、關係底稿。存檔即以引擎 buildWorldState 驗證。"
                        >
                            劇本與配置
                        </h1>
                    </div>
                    <Link
                        href="/lab"
                        aria-label="回片場"
                        title="回片場"
                        className="inline-flex items-center font-serif text-base text-mute hover:text-cinnabar"
                    >
                        <IconBack />
                    </Link>
                </div>
            </header>

            <section className="mt-6 grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
                <div>
                    <p className="font-serif text-2xs tracking-[0.3em] text-mute">館藏與自撰</p>
                    <ul className="mt-2 space-y-1.5">
                        {seeds.map((seed) => (
                            <li key={`${seed.source}/${seed.id}`}>
                                <button
                                    type="button"
                                    onClick={() => void openSeed(seed)}
                                    className={`w-full rounded-md px-3 py-2 text-left transition ${
                                        loadedFrom === `${seed.source}/${seed.id}` ? 'bg-cinnabar/10' : 'hover:bg-surface'
                                    }`}
                                >
                                    <p className="font-serif text-sm tracking-[0.1em] text-ink">{seed.label ?? seed.id}</p>
                                    <p className="font-serif text-2xs tracking-[0.12em] text-mute">
                                        {seed.source === 'custom' ? '自撰' : '館藏'} · {seed.id} · {seed.castCount}角/{seed.sceneCount}景/{seed.memoryCount}憶
                                    </p>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            value={saveId}
                            onChange={(e) => setSaveId(e.target.value)}
                            placeholder="另存之名（如：spring-snow-變奏）"
                            className="es-field w-72 px-3 py-2 text-sm"
                        />
                        <button
                            type="button"
                            disabled={busy || !text.trim() || !saveId.trim()}
                            onClick={() => void save()}
                            className="es-button-primary px-4 py-2 text-sm disabled:opacity-40"
                        >
                            驗而後存
                        </button>
                        {message ? (
                            <span
                                className={`font-serif text-xs ${message.kind === 'ok' ? 'text-jade' : 'text-cinnabar'}`}
                                role={message.kind === 'err' ? 'alert' : undefined}
                            >
                                {message.text}
                            </span>
                        ) : null}
                    </div>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        spellCheck={false}
                        rows={30}
                        placeholder="左手邊揀一部劇本展開，或整份貼上。"
                        className="es-field mt-3 w-full px-4 py-3 font-mono text-xs leading-relaxed"
                    />
                </div>
            </section>
        </main>
    );
}
