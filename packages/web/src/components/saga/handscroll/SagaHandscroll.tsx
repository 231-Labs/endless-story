'use client';

import { useEffect, useRef, useState } from 'react';
import type { Chapter, Character, Saga, SagaLocation, Scene } from '@endless-story/shared';
import { SnowPaperBackground } from './SnowPaperBackground';
import { SceneVignette, type VignetteAnchor } from './SceneVignette';
import { FloatingQuote } from './FloatingQuote';
import { SagaTroupeCanvas } from '../SagaTroupeCanvas';

/**
 * 春雪社主螢幕：原生橫向捲動手卷。
 *
 * 結構：
 *   - 外層 scroll container（overflow-x-auto、snap-x）
 *   - 內容寬度 max(300vw, 1200px) — 小手機仍可橫滑展開、避免過度擠壓標點／題款
 *
 * 點任一場景錨 → 切回舊版 focused-mode（SagaTroupeCanvas 渲染單 scene 細看）。
 */

// 手卷三段：戲樓 / 月洞門 / 院落 — 用 % 對應到 300vw 容器
//
// 兩條資料路徑（不互為 fallback、各自獨立）：
//   - chain scene: 帶著 `posX / posY` (chain `Scene.placement.pos_x/pos_y`)
//   - mock scene : 沒有 pos，靠 id 對到下方字典
//
// 兩條都拿不到就 return null（chain pos 為 0 是部署設定漏寫，不在這層補洞）。
const SCENE_ANCHORS: Record<string, VignetteAnchor> = {
  // 戲樓 zone（左三分之一 0–33%）
  scene_music_shed: { x: 9, y: 60, zone: 'theater' },
  scene_main_stage: { x: 17, y: 44, zone: 'theater' },
  scene_backstage: { x: 25, y: 58, zone: 'theater' },
  scene_trunk_room: { x: 30, y: 74, zone: 'theater' },
  // 院落 zone（右三分之二 50–95%）
  scene_east_hall: { x: 52, y: 54, zone: 'compound' },
  scene_accounting: { x: 59, y: 70, zone: 'compound' },
  scene_courtyard: { x: 67, y: 60, zone: 'compound' },
  scene_bunk_room: { x: 75, y: 50, zone: 'compound' },
};

/**
 * 三段橫匾的固定排版位置 — left / middle / right。對應到
 * 300vw 容器內 16% / 41% / 63%（搭配 SnowPaperBackground 三段地紋）。
 * 內容由 caller 傳入的 `locations[]` 填，不再寫死「戲樓 / 月洞門 / 院落」。
 */
const ZONE_POSITIONS: { x: string; y: string }[] = [
  { x: '16%', y: '18%' },
  { x: '41%', y: '22%' },
  { x: '63%', y: '18%' },
];

function resolveAnchor(scene: Scene): VignetteAnchor | null {
  // Chain path: posX/posY arrive from chain `Scene.placement.pos_x/pos_y`.
  if (scene.posX != null && scene.posY != null) {
    return {
      x: scene.posX,
      y: scene.posY,
      // zone is a UI concept; derive from x. 0–40% reads as theater
      // (left third + transitional), >=40% as compound (right two-thirds).
      zone: scene.posX < 40 ? 'theater' : 'compound',
    };
  }
  // Mock path: slug-keyed dict.
  return SCENE_ANCHORS[scene.id] ?? null;
}

// 場景的題款落點（與錨點錯開 — 戲樓的題款在右方、院落的題款在左方）
function quotePosition(anchor: VignetteAnchor): { left: number; top: number } {
  if (anchor.zone === 'theater') {
    return { left: anchor.x + 5, top: anchor.y < 50 ? anchor.y + 0 : anchor.y - 28 };
  }
  return { left: anchor.x - 5, top: anchor.y < 50 ? anchor.y + 20 : anchor.y - 30 };
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

  const partOfDay = saga.worldTime?.partOfDay ?? 'noon';
  const isFocused = focusedSceneId !== null;

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
              width: 'max(300vw, 1200px)',
              minWidth: 'max(300vw, 1200px)',
            }}
          >
            <SnowPaperBackground partOfDay={partOfDay} />

            {/* 三個段落（各佔總寬 1/3）供 snap-x 吸附 */}
            <div className="absolute inset-0 flex pointer-events-none">
              <div className="h-full w-1/3 shrink-0 snap-center snap-always" />
              <div className="h-full w-1/3 shrink-0 snap-center snap-always" />
              <div className="h-full w-1/3 shrink-0 snap-center snap-always" />
            </div>

            {/* 場景錨 */}
            {scenes.map((scene) => {
              const anchor = resolveAnchor(scene);
              if (!anchor) return null;
              return (
                <SceneVignette
                  key={scene.id}
                  scene={scene}
                  anchor={anchor}
                  charactersById={charactersById}
                  onSelect={setFocusedSceneId}
                />
              );
            })}

            {/* 飄字題款 */}
            {scenes.map((scene) => {
              const anchor = resolveAnchor(scene);
              if (!anchor) return null;
              const primary = scene.ghostQuotes?.[0];
              if (!primary) return null;
              const speaker = charactersById.get(primary.characterId) ?? null;
              const { left, top } = quotePosition(anchor);
              const text = primary.text;
              const truncated = text.length > 22 ? `${text.slice(0, 22)}…` : text;
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

            {/*
              三段地名橫匾 — 由鏈上 `Saga.covered_location_ids` 解出的
              location 名稱填入。順序對應排版 left/middle/right。沒給夠
              三個就只渲染拿到的那幾個。
            */}
            {ZONE_POSITIONS.map((pos, i) => {
              const loc = locations[i];
              if (!loc) return null;
              return <ZoneLabel key={loc.id} x={pos.x} y={pos.y} main={loc.name} />;
            })}
          </div>
        </div>

        {/* 固定上覆面板（絕對定位在畫卷容器外，與第一屏綁定） */}
        <FixedOverlay
          saga={saga}
          locationLabel={locationLabel}
        />
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
