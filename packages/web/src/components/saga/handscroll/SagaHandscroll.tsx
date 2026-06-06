'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chapter, Character, Saga, SagaLocation, Scene } from '@endless-story/shared';
import { SagaScrollBackdrop } from './SagaScrollBackdrop';
import { SceneVignette, type VignetteAnchor } from './SceneVignette';
import { FloatingQuote } from './FloatingQuote';
import { SagaTroupeCanvas } from '../SagaTroupeCanvas';
import { computeHandscrollLayout, type ScenePlacement } from './handscrollLayout';
import { getSagaLiveSnapshot, type OpenEventStatus } from '@/lib/actions/saga-live';

type LiveEvent = OpenEventStatus;

/**
 * 春雪社主螢幕：原生橫向捲動手卷。
 *
 * 結構：
 *   - 外層 scroll container（overflow-x-auto、snap-x）
 *   - 內容寬度 max(300vw, 1200px) — 小手機仍可橫滑展開、避免過度擠壓標點／題款
 *
 * 點任一場景錨 → 切回舊版 focused-mode（SagaTroupeCanvas 渲染單 scene 細看）。
 */

// 手卷橫軸佈局改為資料驅動（見 handscrollLayout.ts）：每個 covered location 一段、
// scene 鋪在自己那段內。場景錨點 = ScenePlacement 的 xPct/yPct（整卷寬高的百分比）。

function placementAnchor(p: ScenePlacement): VignetteAnchor {
  return { x: p.xPct, y: p.yPct, zone: p.zone };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// 題款落點（頂端對位）。直書欄很高，所以把上緣壓在標題下方（~30%）這條帶子，
// 只往下方留白長；left 夾在 [5,95]% 避免段邊場景的題款被推出視窗左右緣。
function quotePosition(anchor: VignetteAnchor): { left: number; top: number } {
  const left = clamp(anchor.x + (anchor.zone === 'theater' ? 4 : -4), 5, 95);
  const top = clamp(anchor.y - 26, 30, 36);
  return { left, top };
}

interface Props {
  saga: Saga;
  scenes: Scene[];
  /**
   * Saga 涵蓋的 location（鏈上 `Saga.covered_location_ids` 解出來）。
   * 渲染為手卷上三個 zone 大字（戲樓 / 月洞門 / 院落 那三個位置）。
   * 順序即排版順序：locations[0] 在左、[1] 中、[2] 右。
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
          if (!cancelled) setLiveEvents(snap.openEvents ?? []);
        } catch {
          /* transient RPC failure — keep last good state */
        }
      }
      if (!cancelled) timer = setTimeout(tick, 6000);
    };
    // 進場就抓一次 live（題款 / 在場 / 開演事件），不必等滿 6s 才首次浮現；
    // 之後維持 6s 輪詢。300ms 讓 hydration 先安定。
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

  // 資料驅動佈局：每個 covered location 一段，scene 鋪進自己那段。位置只依場景集合 +
  // locationId（不隨 live presence 變），故用穩定的 `scenes`／`locations` 算，再用 id 對
  // 回 liveScenes 渲染即時狀態。
  const layout = useMemo(() => computeHandscrollLayout(locations, scenes), [locations, scenes]);
  const placementById = useMemo(() => {
    const m = new Map<string, ScenePlacement>();
    for (const seg of layout.segments) for (const sp of seg.scenes) m.set(sp.scene.id, sp);
    return m;
  }, [layout]);
  const segmentCount = layout.segmentCount;
  // 整卷寬度隨段數伸縮：每段約 80vw（至少撐滿舊的 300vw）。
  const scrollVw = Math.max(segmentCount * 80, 300);
  // 場景區塊越多越窄，避免同段相鄰場景相疊。
  const vignetteWidthPct = Math.min(12, (100 / segmentCount) * 0.55);
  // 副標的地名串跟橫軸一致：只列「本 saga 真的有戲」的 location（與 layout 同一套過濾），
  // 不再把世界裡 saga 沒涉足的 location（如純招募用地）也列進去。
  const shownLocationLabel = layout.segments.length
    ? layout.segments.map((s) => s.location.name).join(' + ')
    : locationLabel;

  // 攔截垂直滾輪事件，轉換為段落間的橫向吸附切換
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let isScrolling = false;

    const handleWheel = (e: WheelEvent) => {
      // 若使用者已經在進行橫向滑動（如觸控板左右滑），則放行
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

      // 已展卷到最右／最左：垂直滾動改由外層 full-bleed snap，避免卡在一半
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
              const primary = scene.ghostQuotes?.[0];
              if (!primary) return null;
              const speaker = charactersById.get(primary.characterId) ?? null;
              const { left, top } = quotePosition(placementAnchor(placement));
              const text = primary.text;
              const truncated = text.length > 12 ? `${text.slice(0, 12)}…` : text;
              return (
                <FloatingQuote
                  key={`quote-${scene.id}`}
                  speaker={speaker}
                  leftPct={left}
                  topPct={top}
                  delaySeconds={0.35}
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
 * 「正在上演」live overlay — the saga's currently-open events, polled from
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

      {/* 橫向捲動提示：手機強調橫滑；桌面可搭配滾輪步進 */}
      <div className="absolute bottom-[max(2rem,env(safe-area-inset-bottom)+0.75rem)] left-1/2 flex max-w-[min(92vw,24rem)] -translate-x-1/2 flex-col items-center gap-2 text-mute/60 pointer-events-none sm:flex-row sm:gap-3">
        <p className="flex items-center gap-3 animate-pulse sm:hidden">
          <span className="text-base">←</span>
          <span className="text-center font-serif text-2xs leading-relaxed tracking-widest text-mute">
            左右滑動「展卷」
          </span>
          <span className="text-base">→</span>
        </p>
        <p className="hidden animate-pulse items-center gap-3 font-serif text-2xs tracking-widest sm:flex">
          <span className="text-lg">←</span>
          <span>上下滾動／左右滑動｜皆可展卷</span>
          <span className="text-lg">→</span>
        </p>
      </div>
      
      {/* 往下翻屏提示 */}
      <div className="absolute -bottom-4 right-10 flex flex-col items-center gap-1.5 opacity-75 pointer-events-none [@media(max-height:520px)]:hidden">
        <span className="text-2xs tracking-[0.35em] text-cinnabar/80">往下翻閱</span>
        <div className="h-6 w-px overflow-hidden bg-hairline sm:h-8">
          <div className="h-full w-full bg-cinnabar/90 animate-scroll-down-line" />
        </div>
      </div>
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
