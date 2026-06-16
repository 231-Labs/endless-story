'use client';

import { useEffect, useState } from 'react';
import type {
  Chapter,
  Character,
  Saga,
  Scene,
} from '@endless-story/shared';
import {
  getSceneDetail,
  type SceneDetailSnapshot,
} from '@/lib/actions/scene-detail';
import { FocusedSceneBackground, OverviewCanvas } from './TroupeCanvasScenery';
import { CanvasHeader, FocusedSceneDetails, SceneGhostQuotes } from './TroupeCanvasPanels';

/**
 * Theater canvas — two modes switched inline:
 *   - overview : whole theater + scene markers + stage pulse
 *   - focused  : clicking one scene turns the same area into its close-up
 */

export function SagaTroupeCanvas({
  saga,
  scenes,
  charactersById,
  chaptersById,
  locationLabel,
  initialFocusedSceneId = null,
  onCloseFocused,
}: {
  saga: Saga;
  scenes: Scene[];
  charactersById: Map<string, Character>;
  chaptersById: Map<string, Chapter>;
  locationLabel: string;
  /** When injected by a parent (e.g. SagaHandscroll), open this scene in focused-mode */
  initialFocusedSceneId?: string | null;
  /** If provided, "back to overview" calls this so the parent regains control (e.g. returns to handscroll); else uses the internal overview. */
  onCloseFocused?: () => void;
}) {
  const [focusedSceneId, setFocusedSceneId] = useState<string | null>(initialFocusedSceneId);
  const [povId, setPovId] = useState<string | null>(null);
  const focusedScene = scenes.find((s) => s.id === focusedSceneId) ?? null;
  const worldTime = saga.worldTime;

  const handleBack = () => {
    if (onCloseFocused) {
      onCloseFocused();
    } else {
      setFocusedSceneId(null);
    }
  };

  // Reset pov when scene changes
  useEffect(() => {
    setPovId(null);
  }, [focusedSceneId]);

  // Fetch this scene's on-chain events (the "past" + ghost lines) when
  // focused. The chain Scene has no UI event history, so without this the
  // focused view is always empty even after events ran here.
  const [sceneDetail, setSceneDetail] = useState<SceneDetailSnapshot | null>(null);
  useEffect(() => {
    if (!focusedSceneId || !/^0x[0-9a-fA-F]{64}$/.test(focusedSceneId)) {
      setSceneDetail(null);
      return;
    }
    let cancelled = false;
    setSceneDetail(null);
    getSceneDetail(focusedSceneId)
      .then((d) => {
        if (!cancelled) setSceneDetail(d);
      })
      .catch(() => {
        if (!cancelled) setSceneDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [focusedSceneId]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      {/* Background Canvas (Full Screen) */}
      <div className="absolute inset-0">
        {focusedScene ? (
          <FocusedSceneBackground
            scene={focusedScene}
            povId={povId}
            worldTime={worldTime ?? null}
          />
        ) : (
          <OverviewCanvas
            saga={saga}
            scenes={scenes}
            charactersById={charactersById}
            onSelect={setFocusedSceneId}
          />
        )}
      </div>

      {/* Overlays */}
      <div className="absolute inset-0 pointer-events-none z-20 flex flex-col">
        {/* Header Area (padding for SiteNav) */}
        <div
          className="min-h-[max(5rem,calc(env(safe-area-inset-top,0px)+3.75rem))] shrink-0 sm:h-20 sm:min-h-0"
          aria-hidden
        />

        {focusedScene ? (
          <div className="flex flex-1 min-h-0 pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] pointer-events-auto overflow-y-auto overscroll-contain snap-y snap-mandatory scroll-smooth">
            {/* Screen 1: Overview */}
            <div className="flex min-h-full flex-col snap-start snap-always px-4 sm:px-10 pb-12 pt-0">
              <CanvasHeader
                worldTime={worldTime}
                focusedScene={focusedScene}
                onBack={handleBack}
              />

            {/* Status Cards */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
                {focusedScene.performance ? (
                  <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-full border border-cinnabar/45 bg-surface/80 px-3 py-2 text-2xs leading-relaxed tracking-widest text-cinnabar shadow-md shadow-cinnabar/15 backdrop-blur-md dark:bg-elevated/70">
                    <span aria-hidden className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inset-0 animate-ping rounded-full bg-cinnabar opacity-75" />
                      <span className="relative h-2 w-2 rounded-full bg-cinnabar" />
                    </span>
                    <span className="break-words">
                      正在演《{focusedScene.performance.title}》
                    </span>
                  </div>
                ) : (
                  <div className="min-w-0 rounded-2xl border border-hairline/50 bg-surface/75 px-3 py-2 text-2xs tracking-widest text-mute backdrop-blur-md dark:bg-elevated/55">
                    {sceneDetail?.events.length ?? focusedScene.pastEvents?.length ?? 0} 段已發生 · 持續累積
                  </div>
                )}
              </div>

              <div className="mt-auto pt-24 relative">
                <SceneGhostQuotes
                  scene={focusedScene}
                  charactersById={charactersById}
                  povId={povId}
                  onPovChange={setPovId}
                  liveQuotes={sceneDetail?.ghostQuotes ?? []}
                />
              </div>
            </div>

            {/* Screen 2: Details */}
            <div className="flex min-h-full flex-col snap-start snap-always px-4 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] pt-12 sm:px-10 sm:pb-12">
              <FocusedSceneDetails
                scene={focusedScene}
                chaptersById={chaptersById}
                events={sceneDetail?.events ?? []}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between px-5 sm:px-10 pb-12 pointer-events-none">
            {/* Title & Meta */}
            <div className="pointer-events-auto max-w-3xl mt-4 sm:mt-8">
              <h1 className="font-serif text-5xl tracking-widest text-ink drop-shadow-md sm:text-6xl lg:text-7xl">
                {saga.name}
              </h1>
            </div>

            {/* Premise Text (Bottom Left) */}
            <div className="pointer-events-auto max-w-xl mb-8">
              <div className="border-l-2 border-cinnabar/60 pl-5">
                <p className="font-serif text-xs tracking-[0.2em] text-mute/80 uppercase mb-2">本回 Premise</p>
                <p className="font-serif text-base leading-relaxed text-ink/90 sm:text-lg drop-shadow-sm">
                  {saga.premise}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scroll Hint (Only show when not focused) */}
      {!focusedScene && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-75 pointer-events-none z-20 [@media(max-height:520px)]:hidden">
          <span className="text-2xs tracking-[0.35em] text-cinnabar/80">往下翻閱</span>
          <div className="h-6 w-px overflow-hidden bg-hairline sm:h-8">
            <div className="h-full w-full bg-cinnabar/90 animate-scroll-down-line" />
          </div>
        </div>
      )}
    </div>
  );
}
