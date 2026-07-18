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
import { LabBeatFeed } from '@/components/lab/LabBeatFeed';
import { LabCastRail } from '@/components/lab/LabCastRail';
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
    const [drawer, setDrawer] = useState(false);

    const focusedScene = useMemo(
        () => snapshot?.scenes.find((s) => s.id === focusedSceneId) ?? null,
        [snapshot, focusedSceneId],
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
        <main className="flex min-h-dvh flex-col">
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
                    <div className="ml-auto flex items-center gap-1.5">
                        <Link
                            href={`/lab/run/${id}/reading`}
                            aria-label="卷宗與章回"
                            title="卷宗與章回"
                            className="es-icon-button !h-9 !w-9 text-[15px]"
                        >
                            <IconScroll />
                        </Link>
                        <Link
                            href="/lab/assets"
                            aria-label="圖庫"
                            title="圖庫 · 人物與場景之圖"
                            className="es-icon-button !h-9 !w-9 text-[15px]"
                        >
                            <IconGallery />
                        </Link>
                        <button
                            type="button"
                            onClick={() => setDrawer((v) => !v)}
                            aria-label="物界配置"
                            title="物界 · 爭奪之物／物件／天時／場景物理"
                            className={`es-icon-button !h-9 !w-9 text-[15px] ${drawer ? 'border-cinnabar/60 text-cinnabar' : ''}`}
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

            {/* 主舞台 */}
            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
                <section className="relative min-h-[52vh] overflow-hidden lg:min-h-0">
                    <LabHandscroll
                        saga={snapshot.saga}
                        scenes={snapshot.scenes}
                        locations={snapshot.locations}
                        streams={snapshot.streams}
                        artByLocationId={snapshot.artByLocationId}
                        onSelectScene={setFocusedSceneId}
                    />
                    <AnimatePresence>
                        {focusedScene ? (
                            <LabSceneSheet
                                key={focusedScene.id}
                                scene={focusedScene}
                                characters={snapshot.characters}
                                beats={feed}
                                locationArt={focusedLocationArt}
                                clock={snapshot.saga.worldTime?.label}
                                onClose={() => setFocusedSceneId(null)}
                            />
                        ) : null}
                    </AnimatePresence>
                </section>

                {/* 拍流 */}
                <aside className="min-h-0 border-t border-hairline/60 lg:border-l lg:border-t-0">
                    <div className="flex h-full min-h-0 flex-col">
                        <div className="border-b border-hairline/50 px-4 py-2.5">
                            <p className="font-serif text-2xs tracking-[0.35em] text-cinnabar/90" title="每個角色此刻回的話與心聲；幽＝窗內事">拍流</p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 no-scrollbar lg:max-h-none">
                            <LabBeatFeed feed={feed} />
                        </div>
                    </div>
                </aside>
            </div>

            {/* 名帖排 */}
            <section className="border-t border-hairline/60 px-4 py-4 sm:px-8">
                <p className="font-serif text-2xs tracking-[0.35em] text-mute" title="各自身在何處、心頭最熱的一樁；點名帖跳到其所在場景">名帖</p>
                <div className="mt-3">
                    <LabCastRail characters={snapshot.characters} onSelectScene={setFocusedSceneId} />
                </div>
            </section>

            {/* 物界抽屜 */}
            {drawer ? (
                <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md p-3 sm:p-4">
                    <LabConfigDrawer runId={id} running={snapshot.phase === 'running'} onClose={() => setDrawer(false)} />
                </div>
            ) : null}
        </main>
    );
}
