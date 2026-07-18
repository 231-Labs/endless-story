'use client';

/**
 * LabCharacterSheet — 人物內頁：這個角色在當前機制下「有什麼」的一覽——
 * 身在何處、身心狀態向量、全部活著的心事（張力排序）、恆常自我（L3）、
 * 心底事（secret）、對眾人的當下看法（latest-wins 關係視角）、記憶帳
 * （LocalRecall 全帳可查）、以及圖庫多媒體（多圖＋影片）。
 * Operator cockpit：全部可見；窗內質地以「幽」標記。
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { labApi } from './useLab';
import type { LabCharacterLive } from '@/lib/lab/types';

interface Props {
    runId: string;
    character: LabCharacterLive;
    onClose: () => void;
    onJumpToScene?: (sceneId: string) => void;
}

function StateBar({ label, value, tone }: { label: string; value: number; tone: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="w-8 shrink-0 font-serif text-2xs tracking-[0.2em] text-mute">{label}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-hairline/60">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right font-serif text-2xs text-mute">{value.toFixed(2)}</span>
        </div>
    );
}

export function LabCharacterSheet({ runId, character: c, onClose, onJumpToScene }: Props) {
    const [memories, setMemories] = useState<Array<{ seq: number; content: string; kind: string; day: number; importance: number }>>([]);
    const [memErr, setMemErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        labApi
            .memories(runId, c.id)
            .then(({ memories }) => {
                if (!cancelled) setMemories(memories);
            })
            .catch((e) => setMemErr(e instanceof Error ? e.message : String(e)));
        return () => {
            cancelled = true;
        };
    }, [runId, c.id]);

    return (
        <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-canvas"
        >
            {/* 背景：肖像淡染 */}
            <div className="absolute inset-0">
                {c.portraitUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.portraitUrl} alt="" className="h-full w-full object-cover opacity-20 blur-sm dark:opacity-15" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-b from-canvas/80 via-canvas/90 to-canvas" />
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-6 pt-5 sm:px-10">
                <header className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                        {c.portraitUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.portraitUrl} alt={c.name} className="h-16 w-16 shrink-0 rounded-lg object-cover shadow-md ring-1 ring-hairline/60" />
                        ) : (
                            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-cinnabar/85 font-serif text-2xl text-white shadow-md">
                                {c.name.slice(0, 1)}
                            </span>
                        )}
                        <div className="min-w-0">
                            <h2 className="font-serif text-2xl tracking-[0.12em] text-ink sm:text-3xl">{c.name}</h2>
                            <p className="mt-1 font-serif text-2xs tracking-[0.25em] text-mute">
                                {[c.role, c.gender, c.age ? `${c.age} 歲` : null].filter(Boolean).join(' · ')}
                            </p>
                            <button
                                type="button"
                                onClick={() => c.sceneId && onJumpToScene?.(c.sceneId)}
                                className="mt-1.5 font-serif text-xs tracking-[0.15em] text-jade transition hover:text-cinnabar"
                                title="開其所在場景"
                            >
                                在 {c.sceneName} →
                            </button>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="es-icon-button shrink-0" aria-label="合上內頁">↩</button>
                </header>

                <div className="mt-5 grid min-h-0 flex-1 gap-x-8 gap-y-5 overflow-y-auto no-scrollbar lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:overflow-hidden">
                    {/* 左：機制之下 */}
                    <div className="min-h-0 space-y-5 lg:overflow-y-auto lg:no-scrollbar lg:pr-1">
                        <section>
                            <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">身心</h3>
                            <div className="mt-2 space-y-1.5">
                                <StateBar label="乏" value={c.fatigue} tone="bg-seal/80" />
                                <StateBar label="飢" value={c.hunger} tone="bg-cinnabar/60" />
                                <StateBar label="緒" value={(c.mood + 1) / 2} tone="bg-jade/70" />
                            </div>
                        </section>

                        <section>
                            <h3 className="font-serif text-2xs tracking-[0.35em] text-cinnabar/90">心事 · {c.wants.length} 樁（張力序）</h3>
                            <ul className="mt-2 space-y-2.5">
                                {c.wants.map((w, i) => (
                                    <li key={i}>
                                        <div className="flex items-baseline justify-between gap-2">
                                            <p className="min-w-0 font-serif text-sm leading-relaxed text-ink/90">
                                                {w.desc}
                                                {w.target ? <span className="ml-1.5 font-serif text-2xs text-jade/90">→{w.target}</span> : null}
                                            </p>
                                            <span className="shrink-0 font-serif text-2xs tracking-[0.15em] text-mute">
                                                {w.layer} {w.tension.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-hairline/50">
                                            <div className="h-full rounded-full bg-cinnabar/70" style={{ width: `${Math.min(100, Math.round(w.tension * 100))}%` }} />
                                        </div>
                                    </li>
                                ))}
                                {!c.wants.length ? <li className="font-serif text-sm text-mute/70">心無罣礙。</li> : null}
                            </ul>
                        </section>

                        {c.coreIdentity.length ? (
                            <section>
                                <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">恆常自我</h3>
                                <ul className="mt-2 space-y-1">
                                    {c.coreIdentity.map((line, i) => (
                                        <li key={i} className="font-serif text-sm leading-relaxed text-ink/85">· {line}</li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}

                        {c.secret ? (
                            <section>
                                <h3 className="font-serif text-2xs tracking-[0.35em] text-jade/90">心底事 · 幽</h3>
                                <p className="mt-2 border-l-2 border-jade/40 pl-3 font-serif text-sm leading-relaxed text-ink/75">{c.secret}</p>
                            </section>
                        ) : null}

                        {c.views.length ? (
                            <section>
                                <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">我看眾人（當下的、最新的）</h3>
                                <ul className="mt-2 space-y-1.5">
                                    {c.views.map((v) => (
                                        <li key={v.name} className="font-serif text-sm leading-relaxed text-ink/85">
                                            <span className="text-cinnabar/85">{v.name}</span>｜{v.line}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}

                        <section>
                            <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">其人</h3>
                            <p className="mt-2 font-serif text-sm leading-relaxed text-ink/80">{c.description}</p>
                        </section>
                    </div>

                    {/* 右：記憶帳 + 影像 */}
                    <div className="min-h-0 space-y-5 lg:overflow-y-auto lg:no-scrollbar lg:pr-1">
                        {c.gallery.length ? (
                            <section>
                                <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">影像 · {c.gallery.length}</h3>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    {c.gallery.map((item) => (
                                        <div key={item.url} className="overflow-hidden rounded-md ring-1 ring-hairline/50">
                                            {item.type === 'video' ? (
                                                // eslint-disable-next-line jsx-a11y/media-has-caption
                                                <video src={item.url} controls playsInline className="aspect-video w-full bg-black/60 object-contain" />
                                            ) : (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={item.url} alt="" className="aspect-square w-full object-cover" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        <section>
                            <h3 className="font-serif text-2xs tracking-[0.35em] text-cinnabar/90" title="LocalRecall 全帳（植入/焚去到「物界 → 記憶」）">
                                記憶帳 · {memories.length}
                            </h3>
                            {memErr ? <p className="mt-2 font-serif text-xs text-cinnabar">{memErr}</p> : null}
                            <ul className="mt-2 space-y-2">
                                {memories.map((m) => (
                                    <li key={m.seq} className="border-l-2 border-hairline/60 pl-3">
                                        <p className="font-serif text-2xs tracking-[0.18em] text-mute">
                                            {m.kind} · 重{m.importance} · 第{m.day}日
                                        </p>
                                        <p className="mt-0.5 font-serif text-sm leading-relaxed text-ink/85">{m.content}</p>
                                    </li>
                                ))}
                                {!memories.length && !memErr ? <li className="font-serif text-sm text-mute/70">白紙一張。</li> : null}
                            </ul>
                        </section>
                    </div>
                </div>
            </div>
        </motion.section>
    );
}
