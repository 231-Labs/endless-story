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
import type { LabCharacterLive, LabLiveBeat, LabPrayer, LabSceneObject } from '@/lib/lab/types';

interface Props {
    scene: Scene;
    characters: LabCharacterLive[];
    beats: LabLiveBeat[];
    locationArt?: string;
    clock?: string;
    /** 物在世 — the run's registered objects; the sheet filters to this scene. */
    objects?: LabSceneObject[];
    /** 願牆 — spoken prayers; the sheet shows the ones voiced HERE (願籤). */
    prayers?: LabPrayer[];
    onSelectCharacter?: (characterId: string) => void;
    onClose: () => void;
}

export function LabSceneSheet({ scene, characters, beats, locationArt, clock, objects, prayers, onSelectCharacter, onClose }: Props) {
    const present = characters.filter((c) => c.sceneId === scene.id);
    const sceneBeats = beats.filter((b) => b.sceneId === scene.id).slice(-14).reverse();
    const art = scene.imageUrl || sceneArtFor(scene.name) || locationArt;
    // 物在此處：擱在這屋裡的（不含隨身）；幽物標記不隱去——操作者全知，幽仍是幽。
    const placedHere = (objects ?? []).filter((o) => o.sceneId === scene.id && !o.carriedBy);
    // 隨身在場：在場人身上帶著的（花串、繡帕、門鑰……會跟人走）。
    const presentIds = new Set(characters.filter((c) => c.sceneId === scene.id).map((c) => c.id));
    const carriedHere = (objects ?? []).filter((o) => o.carriedBy && presentIds.has(o.carriedBy));
    // 願籤：在此處對神明說出口的話（廟宇自然有，別處自然無）。
    const prayersHere = (prayers ?? []).filter((p) => p.templeName === scene.name).slice(0, 8);
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
                                <li key={c.id} className="rounded-lg bg-ink/[0.03] p-3 dark:bg-white/[0.04]">
                                    <div className="flex items-center justify-between gap-3">
                                        <button
                                            type="button"
                                            onClick={() => onSelectCharacter?.(c.id)}
                                            title={`開「${c.name}」內頁`}
                                            className="flex min-w-0 items-center gap-2 font-serif text-base tracking-[0.15em] text-ink transition hover:text-cinnabar"
                                        >
                                            {c.portraitUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={c.portraitUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-hairline/60" />
                                            ) : null}
                                            <span className="truncate">{c.name}</span>
                                        </button>
                                        <span className="shrink-0 font-serif text-2xs tracking-[0.2em] text-mute">{c.role ?? ''}</span>
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

                        {/* 物在此處 —— 這屋子裡擱著的東西（幽物標「幽」不隱去） */}
                        {placedHere.length ? (
                            <div className="mt-6">
                                <p className="font-serif text-2xs tracking-[0.3em] text-cinnabar/80">物在此處</p>
                                <ul className="mt-2 space-y-1.5">
                                    {placedHere.map((o) => (
                                        <li key={o.id} className={`font-serif text-xs leading-relaxed ${o.visibility === 'hidden' ? 'text-mute/60' : 'text-ink/80'}`}>
                                            {o.visibility === 'hidden' ? <span className="mr-1.5 text-jade/80">幽</span> : <span className="mr-1.5 text-mute/50">·</span>}
                                            {o.label}
                                            {o.container ? <span className="ml-1.5 text-2xs text-mute/60">（在{o.container}）</span> : null}
                                            {o.state ? <span className="ml-1.5 text-2xs text-mute/70">—— {o.state}</span> : null}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        {/* 隨身在場 —— 在場人身上帶著的物件 */}
                        {carriedHere.length ? (
                            <div className="mt-5">
                                <p className="font-serif text-2xs tracking-[0.3em] text-mute/70">隨身在場</p>
                                <ul className="mt-2 space-y-1">
                                    {carriedHere.map((o) => (
                                        <li key={o.id} className="font-serif text-xs leading-relaxed text-ink/75">
                                            <span className="text-mute/70">{o.carriedByName}</span> 隨身 · {o.label}
                                            {o.state ? <span className="ml-1.5 text-2xs text-mute/60">—— {o.state}</span> : null}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        {/* 願籤 —— 在此處對神明說出口的話（廟宇自然有，別處自然無） */}
                        {prayersHere.length ? (
                            <div className="mt-5">
                                <p className="font-serif text-2xs tracking-[0.3em] text-seal/80">願籤</p>
                                <ul className="mt-2 space-y-2">
                                    {prayersHere.map((p) => (
                                        <li key={p.id} className="border-l-2 border-seal/30 pl-3">
                                            <p className="font-serif text-2xs tracking-[0.15em] text-mute/70">
                                                第{p.day}日{p.clock ? ` · ${p.clock}` : ''} · {p.name}
                                            </p>
                                            <p className="mt-0.5 font-serif text-xs leading-relaxed text-ink/80">「{p.text}」</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
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
