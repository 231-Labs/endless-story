'use client';

/**
 * 觀測台 — one run's live stage: the handscroll (where everyone is, what each
 * scene is breathing), the beat stream (what each character just said), the
 * cast rail, run controls, and the world-physics drawer. Poll-driven via
 * /api/lab/runs/[id]/live; faster cadence while a tick is walking.
 */

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { BeadCurtain } from '@/components/lab/LabOrnaments';
import { IconBack, IconGallery, IconObjects, IconScroll } from '@/components/lab/LabIcons';
import { LabBeatDock } from '@/components/lab/LabBeatDock';
import { LabCastRail } from '@/components/lab/LabCastRail';
import { LabCharacterSheet } from '@/components/lab/LabCharacterSheet';
import { LabConfigDrawer } from '@/components/lab/LabConfigDrawer';
import { LabControls } from '@/components/lab/LabControls';
import { LabHandscroll } from '@/components/lab/LabHandscroll';
import { LabSceneSheet } from '@/components/lab/LabSceneSheet';
import { terrainArtFor } from '@/components/saga/handscroll/terrainArt';
import { useLabLive } from '@/components/lab/useLab';

export default function LabRunPage({ params }: { params: Promise<{ id: string }> }) {
    // page params keep their percent-encoding; run ids may contain CJK
    const { id: rawId } = use(params);
    const id = decodeURIComponent(rawId);
    const { snapshot, feed, error, refresh } = useLabLive(id);
    const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);
    const [focusedCharacterId, setFocusedCharacterId] = useState<string | null>(null);
    const [drawer, setDrawer] = useState(false);

    const focusedScene = useMemo(
        () => snapshot?.scenes.find((s) => s.id === focusedSceneId) ?? null,
        [snapshot, focusedSceneId],
    );
    const focusedCharacter = useMemo(
        () => snapshot?.characters.find((c) => c.id === focusedCharacterId) ?? null,
        [snapshot, focusedCharacterId],
    );
    const focusedLocationArt = useMemo(() => {
        if (!snapshot || !focusedScene) return undefined;
        const loc = snapshot.locations.find((l) => l.id === focusedScene.locationId);
        return terrainArtFor(loc?.name) ?? undefined;
    }, [snapshot, focusedScene]);

    if (!snapshot) {
        return (
            <main className="flex min-h-dvh items-center justify-center">
                <p className="font-serif text-sm tracking-[0.3em] text-mute">
                    {error ? `展卷失敗：${error}` : '展卷中…'}
                </p>
            </main>
        );
    }

    return (
        <main className="h-dvh snap-y snap-mandatory overflow-y-auto no-scrollbar">
            {/* 第一屏 —— 純手卷與拍流 */}
            <section className="relative flex h-dvh snap-start snap-always flex-col">
            {/* 簷口一線 —— 珠簾即當日行程：一拍亮一段，走拍的那串在呼吸 */}
            <header className="relative border-b border-hairline/60 bg-surface/60 px-4 pb-3 pt-4 backdrop-blur-sm dark:bg-elevated/40 sm:px-8">
                <BeadCurtain
                    strings={34}
                    className="absolute inset-x-0 top-0 h-8 opacity-60"
                    progress={{
                        total: snapshot.clock.ticksPerDay,
                        done: snapshot.clock.tickOfDay,
                        active: snapshot.phase === 'running',
                    }}
                />
                <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Link href="/lab" aria-label="回卷架" title="回卷架" className="inline-flex items-center font-serif text-base text-mute hover:text-cinnabar">
                        <IconBack />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="truncate font-serif text-lg tracking-[0.15em] text-ink">{snapshot.meta.title}</h1>
                        <p className="truncate font-serif text-2xs tracking-[0.18em] text-mute" title={`${snapshot.saga.name} · 本日第 ${snapshot.clock.tickOfDay + 1}／${snapshot.clock.ticksPerDay} 拍`}>
                            {snapshot.saga.name} · {snapshot.saga.worldTime?.label}
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <Link
                            href={`/lab/run/${id}/reading`}
                            aria-label="卷宗與章回"
                            title="卷宗與章回"
                            className="es-icon-button !h-11 !w-11 text-[20px]"
                        >
                            <IconScroll />
                        </Link>
                        <Link
                            href="/lab/assets"
                            aria-label="圖庫"
                            title="圖庫 · 人物與場景之圖"
                            className="es-icon-button !h-11 !w-11 text-[20px]"
                        >
                            <IconGallery />
                        </Link>
                        <button
                            type="button"
                            onClick={() => setDrawer((v) => !v)}
                            aria-label="物界配置"
                            title="物界 · 爭奪之物／物件／天時／場景物理／記憶"
                            className={`es-icon-button !h-11 !w-11 text-[20px] ${drawer ? 'border-cinnabar/60 text-cinnabar' : ''}`}
                        >
                            <IconObjects />
                        </button>
                    </div>
                    <div className="w-full">
                        <LabControls snapshot={snapshot} onChanged={refresh} />
                    </div>
                </div>
            </header>

            {error ? (
                <p className="px-4 py-2 font-serif text-xs text-cinnabar sm:px-8" role="alert">{error}</p>
            ) : null}

            {/* 主舞台 —— 手卷滿幅；拍流是懸浮可折的匣，不再切走橫向 */}
            <div className="relative min-h-[56vh] flex-1 overflow-hidden">
                <LabHandscroll
                    saga={snapshot.saga}
                    scenes={snapshot.scenes}
                    locations={snapshot.locations}
                    streams={snapshot.streams}
                    artByLocationId={snapshot.artByLocationId}
                    onSelectScene={(sceneId) => {
                        setFocusedCharacterId(null);
                        setFocusedSceneId(sceneId);
                    }}
                />
                <LabBeatDock feed={feed} running={snapshot.phase === 'running'} />
                <AnimatePresence>
                    {focusedScene ? (
                        <LabSceneSheet
                            key={focusedScene.id}
                            scene={focusedScene}
                            characters={snapshot.characters}
                            beats={feed}
                            locationArt={focusedLocationArt}
                            clock={snapshot.saga.worldTime?.label}
                            onSelectCharacter={(characterId) => {
                                setFocusedSceneId(null);
                                setFocusedCharacterId(characterId);
                            }}
                            onClose={() => setFocusedSceneId(null)}
                        />
                    ) : null}
                    {focusedCharacter ? (
                        <LabCharacterSheet
                            key={focusedCharacter.id}
                            runId={id}
                            character={focusedCharacter}
                            onJumpToScene={(sceneId) => {
                                setFocusedCharacterId(null);
                                setFocusedSceneId(sceneId);
                            }}
                            onClose={() => setFocusedCharacterId(null)}
                        />
                    ) : null}
                </AnimatePresence>
            </div>

                {/* 屏腳一縷：往下有名帖 */}
                <button
                    type="button"
                    onClick={() => document.getElementById('lab-cast-screen')?.scrollIntoView({ behavior: 'smooth' })}
                    className="absolute inset-x-0 bottom-1.5 z-20 mx-auto flex w-fit flex-col items-center gap-0.5 font-serif text-2xs tracking-[0.35em] text-mute/70 transition hover:text-cinnabar"
                    title="下有名帖（人物內頁自此開）"
                >
                    名帖
                    <span aria-hidden className="text-[10px] leading-none">▾</span>
                </button>
            </section>

            {/* 第二屏 —— 名帖 */}
            <section id="lab-cast-screen" className="min-h-dvh snap-start snap-always px-4 pb-12 pt-10 sm:px-8">
                <div className="flex items-baseline justify-between">
                    <p className="font-serif text-sm tracking-[0.4em] text-ink" title="點名帖開人物內頁：狀態／心事／記憶／影像">名帖</p>
                    <button
                        type="button"
                        onClick={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="font-serif text-2xs tracking-[0.35em] text-mute/70 transition hover:text-cinnabar"
                        title="回手卷"
                    >
                        ▴ 手卷
                    </button>
                </div>
                <div className="mt-5">
                    <LabCastRail
                        characters={snapshot.characters}
                        onSelectCharacter={(characterId) => {
                            // 內頁開在第一屏的舞台上——先捲回去再開
                            document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
                            setFocusedCharacterId(characterId);
                        }}
                    />
                </div>
            </section>

            {/* 物界抽屜 */}
            {drawer ? (
                <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md p-3 sm:p-4">
                    <LabConfigDrawer
                        runId={id}
                        running={snapshot.phase === 'running'}
                        characters={snapshot.characters.map((c) => ({ id: c.id, name: c.name }))}
                        onClose={() => setDrawer(false)}
                    />
                </div>
            ) : null}
        </main>
    );
}
