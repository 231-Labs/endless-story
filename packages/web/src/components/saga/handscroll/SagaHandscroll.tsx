'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chapter, Character, Saga, SagaLocation, Scene } from '@endless-story/shared';
import { FloatingStream, type StreamLine } from './FloatingQuote';
import { SceneFan } from './SceneFan';
import { SceneSheet } from './SceneSheet';
import { terrainArtFor } from './terrainArt';
import { computeHandscrollLayout, type ScenePlacement } from './handscrollLayout';
import { SagaTabBar } from '../SagaTabBar';
import { getSagaLiveSnapshot, getSceneLinesPulse, type OpenEventStatus } from '@/lib/actions/saga-live';

/** A light day/night wash laid over each painted panel so the art lives in the
 *  same hour as the clock (multiply so it darkens toward night). */
/** A gentle hour tint over the painting (soft-light, not multiply) so the art
 *  keeps its own warmth — just cooler by night, warmer by dusk, never dimmed. */
const DAY_WASH: Record<string, { color: string; opacity: number }> = {
  morning: { color: 'rgba(255,245,225,0.35)', opacity: 0.5 },
  noon: { color: 'rgba(255,250,235,0.25)', opacity: 0.4 },
  dusk: { color: 'rgba(200,110,70,0.5)', opacity: 0.55 },
  night: { color: 'rgba(70,80,130,0.6)', opacity: 0.55 },
};

type LiveEvent = OpenEventStatus;

/**
 * Main saga screen: a native horizontally-scrolling handscroll.
 *
 * Structure:
 *   - outer scroll container (overflow-x-auto, snap-x)
 *   - content width max(300vw, 1200px) — small phones can still swipe it open
 *     without crushing punctuation / quotes.
 *
 * Clicking a 團扇 opens the scene sheet (內頁).
 */

// Handscroll horizontal layout is data-driven (see handscrollLayout.ts): one
// segment per covered location, scenes placed within their segment. A scene
// anchor = ScenePlacement xPct/yPct (percent of full scroll width/height).

interface Props {
  saga: Saga;
  scenes: Scene[];
  /**
   * Locations the saga covers (resolved from `Saga.covered_location_ids`).
   * Rendered as the large zone labels along the handscroll.
   * Order = layout order: locations[0] left, [1] middle, [2] right.
   */
  locations: SagaLocation[];
  charactersById: Map<string, Character>;
  chaptersById: Map<string, Chapter>;
  locationLabel: string;
}

