'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chapter, Character, Saga, SagaLocation, Scene } from '@endless-story/shared';
import { SagaScrollBackdrop } from './SagaScrollBackdrop';
import { SceneVignette, type VignetteAnchor } from './SceneVignette';
import { FloatingQuote } from './FloatingQuote';
import { SagaTroupeCanvas } from '../SagaTroupeCanvas';
import { computeHandscrollLayout, type ScenePlacement } from './handscrollLayout';
import { SagaTabBar } from '../SagaTabBar';
import { getSagaLiveSnapshot, type OpenEventStatus } from '@/lib/actions/saga-live';

type LiveEvent = OpenEventStatus;

/**
 * Main saga screen: a native horizontally-scrolling handscroll.
 *
 * Structure:
 *   - outer scroll container (overflow-x-auto, snap-x)
 *   - content width max(300vw, 1200px) — small phones can still swipe it open
 *     without crushing punctuation / quotes.
 *
 * Clicking a scene anchor → back to focused-mode (SagaTroupeCanvas renders one scene).
 */

// Handscroll horizontal layout is data-driven (see handscrollLayout.ts): one
// segment per covered location, scenes placed within their segment. A scene
// anchor = ScenePlacement xPct/yPct (percent of full scroll width/height).

function placementAnchor(p: ScenePlacement): VignetteAnchor {
  return { x: p.xPct, y: p.yPct, zone: p.zone };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Stable per-scene hash → deterministic jitter (no Math.random, SSR-safe). */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Quote position (top-aligned). Vertical columns are tall, so the top edge stays
// below the title (≥28%) and maxHeight caps the bottom; a stable per-scene hash
// staggers each top (28-58%) so they aren't all level. left clamped to [5,95]%
// so edge-of-segment quotes aren't pushed past the viewport's left/right.
// RIGHT_BIAS nudges the whole column rightward so it clears its scene's figures.
function quotePosition(anchor: VignetteAnchor, sceneId: string): { left: number; top: number } {
  const RIGHT_BIAS = 5;
  const left = clamp(anchor.x + RIGHT_BIAS + (anchor.zone === 'theater' ? 4 : -4), 5, 95);
  const spread = hashStr(sceneId) % 27; // 0-26, stable per scene — wider, more 錯落
  const top = clamp(28 + spread + (anchor.y - 56) * 0.4, 28, 58);
  return { left, top };
}

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
      if (!cancelled) timer = setTimeout(tick, 6000);
    };
    // Fetch live data once on mount (quotes / presence / open events) so it
    // appears before the first 6s tick; then poll every 6s. 300ms lets hydration settle.
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

  return (
    <>
      <div
        className={`absolute inset-0 ${
          isFocused ? 'pointer-events-none opacity-0' : 'opacity-100'
        } transition-opacity duration-300`}
      >
        {/* 捲動容器 */}
        <div
          ref={scrollRef}
          className="relative h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth no-scrollbar overscroll-x-contain touch-pan-x"
        >
          <div
            className="relative h-[100dvh] flex-shrink-0"
            style={{
              width: `max(${scrollVw}vw, 1200px)`,
              minWidth: `max(${scrollVw}vw, 1200px)`,
            }}
          >
            <SagaScrollBackdrop segments={layout.segments} partOfDay={partOfDay} />

            {/* 每個 location 一段（等寬）供 snap-x 吸附 */}
            <div className="absolute inset-0 flex pointer-events-none">
              {layout.segments.map((seg) => (
                <div
                  key={seg.location.id}
                  className="h-full shrink-0 snap-center snap-always"
                  style={{ width: `${100 / segmentCount}%` }}
                />
              ))}
            </div>

            {/* 場景錨 — 各自落在所屬 location 段內 */}
            {liveScenes.map((scene) => {
              const placement = placementById.get(scene.id);
              if (!placement) return null;
              return (
                <SceneVignette
                  key={scene.id}
                  scene={scene}
                  anchor={placementAnchor(placement)}
                  charactersById={charactersById}
                  onSelect={setFocusedSceneId}
                  widthPct={vignetteWidthPct}
                />
              );
            })}

            {/* 飄字題款 */}
            {liveScenes.map((scene) => {
              const placement = placementById.get(scene.id);
              if (!placement) return null;
              // Prefer the live line (carries its register/kind); fall back to the
              // scene's seeded ghost quote on first paint.
              const live = liveLineByScene[scene.id];
              const primary = live ?? scene.ghostQuotes?.[0];
              if (!primary) return null;
              const speaker = charactersById.get(primary.characterId) ?? null;
              const { left, top } = quotePosition(placementAnchor(placement), scene.id);
              const text = primary.text;
              const truncated = text.length > 20 ? `${text.slice(0, 20)}…` : text;
              return (
                <FloatingQuote
                  key={`quote-${scene.id}`}
                  speaker={speaker}
                  leftPct={left}
                  topPct={top}
                  delaySeconds={0.35}
                  kind={live?.kind}
                >
                  「{truncated}」
                </FloatingQuote>
              );
            })}

            {/* 地名匾 — 每個 covered location 一塊，置於該段正中、落在院落下方的雪地上
                （避開左上角的固定標題；像地圖上的地名）。 */}
            {layout.segments.map((seg) => (
              <ZoneLabel
                key={seg.location.id}
                x={`${seg.labelXPct}%`}
                y="78%"
                main={seg.location.name}
              />
            ))}
          </div>
        </div>

        {/* 固定上覆面板（絕對定位在畫卷容器外，與第一屏綁定） */}
        <FixedOverlay
          saga={saga}
          locationLabel={shownLocationLabel}
        />

        {/* 正在上演 — 鏈上開著的事件（每 6s 輪詢，不重整就更新） */}
        <LiveEventsOverlay events={eventCards} onSelect={setFocusedSceneId} />

        {/* 底部膠囊：四頁（手卷／星圖／江湖／規章），與第二屏同一顆。
            手卷在第一屏即高亮；點其他頁 → 捲到第二屏並停在該頁。
            取代了原本「上下滾動／左右滑動」那行提示。 */}
        <SagaTabBar />
      </div>
      
      {/* Scene Detail View */}
      {isFocused && (
        <div className="absolute inset-0 z-50 animate-fade-in-up bg-canvas">
          <SagaTroupeCanvas
            saga={saga}
            scenes={scenes}
            charactersById={charactersById}
            chaptersById={chaptersById}
            locationLabel={locationLabel}
            initialFocusedSceneId={focusedSceneId}
            onCloseFocused={() => setFocusedSceneId(null)}
          />
        </div>
      )}
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

/**
 * "Now playing" live overlay — the saga's currently-open events, polled from
 * chain. Each card: title · scene · cast · how many have acted. Click to
 * focus that scene. Hidden when nothing's open.
 */
function LiveEventsOverlay({
  events,
  onSelect,
}: {
  events: EventCard[];
  onSelect: (sceneId: string) => void;
}) {
  if (events.length === 0) return null;
  return (
    <div className="pointer-events-none absolute left-[max(1rem,env(safe-area-inset-left))] top-[calc(env(safe-area-inset-top,0px)+var(--es-site-nav-h)+7.5rem)] z-30 flex max-w-[min(86vw,20rem)] flex-col gap-2 sm:left-10 sm:top-[calc(var(--es-site-nav-h)+8.5rem)]">
      <div className="flex items-center gap-2 text-2xs tracking-[0.3em] text-cinnabar/90">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-cinnabar opacity-75" />
          <span className="relative block h-1.5 w-1.5 rounded-full bg-cinnabar" />
        </span>
        正在上演
      </div>
      {events.slice(0, 3).map((e) => (
        <button
          key={e.eventId}
          type="button"
          onClick={() => onSelect(e.sceneId)}
          className="pointer-events-auto rounded-lg border border-hairline/60 bg-surface/90 px-3 py-2 text-left shadow-lg backdrop-blur-md transition-colors hover:border-cinnabar/50 dark:bg-elevated/85"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-serif text-sm text-ink">《{e.title}》</span>
            <span className="shrink-0 text-2xs tabular-nums tracking-widest text-mute">
              {e.actedCount}/{e.total} 出牌
            </span>
          </div>
          <div className="mt-0.5 truncate text-2xs tracking-widest text-mute">
            {e.sceneName}
            {e.castNames.length > 0 ? ` · ${e.castNames.join('、')}` : ''}
          </div>
        </button>
      ))}
    </div>
  );
}

function ZoneLabel({ x, y, main, sub }: { x: string; y: string; main: string; sub?: string }) {
  return (
    <div
      className="pointer-events-none absolute z-10 flex flex-col items-center gap-1.5 text-mute/55 drop-shadow-sm"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
      aria-hidden
    >
      <span className="font-serif text-xl tracking-[0.42em] sm:text-3xl">{main}</span>
      {sub ? <span className="text-2xs tracking-widest text-mute/40">{sub}</span> : null}
    </div>
  );
}

function FixedOverlay({
  saga,
  locationLabel,
}: {
  saga: Saga;
  locationLabel: string;
}) {
  const partOfDay = saga.worldTime?.partOfDay;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* 標題 + 世界時 */}
      <div className="absolute left-[max(1rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top,0px)+var(--es-site-nav-h)+1.25rem)] flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:left-10 sm:right-10">
        <div className="pointer-events-auto min-w-0 max-w-2xl">
          <p className="es-page-lead-eyebrow">
            <span className="sm:hidden">手卷</span>
            <span className="hidden sm:inline">梨園手卷</span>
          </p>
          <h1 className="es-page-lead-title">
            {saga.name}
          </h1>
          <p className="mt-2 font-serif text-2xs tracking-[0.25em] text-mute/80 sm:text-xs">
            {locationLabel}
          </p>
        </div>
        {saga.worldTime ? (
          <div className="pointer-events-auto shrink-0 text-right text-2xs tracking-[0.3em] text-mute/85 sm:text-xs">
            <p>{saga.worldTime.label}</p>
            <p className="mt-1.5 text-2xs">
              Day {saga.worldTime.day}
              {partOfDay ? ` · ${dayPartLabel(partOfDay)}` : ''}
            </p>
          </div>
        ) : null}
      </div>

      {/* 展卷小提示：手機提醒可左右滑（桌面用底部膠囊導覽，不再贅述滾動方式）。
          置於膠囊上方，避免與膠囊重疊。 */}
      <p className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom,0px)+4.25rem)] left-1/2 -translate-x-1/2 animate-pulse whitespace-nowrap font-serif text-2xs tracking-widest text-mute/55 sm:hidden">
        ← 左右滑動展卷 →
      </p>
    </div>
  );
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
