'use client';

import { useRef, useState } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
import type { Chapter, Character, Saga, Scene } from '@endless-story/shared';
import { SnowPaperBackground } from './SnowPaperBackground';
import { SceneVignette, type VignetteAnchor } from './SceneVignette';
import { FloatingQuote } from './FloatingQuote';
import { SagaTroupeCanvas } from '../SagaTroupeCanvas';

/**
 * 春雪社主螢幕：垂直滾輪 → 橫向手卷展開。
 *
 * 結構：
 *   - 外層 scroll container（h-full overflow-y-auto）
 *   - 內層 tall spacer（~280dvh）驅動 useScroll
 *   - 內含 sticky 100dvh 視窗，放手卷視覺
 *   - 手卷視覺：300vw 寬 motion.div，由 scrollYProgress 推 translateX 0% → -66.67%
 *
 * 點任一場景錨 → 切回舊版 focused-mode（SagaTroupeCanvas 渲染單 scene 細看）。
 */

// 手卷三段：戲樓 / 月洞門 / 院落 — 用 % 對應到 300vw 容器
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

// 場景的題款落點（與錨點錯開 — 戲樓的題款在右方、院落的題款在左方）
function quotePosition(anchor: VignetteAnchor): { left: number; top: number } {
  if (anchor.zone === 'theater') {
    return { left: anchor.x + 5, top: anchor.y < 50 ? anchor.y + 18 : anchor.y - 28 };
  }
  return { left: anchor.x - 5, top: anchor.y < 50 ? anchor.y + 20 : anchor.y - 30 };
}

interface Props {
  saga: Saga;
  scenes: Scene[];
  charactersById: Map<string, Character>;
  chaptersById: Map<string, Chapter>;
  locationLabel: string;
}

export function SagaHandscroll(props: Props) {
  const { saga, scenes, charactersById, chaptersById, locationLabel } = props;
  const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({ container: scrollRef, target: trackRef });
  // 內容寬 300vw → 平移 -200vw 才到底（即 content width 的 -66.67%）
  const xRaw = useTransform(scrollYProgress, [0, 1], ['0%', '-66.67%']);
  const x = useSpring(xRaw, { stiffness: 90, damping: 24, mass: 0.6 });

  const partOfDay = saga.worldTime?.partOfDay ?? 'noon';

  // 若使用者點了 scene → 進入舊版 focused-mode
  if (focusedSceneId) {
    return (
      <SagaTroupeCanvas
        saga={saga}
        scenes={scenes}
        charactersById={charactersById}
        chaptersById={chaptersById}
        locationLabel={locationLabel}
        initialFocusedSceneId={focusedSceneId}
        onCloseFocused={() => setFocusedSceneId(null)}
      />
    );
  }

  return (
    <div
      ref={scrollRef}
      className="relative h-full w-full overflow-y-auto overflow-x-hidden no-scrollbar"
    >
      <div ref={trackRef} style={{ height: '200dvh' }} className="relative w-full">
        {/* Sticky 視窗：固定在容器頂部、佔滿一個視口高度 */}
        <div className="sticky top-0 h-[100dvh] w-full overflow-hidden">
          {/* 手卷內容（300vw 寬，跟著 scrollYProgress 橫向位移） */}
          <motion.div
            className="absolute inset-y-0 left-0"
            style={{ x, width: '300vw' }}
          >
            <SnowPaperBackground partOfDay={partOfDay} />

            {/* 場景錨 */}
            {scenes.map((scene) => {
              const anchor = SCENE_ANCHORS[scene.id];
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
              const anchor = SCENE_ANCHORS[scene.id];
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

            {/* 三段地名橫匾 — 浮於畫面之上 */}
            <ZoneLabel x="16%" y="18%" main="戲樓" sub="對外 — 對天下開鑼" />
            <ZoneLabel x="41%" y="22%" main="月洞門" sub="一道牆、兩種人生" />
            <ZoneLabel x="63%" y="18%" main="院落" sub="對內 — 卸了妝以後" />
          </motion.div>

          {/* 固定上覆面板（不跟著手卷移動） */}
          <FixedOverlay
            saga={saga}
            locationLabel={locationLabel}
            scrollYProgress={scrollYProgress}
          />
        </div>
      </div>
    </div>
  );
}

function ZoneLabel({ x, y, main, sub }: { x: string; y: string; main: string; sub: string }) {
  return (
    <div
      className="pointer-events-none absolute z-10 flex flex-col items-center gap-1.5 text-mute/55 drop-shadow-sm"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
      aria-hidden
    >
      <span className="font-serif text-2xl tracking-[0.45em] sm:text-3xl">{main}</span>
      <span className="text-2xs tracking-widest text-mute/40">{sub}</span>
    </div>
  );
}

function FixedOverlay({
  saga,
  locationLabel,
  scrollYProgress,
}: {
  saga: Saga;
  locationLabel: string;
  scrollYProgress: ReturnType<typeof useScroll>['scrollYProgress'];
}) {
  const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  const partOfDay = saga.worldTime?.partOfDay;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* 標題 + 世界時 */}
      <div className="absolute top-24 left-6 right-6 flex items-start justify-between gap-4 sm:left-10 sm:right-10">
        <div className="pointer-events-auto max-w-2xl">
          <h1 className="font-serif text-5xl tracking-widest text-ink drop-shadow-md sm:text-6xl lg:text-7xl">
            {saga.name}
          </h1>
          <p className="mt-2 font-serif text-xs tracking-[0.25em] text-mute/80">{locationLabel}</p>
        </div>
        {saga.worldTime ? (
          <div className="pointer-events-auto text-right text-2xs tracking-[0.3em] text-mute/85">
            <p>{saga.worldTime.label}</p>
            <p className="mt-1">
              Day {saga.worldTime.day}
              {partOfDay ? ` · ${dayPartLabel(partOfDay)}` : ''}
            </p>
          </div>
        ) : null}
      </div>

      {/* Premise（左下） */}
      <div className="absolute bottom-20 left-6 right-6 sm:left-10 sm:right-10">
        <div className="pointer-events-auto max-w-xl border-l-2 border-cinnabar/60 pl-5">
          <p className="font-serif text-2xs tracking-[0.25em] text-mute/80 uppercase mb-2">
            本回 Premise
          </p>
          <p className="font-serif text-sm leading-relaxed text-ink/90 sm:text-base drop-shadow-sm">
            {saga.premise}
          </p>
        </div>
      </div>

      {/* 手卷進度線（底部） */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="text-2xs tracking-[0.35em] text-cinnabar/80">展卷 · 由戲樓入院落</span>
        <div className="relative h-px w-48 overflow-hidden bg-hairline">
          <motion.div className="absolute inset-y-0 left-0 bg-cinnabar/85" style={{ width: progressWidth }} />
        </div>
        <span className="text-2xs tracking-[0.35em] text-mute/70">滾輪向下 → 展卷</span>
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
