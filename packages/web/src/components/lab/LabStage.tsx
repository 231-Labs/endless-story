'use client';

/**
 * LabStage — shared 春雪社／片場 stage for one run.
 * role=viewer → guest chrome + 看戲／看世界／讀章回
 * role=director → operator chrome + controls / 物界 / export / interview
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { BeadCurtain } from '@/components/lab/LabOrnaments';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { IconBack, IconExport, IconGallery, IconInterview, IconObjects, IconScroll } from '@/components/lab/LabIcons';
import { LabBeatDock } from '@/components/lab/LabBeatDock';
import { LabCastRail } from '@/components/lab/LabCastRail';
import { LabCharacterSheet } from '@/components/lab/LabCharacterSheet';
import { LabConfigDrawer } from '@/components/lab/LabConfigDrawer';
import { LabControls } from '@/components/lab/LabControls';
import { LabGuestChrome } from '@/components/lab/LabGuestChrome';
import { LabFirstVisit } from '@/components/lab/LabFirstVisit';
import { LabHandscroll } from '@/components/lab/LabHandscroll';
import { LabProductionPanel } from '@/components/lab/LabProductionPanel';
import { LabReadingEmbed } from '@/components/lab/LabReadingEmbed';
import { LabSceneSheet } from '@/components/lab/LabSceneSheet';
import { LabTheaterMode, type TheaterChoice } from '@/components/lab/LabTheaterMode';
import { LabWatchPanel } from '@/components/lab/LabWatchPanel';
import { LabWishBoard } from '@/components/lab/LabWishBoard';
import { LabWishWall } from '@/components/lab/LabWishWall';
import { terrainArtFor } from '@/components/saga/handscroll/terrainArt';
import { labApi, useLabLive, type LabClientRole } from '@/components/lab/useLab';
import type { DailyShot } from '@/lib/lab/daily-shot';
import type { LabLiveSnapshot } from '@/lib/lab/live';
import type { LabLiveBeat } from '@/lib/lab/types';
import {
    discoverCharacter,
    getDiscoveredCharacterIds,
    getLastMode,
    getTrackedCharacterId,
    isFirstVisitDone,
    setLastMode,
    setTrackedCharacterId,
    setTrackedLocationId,
    type GuestViewMode,
} from '@/components/lab/viewer-state';

const PART_LABEL: Record<string, string> = {
    清晨: '清晨',
    日午: '日午',
    晡時: '晡時',
    黃昏: '黃昏',
    入夜: '入夜',
    夜深: '夜深',
    morning: '朝',
    noon: '午',
    dusk: '暮',
    night: '夜',
};

export function LabStage({
    runId,
    role,
    brand = '春雪社',
    featuredCastNames = ['柳安春', '蘇映雪', '金鳳'],
    enableFirstVisit = false,
}: {
    runId: string;
    role: LabClientRole;
    brand?: string;
    featuredCastNames?: readonly string[];
    enableFirstVisit?: boolean;
}) {
    const director = role === 'director';
    const { snapshot, feed, error, refresh } = useLabLive(runId, { source: director ? 'lab' : 'public' });
    const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);
    const [focusedCharacterId, setFocusedCharacterId] = useState<string | null>(null);
    const [drawer, setDrawer] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [mode, setMode] = useState<GuestViewMode>('watch');
    const [shot, setShot] = useState<DailyShot | null>(null);
    const [theaterOpen, setTheaterOpen] = useState(false);
    const [showFirstVisit, setShowFirstVisit] = useState(false);
    const [discovered, setDiscovered] = useState<string[]>([]);
    const [trackedCharacterId, setTrackedId] = useState<string | null>(null);
    const [dossierFocus, setDossierFocus] = useState<string | null>(null);

    useEffect(() => {
        if (director) return;
        setDiscovered(getDiscoveredCharacterIds());
        const tracked = getTrackedCharacterId();
        setTrackedId(tracked);
        const last = getLastMode();
        if (tracked) setMode(last === 'read' ? 'read' : 'world');
        else if (last) setMode(last);
        else setMode('watch');
        if (enableFirstVisit && !isFirstVisitDone()) setShowFirstVisit(true);
    }, [director, enableFirstVisit]);

    useEffect(() => {
        let cancelled = false;
        const loadShot = director ? labApi.dailyShot(runId) : labApi.publicDailyShot();
        void loadShot
            .then((res) => {
                if (!cancelled) setShot(res.shot);
            })
            .catch(() => {
                if (!cancelled) setShot(null);
            });
        return () => {
            cancelled = true;
        };
    }, [runId, director]);

    const onExport = useCallback(async () => {
        setExporting(true);
        setExportError(null);
        try {
            const { blob, filename } = await labApi.export(runId);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            setExportError(e instanceof Error ? e.message : String(e));
        } finally {
            setExporting(false);
        }
    }, [runId]);

    const changeMode = useCallback((next: GuestViewMode) => {
        setMode(next);
        setLastMode(next);
        setTheaterOpen(false);
        setFocusedSceneId(null);
    }, []);

    const focusedScene = useMemo(
        () => snapshot?.scenes.find((s) => s.id === focusedSceneId) ?? null,
        [snapshot, focusedSceneId],
    );
    const focusedCharacter = useMemo(
        () => snapshot?.characters.find((c) => c.id === focusedCharacterId) ?? null,
        [snapshot, focusedCharacterId],
    );
    const activeCharacterIds = useMemo(() => {
        const currentTick = snapshot?.clock.currentTick;
        if (currentTick == null) return new Set<string>();
        return new Set(
            feed.filter((b) => b.kind !== 'move' && b.tick >= currentTick - 1).map((b) => b.characterId),
        );
    }, [feed, snapshot?.clock.currentTick]);
    const focusedLocationArt = useMemo(() => {
        if (!snapshot || !focusedScene) return undefined;
        const loc = snapshot.locations.find((l) => l.id === focusedScene.locationId);
        return terrainArtFor(loc?.name) ?? undefined;
    }, [snapshot, focusedScene]);

    const clockLabel = useMemo(() => {
        if (!snapshot) return '展卷中';
        const day = snapshot.clock.day;
        const part = PART_LABEL[snapshot.clock.partOfDay] ?? snapshot.clock.partOfDay;
        return `第 ${day} 日・${part}`;
    }, [snapshot]);

    const spotlightLocationName = shot?.locationName || snapshot?.locations[0]?.name || '後台妝閣';

    const visibleCast = useMemo(() => {
        if (!snapshot) return [];
        if (director) return snapshot.characters;
        const featuredIds = new Set(
            snapshot.characters.filter((c) => featuredCastNames.includes(c.name)).map((c) => c.id),
        );
        const allowed = new Set([...featuredIds, ...discovered]);
        return snapshot.characters.filter((c) => allowed.has(c.id));
    }, [snapshot, director, featuredCastNames, discovered]);

    const trackingName = useMemo(() => {
        if (!trackedCharacterId || !snapshot) return null;
        return snapshot.characters.find((c) => c.id === trackedCharacterId)?.name ?? null;
    }, [trackedCharacterId, snapshot]);

    const selectCharacter = useCallback(
        (characterId: string) => {
            setFocusedSceneId(null);
            setFocusedCharacterId(characterId);
            if (!director) setDiscovered(discoverCharacter(characterId));
        },
        [director],
    );

    const onTheaterChoice = useCallback(
        (choice: TheaterChoice) => {
            setTheaterOpen(false);
            if (choice === 'follow') {
                const focusId =
                    shot?.focusCharacterId ||
                    snapshot?.characters.find((c) => c.name === (shot?.focusCharacterName || '柳安春'))?.id ||
                    null;
                if (focusId) {
                    setTrackedCharacterId(focusId);
                    setTrackedId(focusId);
                    setDiscovered(discoverCharacter(focusId));
                    setFocusedCharacterId(focusId);
                }
                changeMode('world');
            } else if (choice === 'before') {
                setDossierFocus(shot?.dossierSlug ?? null);
                changeMode('read');
            } else {
                changeMode('world');
            }
        },
        [shot, snapshot, changeMode],
    );

    if (!snapshot) {
        return (
            <main className="flex min-h-dvh items-center justify-center">
                <p className="font-serif text-sm tracking-[0.3em] text-mute">
                    {error ? `展卷失敗：${error}` : '展卷中…'}
                </p>
            </main>
        );
    }

    if (director) {
        return (
            <DirectorStage
                runId={runId}
                snapshot={snapshot}
                feed={feed}
                error={error}
                exportError={exportError}
                refresh={refresh}
                focusedScene={focusedScene}
                focusedCharacter={focusedCharacter}
                focusedLocationArt={focusedLocationArt}
                activeCharacterIds={activeCharacterIds}
                drawer={drawer}
                setDrawer={setDrawer}
                exporting={exporting}
                onExport={onExport}
                setFocusedSceneId={setFocusedSceneId}
                setFocusedCharacterId={setFocusedCharacterId}
                selectCharacter={selectCharacter}
            />
        );
    }

    return (
        <main className="flex h-dvh flex-col overflow-hidden">
            {showFirstVisit ? (
                <LabFirstVisit
                    brand={brand}
                    clockLabel={clockLabel}
                    locationName={spotlightLocationName}
                    shot={shot}
                    onEnterTheater={() => {
                        setShowFirstVisit(false);
                        setTheaterOpen(true);
                    }}
                    onDone={() => setShowFirstVisit(false)}
                />
            ) : null}

            {shot ? (
                <LabTheaterMode
                    shot={shot}
                    open={theaterOpen}
                    onClose={() => setTheaterOpen(false)}
                    onChoice={onTheaterChoice}
                />
            ) : null}

            <LabGuestChrome
                brand={brand}
                clockLabel={clockLabel}
                mode={mode}
                onModeChange={changeMode}
                trackingName={trackingName}
                cast={snapshot.characters.map((c) => ({ id: c.id, name: c.name, role: c.role }))}
            />

            {error ? (
                <p className="px-4 py-2 font-serif text-xs text-cinnabar sm:px-8" role="alert">
                    {error}
                </p>
            ) : null}

            {mode === 'watch' ? (
                <LabWatchPanel
                    shot={shot}
                    brand={brand}
                    clockLabel={clockLabel}
                    onEnterTheater={() => setTheaterOpen(true)}
                />
            ) : null}

            {mode === 'read' ? (
                <LabReadingEmbed runId={runId} initialDossierSlug={dossierFocus} source="public" />
            ) : null}

            {mode === 'world' ? (
                <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="relative min-h-0 flex-1 overflow-hidden">
                        <LabHandscroll
                            saga={snapshot.saga}
                            scenes={snapshot.scenes}
                            locations={snapshot.locations}
                            streams={snapshot.streams}
                            artByLocationId={snapshot.artByLocationId}
                            onSelectScene={(sceneId) => {
                                setFocusedCharacterId(null);
                                setFocusedSceneId(sceneId);
                                const scene = snapshot.scenes.find((s) => s.id === sceneId);
                                if (scene?.locationId) setTrackedLocationId(scene.locationId);
                                // Discover characters present in this scene
                                for (const c of snapshot.characters) {
                                    if (c.sceneId === sceneId) setDiscovered(discoverCharacter(c.id));
                                }
                            }}
                        />
                        <LabBeatDock
                            feed={feed}
                            running={snapshot.phase === 'running'}
                            onCastClick={() =>
                                document.getElementById('lab-guest-cast')?.scrollIntoView({ behavior: 'smooth' })
                            }
                        />
                        <AnimatePresence>
                            {focusedScene ? (
                                <LabSceneSheet
                                    key={focusedScene.id}
                                    scene={focusedScene}
                                    characters={snapshot.characters}
                                    beats={feed}
                                    objects={snapshot.objects}
                                    prayers={snapshot.prayers}
                                    locationArt={focusedLocationArt}
                                    clock={snapshot.saga.worldTime?.label}
                                    onSelectCharacter={selectCharacter}
                                    onClose={() => setFocusedSceneId(null)}
                                />
                            ) : null}
                            {focusedCharacter ? (
                                <LabCharacterSheet
                                    key={focusedCharacter.id}
                                    runId={runId}
                                    character={focusedCharacter}
                                    onJumpToScene={(sceneId) => {
                                        setFocusedCharacterId(null);
                                        setFocusedSceneId(sceneId);
                                    }}
                                    onSelectCharacter={selectCharacter}
                                    onClose={() => setFocusedCharacterId(null)}
                                />
                            ) : null}
                        </AnimatePresence>
                    </div>
                    <div
                        id="lab-guest-cast"
                        className="max-h-[34vh] overflow-y-auto border-t border-hairline/60 px-4 py-4 sm:px-8"
                    >
                        <div className="mb-3 flex items-baseline justify-between">
                            <p className="font-serif text-xs tracking-[0.4em] text-ink">名帖</p>
                            <p className="font-serif text-2xs tracking-[0.25em] text-mute">
                                初識三人；其餘在場景裡遇見後加入
                            </p>
                        </div>
                        <LabCastRail
                            characters={visibleCast}
                            activeIds={activeCharacterIds}
                            onSelectCharacter={(characterId) => {
                                setTrackedCharacterId(characterId);
                                setTrackedId(characterId);
                                selectCharacter(characterId);
                            }}
                        />
                    </div>
                </section>
            ) : null}
        </main>
    );
}

function DirectorStage({
    runId,
    snapshot,
    feed,
    error,
    exportError,
    refresh,
    focusedScene,
    focusedCharacter,
    focusedLocationArt,
    activeCharacterIds,
    drawer,
    setDrawer,
    exporting,
    onExport,
    setFocusedSceneId,
    setFocusedCharacterId,
    selectCharacter,
}: {
    runId: string;
    snapshot: LabLiveSnapshot;
    feed: LabLiveBeat[];
    error?: string;
    exportError: string | null;
    refresh: () => void;
    focusedScene: LabLiveSnapshot['scenes'][number] | null;
    focusedCharacter: LabLiveSnapshot['characters'][number] | null;
    focusedLocationArt?: string;
    activeCharacterIds: Set<string>;
    drawer: boolean;
    setDrawer: (v: boolean | ((b: boolean) => boolean)) => void;
    exporting: boolean;
    onExport: () => void;
    setFocusedSceneId: (id: string | null) => void;
    setFocusedCharacterId: (id: string | null) => void;
    selectCharacter: (id: string) => void;
}) {
    return (
        <main className="h-dvh snap-y snap-mandatory overflow-y-auto no-scrollbar">
            <section className="relative flex h-dvh snap-start snap-always flex-col">
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
                        <Link
                            href="/lab"
                            aria-label="回卷架"
                            title="回卷架"
                            className="inline-flex items-center font-serif text-base text-mute hover:text-cinnabar"
                        >
                            <IconBack />
                        </Link>
                        <div className="min-w-0">
                            <h1 className="truncate font-serif text-lg tracking-[0.15em] text-ink">
                                片場 · {snapshot.meta.title}
                            </h1>
                            <p
                                className="truncate font-serif text-2xs tracking-[0.18em] text-mute"
                                title={`${snapshot.saga.name} · 本日第 ${snapshot.clock.tickOfDay + 1}／${snapshot.clock.ticksPerDay} 拍`}
                            >
                                {snapshot.saga.name} · {snapshot.saga.worldTime?.label}
                            </p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <ThemeToggle className="es-icon-button !h-11 !w-11 text-[20px]" />
                            <Link
                                href={`/lab/run/${runId}/reading`}
                                aria-label="卷宗與章回"
                                title="卷宗與章回"
                                className="es-icon-button !h-11 !w-11 text-[20px]"
                            >
                                <IconScroll />
                            </Link>
                            <Link
                                href={`/lab/assets?from=${encodeURIComponent(`/lab/run/${runId}`)}`}
                                aria-label="圖庫"
                                title="圖庫 · 人物與場景之圖"
                                className="es-icon-button !h-11 !w-11 text-[20px]"
                            >
                                <IconGallery />
                            </Link>
                            <Link
                                href={`/lab/run/${runId}/interview`}
                                aria-label="演員訪談室"
                                title="演員訪談室"
                                className="es-icon-button !h-11 !w-11 text-[20px]"
                            >
                                <IconInterview />
                            </Link>
                            <button
                                type="button"
                                onClick={() => setDrawer((v) => !v)}
                                aria-label="物界配置"
                                title="物界"
                                className={`es-icon-button !h-11 !w-11 text-[20px] ${drawer ? 'border-cinnabar/60 text-cinnabar' : ''}`}
                            >
                                <IconObjects />
                            </button>
                            <button
                                type="button"
                                onClick={onExport}
                                disabled={exporting}
                                aria-label="導出診斷"
                                title={exporting ? '導出中…' : '導出診斷'}
                                className="es-icon-button !h-11 !w-11 text-[20px] disabled:opacity-50"
                            >
                                <IconExport />
                            </button>
                        </div>
                        <div className="w-full">
                            <LabControls snapshot={snapshot} onChanged={refresh} />
                        </div>
                    </div>
                </header>

                {error ? (
                    <p className="px-4 py-2 font-serif text-xs text-cinnabar sm:px-8" role="alert">
                        {error}
                    </p>
                ) : null}
                {exportError ? (
                    <p className="px-4 py-2 font-serif text-xs text-cinnabar sm:px-8" role="alert">
                        導出失敗：{exportError}
                    </p>
                ) : null}

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
                    <LabBeatDock
                        feed={feed}
                        running={snapshot.phase === 'running'}
                        onCastClick={() =>
                            document.getElementById('lab-cast-screen')?.scrollIntoView({ behavior: 'smooth' })
                        }
                    />
                    {snapshot.production ? <LabProductionPanel production={snapshot.production} /> : null}
                    <AnimatePresence>
                        {focusedScene ? (
                            <LabSceneSheet
                                key={focusedScene.id}
                                scene={focusedScene}
                                characters={snapshot.characters}
                                beats={feed}
                                objects={snapshot.objects}
                                prayers={snapshot.prayers}
                                locationArt={focusedLocationArt}
                                clock={snapshot.saga.worldTime?.label}
                                onSelectCharacter={selectCharacter}
                                onClose={() => setFocusedSceneId(null)}
                            />
                        ) : null}
                        {focusedCharacter ? (
                            <LabCharacterSheet
                                key={focusedCharacter.id}
                                runId={runId}
                                character={focusedCharacter}
                                onJumpToScene={(sceneId) => {
                                    setFocusedCharacterId(null);
                                    setFocusedSceneId(sceneId);
                                }}
                                onSelectCharacter={selectCharacter}
                                onClose={() => setFocusedCharacterId(null)}
                            />
                        ) : null}
                    </AnimatePresence>
                </div>
            </section>

            <section id="lab-cast-screen" className="min-h-dvh snap-start snap-always px-4 pb-12 pt-10 sm:px-8">
                <div className="flex items-baseline justify-between">
                    <p className="font-serif text-sm tracking-[0.4em] text-ink">名帖</p>
                    <button
                        type="button"
                        onClick={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="font-serif text-2xs tracking-[0.35em] text-mute/70 transition hover:text-cinnabar"
                    >
                        ▴ 手卷
                    </button>
                </div>
                <div className="mt-5">
                    <LabCastRail
                        characters={snapshot.characters}
                        activeIds={activeCharacterIds}
                        onSelectCharacter={(characterId) => {
                            document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
                            selectCharacter(characterId);
                        }}
                    />
                </div>
            </section>

            <section id="lab-wish-screen" className="min-h-dvh snap-start snap-always px-4 pb-12 pt-10 sm:px-8">
                <div className="flex items-baseline justify-between">
                    <p className="font-serif text-sm tracking-[0.4em] text-ink">願榜</p>
                    <button
                        type="button"
                        onClick={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="font-serif text-2xs tracking-[0.35em] text-mute/70 transition hover:text-cinnabar"
                    >
                        ▴ 手卷
                    </button>
                </div>
                <LabWishBoard
                    characters={snapshot.characters}
                    onSelectCharacter={(characterId) => {
                        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
                        selectCharacter(characterId);
                    }}
                />
            </section>

            <section id="lab-wish-wall-screen" className="min-h-dvh snap-start snap-always px-4 pb-12 pt-10 sm:px-8">
                <div className="flex items-baseline justify-between">
                    <p className="font-serif text-sm tracking-[0.4em] text-ink">願牆</p>
                    <button
                        type="button"
                        onClick={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="font-serif text-2xs tracking-[0.35em] text-mute/70 transition hover:text-cinnabar"
                    >
                        ▴ 手卷
                    </button>
                </div>
                <LabWishWall
                    prayers={snapshot.prayers}
                    onSelectCharacter={(characterId) => {
                        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
                        selectCharacter(characterId);
                    }}
                />
            </section>

            {drawer ? (
                <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md p-3 sm:p-4">
                    <LabConfigDrawer
                        runId={runId}
                        running={snapshot.phase === 'running'}
                        characters={snapshot.characters.map((c) => ({ id: c.id, name: c.name }))}
                        onClose={() => setDrawer(false)}
                    />
                </div>
            ) : null}
        </main>
    );
}