export function SagaHandscroll(props: Props) {
  const { saga, scenes, locations, charactersById, chaptersById, locationLabel } = props;
  const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Live overlay: poll fresh chain state (presence / open-event / latest
  // action line) and merge the volatile fields onto the server-rendered
  // scenes. Polling (not websockets) because the world only changes on
  // discrete admin ticks + Sui public-node subscriptions are deprecated.
  // Gated to document visibility to save RPC. No-op for mock scenes (the
  // snapshot returns [] when nothing's anchored on chain).
  const [liveScenes, setLiveScenes] = useState<Scene[]>(scenes);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  // Latest ghost line per scene WITH its register (act/move/warmth/…), kept
  // alongside the Scene merge because Scene.ghostQuotes can't carry the kind.
  const [liveLineByScene, setLiveLineByScene] = useState<
    Record<string, { characterId: string; text: string; kind: string }>
  >({});
  // 題字流：per-scene recent beats from the local ring — polled OFTEN because
  // it costs zero RPC (a file read server-side), unlike the chain snapshot.
  const [streamByScene, setStreamByScene] = useState<Record<string, StreamLine[]>>({});
  useEffect(() => {
    if (!saga.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Private rooms never float their lines onto the public scroll — 窗內事.
    const sceneIds = scenes.filter((s) => (s.privacyLevel ?? 0) < 3).map((s) => s.id);
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        try {
          const { linesByScene } = await getSceneLinesPulse(sceneIds);
          if (!cancelled) {
            setStreamByScene((prev) => {
              const next: Record<string, StreamLine[]> = { ...prev };
              for (const [sid, lines] of Object.entries(linesByScene)) {
                next[sid] = lines.map((l) => ({
                  key: `${l.ts}-${l.characterId}`,
                  text: l.text,
                  speakerName: charactersById.get(l.characterId)?.name,
                  kind: l.kind,
                }));
              }
              return next;
            });
          }
        } catch {
          /* keep last stream */
        }
      }
      if (!cancelled) timer = setTimeout(tick, 6000);
    };
    timer = setTimeout(tick, 300);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // charactersById is a stable Map prop per render of the page shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saga.id, scenes]);
  useEffect(() => {
    if (!saga.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        try {
          const snap = await getSagaLiveSnapshot(saga.id);
          if (!cancelled && snap.scenes.length > 0) {
            const byId = new Map(snap.scenes.map((s) => [s.sceneId, s]));
            setLiveScenes((prev) =>
              prev.map((s) => {
                const live = byId.get(s.id);
                if (!live) return s;
                return {
                  ...s,
                  currentCharacterIds: live.presentCharacterIds,
                  performance: live.hasOpenEvent
                    ? { title: live.eventTitle ?? '一場戲', startedAt: s.performance?.startedAt ?? '' }
                    : undefined,
                  ghostQuotes: live.latestLine
                    ? [{ characterId: live.latestLine.characterId, text: live.latestLine.text }]
                    : s.ghostQuotes,
                };
              }),
            );
          }
          if (!cancelled) {
            setLiveEvents(snap.openEvents ?? []);
            setLiveLineByScene(
              Object.fromEntries(
                snap.scenes.filter((s) => s.latestLine).map((s) => [s.sceneId, s.latestLine!]),
              ),
            );
          }
        } catch {
          /* transient RPC failure — keep last good state */
        }
      }
      // Chain snapshot demoted to a slow cadence: presence and open events only
      // change on admin ticks, and public-node polling at 6s was the 429 diet.
      // The 題字流 above carries the "alive right now" feel at zero RPC.
      if (!cancelled) timer = setTimeout(tick, 30000);
    };
    // Fetch live data once on mount (presence / open events) so it appears
    // early; then poll every 30s. 300ms lets hydration settle.
    timer = setTimeout(tick, 300);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [saga.id]);

  // Resolve scene + character names for the live-events panel.
  const sceneNameById = new Map(liveScenes.map((s) => [s.id, s.name]));
  const eventCards: EventCard[] = liveEvents.map((e) => ({
    eventId: e.eventId,
    sceneId: e.sceneId,
    title: e.title,
    sceneName: sceneNameById.get(e.sceneId) ?? '某處',
    actedCount: e.actedCount,
    total: e.participantIds.length,
    castNames: e.participantIds
      .map((id) => charactersById.get(id)?.name)
      .filter((n): n is string => Boolean(n)),
  }));

  const partOfDay = saga.worldTime?.partOfDay ?? 'noon';
  const isFocused = focusedSceneId !== null;

  // Data-driven layout: one segment per covered location, scenes placed within.
  // Position depends only on the scene set + locationId (not live presence), so
  // compute from stable `scenes`/`locations`, then map by id back to liveScenes.
  const layout = useMemo(() => computeHandscrollLayout(locations, scenes), [locations, scenes]);
  const placementById = useMemo(() => {
    const m = new Map<string, ScenePlacement>();
    for (const seg of layout.segments) for (const sp of seg.scenes) m.set(sp.scene.id, sp);
    return m;
  }, [layout]);
  const segmentCount = layout.segmentCount;
  // Scroll width scales with segment count: ~96vw each (roomier; min 360vw).
  const scrollVw = Math.max(segmentCount * 96, 360);
  // More scenes → narrower vignettes, so adjacent scenes don't overlap.
  const vignetteWidthPct = Math.min(12, (100 / segmentCount) * 0.55);
  // Subtitle location list matches the axis: only locations this saga actually
  // plays in (same filter as layout), not recruitment-only or unvisited ones.
  const shownLocationLabel = layout.segments.length
    ? layout.segments.map((s) => s.location.name).join(' + ')
    : locationLabel;

  // Intercept vertical wheel events and turn them into horizontal snap between segments
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let isScrolling = false;

    const handleWheel = (e: WheelEvent) => {
      // If the user is already scrolling horizontally (e.g. trackpad), let it through
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const isScrollDown = e.deltaY > 0;
      const isScrollUp = e.deltaY < 0;

      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      const atRightEdge = el.scrollLeft >= maxScrollLeft - 2;
      const atLeftEdge = el.scrollLeft <= 2;

      const outer = el.closest('main');
      const canPageDown =
        outer != null && outer.scrollTop + outer.clientHeight < outer.scrollHeight - 2;
      const canPageUp = outer != null && outer.scrollTop > 2;

      // Scrolled to far right/left: hand vertical scroll to the outer full-bleed snap, avoid getting stuck mid-way
      if (
        outer &&
        ((isScrollDown && atRightEdge && canPageDown) || (isScrollUp && atLeftEdge && canPageUp))
      ) {
        if (isScrolling) return;
        e.preventDefault();
        isScrolling = true;
        const stride = outer.clientHeight;
        outer.scrollBy({ top: isScrollDown ? stride : -stride, behavior: 'smooth' });
        setTimeout(() => {
          isScrolling = false;
        }, 700);
        return;
      }

      if ((isScrollDown && !atRightEdge) || (isScrollUp && !atLeftEdge)) {
        e.preventDefault();

        if (isScrolling) return;

        isScrolling = true;
        const sign = isScrollDown ? 1 : -1;
        el.scrollBy({ left: sign * window.innerWidth, behavior: 'smooth' });

        setTimeout(() => {
          isScrolling = false;
        }, 700);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Live scenes indexed by id, and grouped by covered location (in axis order),
  // so each painted panel can list its own scenes' 團扇 in a row beneath it.
  const liveById = new Map(liveScenes.map((s) => [s.id, s]));
  const scenesByLocation = layout.segments.map((seg) => ({
    seg,
    scenes: seg.scenes.map((sp) => liveById.get(sp.scene.id) ?? sp.scene),
  }));
  const focusedScene = focusedSceneId ? liveById.get(focusedSceneId) ?? null : null;
  const wash = DAY_WASH[partOfDay] ?? DAY_WASH.noon;

  return (
    <>
      <div
        className={`absolute inset-0 flex flex-col ${
          isFocused ? 'pointer-events-none opacity-0' : 'opacity-100'
        } transition-opacity duration-300`}
      >
        {/* 標題 + 世界時 */}
        <header className="shrink-0 px-[max(1rem,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top,0px)+var(--es-site-nav-h)+1rem)] sm:px-10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="es-page-lead-eyebrow">梨園手卷</p>
              <h1 className="es-page-lead-title">{saga.name}</h1>
              <p className="mt-1.5 truncate font-serif text-2xs tracking-[0.25em] text-mute/80 sm:text-xs">
                {shownLocationLabel}
              </p>
            </div>
            {saga.worldTime ? (
              <div className="shrink-0 text-right font-serif text-2xs tracking-[0.3em] text-mute/85 sm:text-xs">
                <p>{saga.worldTime.label}</p>
                <p className="mt-1 text-2xs">
                  Day {saga.worldTime.day}
                  {saga.worldTime.partOfDay ? ` · ${dayPartLabel(saga.worldTime.partOfDay)}` : ''}
                </p>
              </div>
            ) : null}
          </div>

          {/* 正在上演 —— 一行，鏈上開著的戲 */}
          <div className="mt-3 flex min-h-[1.5rem] items-center gap-2 overflow-x-auto no-scrollbar">
            {eventCards.length > 0 ? (
              <>
                <span className="shrink-0 font-serif text-2xs tracking-[0.3em] text-cinnabar/90">正在上演</span>
                {eventCards.map((e) => (
                  <button
                    key={e.eventId}
                    onClick={() => setFocusedSceneId(e.sceneId)}
                    className="shrink-0 rounded-full border border-cinnabar/35 bg-surface/70 px-3 py-1 font-serif text-2xs tracking-[0.15em] text-ink/85 backdrop-blur-sm hover:border-cinnabar/70 dark:bg-elevated/60"
                  >
                    {e.sceneName} · {e.title}
                  </button>
                ))}
              </>
            ) : (
              <span className="font-serif text-2xs tracking-[0.3em] text-mute/55">幕未起 · 靜待開鑼</span>
            )}
          </div>
        </header>

        {/* 畫卷 —— 每個 location 一個直欄：完整比例的油畫（880×586≈3:2），
            下方置中的團扇。欄與欄硬接（回到較優雅的版本），一同橫向捲動。 */}
        <div
          ref={scrollRef}
          className="mt-3 flex-1 min-h-0 overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth no-scrollbar overscroll-x-contain touch-pan-x"
        >
          <div className="flex h-full w-max items-stretch">
            {scenesByLocation.map(({ seg, scenes: locScenes }) => {
              const art = terrainArtFor(seg.location.name);
              const streamScene = locScenes.find((sc) => streamByScene[sc.id]?.length);
              return (
                <div
                  key={seg.location.id}
                  className="flex h-full shrink-0 snap-center snap-always flex-col border-r border-black/[0.08] last:border-r-0 dark:border-white/[0.05]"
                >
                  {/* 油畫 —— 高度定、寬度依 3:2 自算，完整展示不裁切 */}
                  <div className="relative h-[clamp(220px,46vh,520px)] w-[clamp(330px,69vh,780px)] shrink-0 overflow-hidden">
                    {art ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={art} alt={seg.location.name} className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-b from-surface to-canvas dark:from-elevated/50 dark:to-canvas" />
                    )}
                    <div className="pointer-events-none absolute inset-0 mix-blend-soft-light" style={{ background: wash.color, opacity: wash.opacity }} />
                    <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap font-serif text-sm tracking-[0.4em] text-white/85 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
                      {seg.location.name}
                    </span>
                    {streamScene ? (
                      <FloatingStream lines={streamByScene[streamScene.id]} leftPct={50} topPct={16} />
                    ) : null}
                  </div>

                  {/* 團扇 —— 置中，往兩邊平均展開 */}
                  <div className="flex w-full flex-1 flex-wrap content-start justify-center gap-x-4 gap-y-3 bg-canvas/30 px-3 pt-5">
                    {locScenes.length ? (
                      locScenes.map((sc) => (
                        <SceneFan
                          key={sc.id}
                          scene={sc}
                          onSelect={setFocusedSceneId}
                          present={sc.currentCharacterIds?.length ?? 0}
                        />
                      ))
                    ) : (
                      <span className="pt-4 font-serif text-2xs tracking-[0.2em] text-mute/50">尚無場景</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <SagaTabBar />
      </div>

      {/* 內頁 —— 團扇點開，像走進 location 更深的一層（非彈窗遮罩） */}
      {focusedScene ? (
        <SceneSheet
          scene={focusedScene}
          sagaId={saga.id}
          charactersById={charactersById}
          clock={saga.worldTime?.partOfDay ? dayPartLabel(saga.worldTime.partOfDay) : undefined}
          locationArt={
            terrainArtFor(
              layout.segments.find((s) => s.scenes.some((sp) => sp.scene.id === focusedScene.id))?.location.name,
            ) ?? undefined
          }
          onClose={() => setFocusedSceneId(null)}
        />
      ) : null}
    </>
  );
}

interface EventCard {
  eventId: string;
  sceneId: string;
  title: string;
  sceneName: string;
  actedCount: number;
  total: number;
  castNames: string[];
}

function dayPartLabel(p: string): string {
  switch (p) {
    case 'morning':
      return '朝';
    case 'noon':
      return '午';
    case 'dusk':
      return '暮';
    case 'night':
      return '夜';
    default:
      return p;
  }
}
