'use client';

/**
 * LabSceneSheet — 內頁 for the lab scroll: scene art, who is here right now,
 * their current wants and latest lines, and the scene's recent beats. Zero
 * chain, zero subscription — the operator sees everything, 窗內事 included
 * (marked, so private texture is legible as private).
 */

import { motion } from 'framer-motion';
import type { Scene } from '@endless-story/shared';
import { BlobImage } from '@/components/common/BlobImage';
import { sceneArtFor } from '@/components/saga/handscroll/terrainArt';
import type { LabCharacterLive, LabLiveBeat } from '@/lib/lab/types';

interface Props {
    scene: Scene;
    characters: LabCharacterLive[];
    beats: LabLiveBeat[];
    locationArt?: string;
    clock?: string;
    onClose: () => void;
}

export function LabSceneSheet({ scene, characters, beats, locationArt, clock, onClose }: Props) {
    const present = characters.filter((c) => c.sceneId === scene.id);
    const sceneBeats = beats.filter((b) => b.sceneId === scene.id).slice(-14).reverse();
    const art = scene.imageUrl || sceneArtFor(scene.name) || locationArt;
    const isPrivate = (scene.privacyLevel ?? 0) >= 3;

    return (
        <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-canvas"
        >
            {/* 背景：場景畫 + 紙色紗 */}
            <div className="absolute inset-0">
                {art ? <BlobImage src={art} alt={scene.name} className="object-cover opacity-35 dark:opacity-25" sizes="100vw" /> : null}
                <div className="absolute inset-0 bg-gradient-to-b from-canvas/70 via-canvas/85 to-canvas" />
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-6 pt-5 sm:px-10">
                <header className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="font-serif text-2xs tracking-[0.35em] text-mute/80">
                            {isPrivate ? '窗內事 · 私之地' : '眾目之地'}
                            {clock ? ` · ${clock}` : ''}
                        </p>
                        <h2 className="mt-1 font-serif text-2xl tracking-[0.12em] text-ink sm:text-3xl">{scene.name}</h2>
                        {scene.description ? (
                            <p className="mt-2 max-w-xl font-serif text-sm leading-relaxed text-ink/75">{scene.description}</p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="es-icon-button shrink-0"
                        aria-label="合上內頁"
                    >
                        ↩
                    </button>
                </header>

                <div className="mt-5 grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
                    {/* 此刻在場 */}
                    <div className="min-h-0 overflow-y-auto no-scrollbar">
                        <p className="font-serif text-2xs tracking-[0.3em] text-cinnabar/90">此刻在場 · {present.length} 人</p>
                        <ul className="mt-3 space-y-3">
                            {present.map((c) => (
                                <li key={c.id} className="es-soft-panel p-3">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="font-serif text-base tracking-[0.15em] text-ink">{c.name}</span>
                                        <span className="font-serif text-2xs tracking-[0.2em] text-mute">{c.role ?? ''}</span>
                                    </div>
                                    {c.wants[0] ? (
                                        <div className="mt-2">
                                            <div className="flex items-center justify-between gap-2 font-serif text-xs text-ink/80">
                                                <span className="truncate">{c.wants[0].desc}</span>
                                                <span className="shrink-0 text-2xs tracking-[0.15em] text-mute">
                                                    {c.wants[0].layer} · 張力 {c.wants[0].tension.toFixed(2)}
                                                </span>
                                            </div>
                                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-hairline/60">
                                                <div
                                                    className="h-full rounded-full bg-cinnabar/70"
                                                    style={{ width: `${Math.min(100, Math.round(c.wants[0].tension * 100))}%` }}
                                                />
                                            </div>
                                        </div>
                                    ) : null}
                                    {c.latestLine ? (
                                        <p className="mt-2 font-serif text-xs leading-relaxed text-ink/70">
                                            「{c.latestLine.text}」
                                        </p>
                                    ) : null}
                                </li>
                            ))}
                            {!present.length ? (
                                <li className="font-serif text-sm text-mute/70">
                                    無人。茶尚溫，簾未動——這屋子在等下一個時辰。
                                </li>
                            ) : null}
                        </ul>
                    </div>

                    {/* 方才此處 */}
                    <div className="min-h-0 overflow-y-auto no-scrollbar">
                        <p className="font-serif text-2xs tracking-[0.3em] text-jade/90">方才此處</p>
                        <ol className="mt-3 space-y-3">
                            {sceneBeats.map((b) => (
                                <li key={`${b.seq}`} className="border-l-2 border-hairline/70 pl-3">
                                    <p className="font-serif text-2xs tracking-[0.2em] text-mute">
                                        第{b.day}日 · {b.clock} · {b.name}
                                        {b.isPrivate ? <span className="ml-2 text-jade/80">幽</span> : null}
                                    </p>
                                    <p className="mt-1 font-serif text-sm leading-relaxed text-ink/85">{b.text}</p>
                                    {b.inner ? (
                                        <p className="mt-1 font-serif text-xs leading-relaxed text-mute/85">心聲：{b.inner}</p>
                                    ) : null}
                                </li>
                            ))}
                            {!sceneBeats.length ? (
                                <li className="font-serif text-sm text-mute/70">戲正醞釀，未有一拍落此。</li>
                            ) : null}
                        </ol>
                    </div>
                </div>
            </div>
        </motion.section>
    );
}
