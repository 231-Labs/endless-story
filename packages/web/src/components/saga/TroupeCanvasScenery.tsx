'use client';

import type { Character, DayPart, Saga, Scene, SceneHeatProfile } from '@endless-story/shared';
import {
  DAY_PART_TINT,
  PRIVACY_LABEL,
  SCENE_POSITIONS,
  WORLD_TIME_MOOD,
  type ScenePosition,
} from './troupeCanvasLayout';

/* ─────────── Overview canvas (full theater) ─────────── */

export function OverviewCanvas({
  saga,
  scenes,
  charactersById,
  onSelect,
}: {
  saga: Saga;
  scenes: Scene[];
  charactersById: Map<string, Character>;
  onSelect: (sceneId: string) => void;
}) {
  return (
    <div className="animate-fade-in-up absolute inset-0 overflow-hidden">
      {/* 保持 16:9 比例並 cover 整個畫面 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[max(100vw,177.77vh)] h-[max(100vh,56.25vw)]">
        <InkWashBackground />
        {saga.worldTime ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-overlay"
            style={{ background: DAY_PART_TINT[saga.worldTime.partOfDay] }}
          />
        ) : null}

        {/* Zone labels */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-[15%] top-[25%] flex flex-col items-center gap-2 text-mute/50 drop-shadow-sm"
        >
          <span className="font-serif text-xl tracking-[0.4em] sm:text-2xl">戲樓</span>
          <span className="text-2xs tracking-widest text-mute/40">對外</span>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute right-[15%] bottom-[25%] flex flex-col items-center gap-2 text-mute/50 drop-shadow-sm"
        >
          <span className="font-serif text-xl tracking-[0.4em] sm:text-2xl">院落</span>
          <span className="text-2xs tracking-widest text-mute/40">對內</span>
        </div>

        {/* 月洞門 label */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-[45%] top-[52%] -translate-x-1/2 text-xs tracking-widest text-mute/50 drop-shadow-sm"
        >
          月洞門
        </div>

        {/* Scene markers */}
        {scenes.map((scene) => {
          const pos = SCENE_POSITIONS[scene.id];
          if (!pos) return null;
          const presentChars = scene.currentCharacterIds
            .map((id) => charactersById.get(id))
            .filter((c): c is Character => Boolean(c));
          return (
            <SceneHotspot
              key={scene.id}
              scene={scene}
              pos={pos}
              presentCount={presentChars.length}
              onClick={() => onSelect(scene.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─────────── Focused canvas (single-scene close-up) ─────────── */

export function FocusedSceneBackground({
  scene,
  povId,
  worldTime,
}: {
  scene: Scene;
  povId: string | null;
  worldTime: Saga['worldTime'] | null;
}) {
  return (
    <div className="animate-fade-in-up absolute inset-0 flex flex-col">
      <AmbientCanvas
        profile={scene.heatProfile ?? null}
        povId={povId}
        worldTime={worldTime}
      />
    </div>
  );
}

/* ─────────── Ambient canvas (focused backdrop) ─────────── */

function AmbientCanvas({
  profile,
  povId,
  worldTime,
}: {
  profile: SceneHeatProfile | null;
  povId: string | null;
  worldTime: Saga['worldTime'] | null;
}) {
  const part = worldTime?.partOfDay ?? null;
  const mood = part ? WORLD_TIME_MOOD[part] : WORLD_TIME_MOOD.noon;

  const heatLayers = profile
    ? `
      radial-gradient(circle at 30% 32%, rgba(var(--color-cinnabar) / ${profile.cinnabar * 0.42}), transparent 54%),
      radial-gradient(circle at 72% 64%, rgba(var(--color-jade) / ${profile.jade * 0.38}), transparent 54%),
      radial-gradient(circle at 52% 88%, rgba(var(--color-mute) / ${profile.mute * 0.32}), transparent 62%)
    `
    : '';

  const baseGradient = 'linear-gradient(to bottom, rgb(var(--color-elevated)), rgb(var(--color-canvas)))';

  return (
    <div
      className={`absolute inset-0 transition-[filter] duration-700 ease-out ${
        povId ? 'saturate-[1.18] contrast-[1.06]' : ''
      }`}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{
          background: `${heatLayers ? `${heatLayers}, ` : ''}${baseGradient}`,
        }}
      />
      {part ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 mix-blend-soft-light dark:mix-blend-screen"
            style={{ background: mood.vignette }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-80 dark:opacity-90"
            style={{ background: mood.rim }}
          />
        </>
      ) : null}
      {/* 細膩顆粒 — 降低數位平直感 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: mood.grainOpacity,
          mixBlendMode: 'overlay',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
        }}
      />
      {/* 四角暈暗 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow:
            part === 'night'
              ? 'inset 0 0 120px rgba(15,14,12,0.42)'
              : 'inset 0 0 100px rgba(15,14,12,0.12)',
        }}
      />
    </div>
  );
}

/* ─────────── Ink wash background（overview anchor placeholder）─────────── */

function InkWashBackground() {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-br from-canvas via-surface to-canvas/80 dark:from-canvas dark:via-elevated/60 dark:to-canvas/90" />
      <svg
        viewBox="0 0 1600 900"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <radialGradient id="inkBlot1" cx="50%" cy="20%" r="55%">
            <stop offset="0%" stopColor="rgb(var(--color-mute))" stopOpacity="0.12" />
            <stop offset="100%" stopColor="rgb(var(--color-mute))" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="inkBlot2" cx="80%" cy="80%" r="50%">
            <stop offset="0%" stopColor="rgb(var(--color-cinnabar))" stopOpacity="0.06" />
            <stop offset="100%" stopColor="rgb(var(--color-cinnabar))" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="inkBlot3" cx="15%" cy="65%" r="40%">
            <stop offset="0%" stopColor="rgb(var(--color-jade))" stopOpacity="0.07" />
            <stop offset="100%" stopColor="rgb(var(--color-jade))" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#inkBlot1)" />
        <rect width="100%" height="100%" fill="url(#inkBlot2)" />
        <rect width="100%" height="100%" fill="url(#inkBlot3)" />
        <path
          d="M 540 140 Q 800 80 1060 140"
          stroke="rgb(var(--color-mute))"
          strokeWidth="2.5"
          strokeOpacity="0.35"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 580 165 L 1020 165"
          stroke="rgb(var(--color-mute))"
          strokeWidth="1.5"
          strokeOpacity="0.25"
          strokeLinecap="round"
          fill="none"
        />
        {/* 戲樓 / 院落 分隔（左半線） */}
        <path
          d="M 120 450 L 740 450"
          stroke="rgb(var(--color-hairline))"
          strokeWidth="1.5"
          strokeOpacity="0.55"
          strokeDasharray="4 5"
          fill="none"
        />
        {/* 月洞門 — 半圓拱（向上） */}
        <path
          d="M 740 450 A 60 60 0 0 1 860 450"
          stroke="rgb(var(--color-mute))"
          strokeWidth="2"
          strokeOpacity="0.65"
          fill="none"
        />
        {/* 月洞門影 — 內襯一條較淡的弧 */}
        <path
          d="M 750 450 A 50 50 0 0 1 850 450"
          stroke="rgb(var(--color-cinnabar))"
          strokeWidth="1"
          strokeOpacity="0.3"
          fill="none"
        />
        {/* 戲樓 / 院落 分隔（右半線） */}
        <path
          d="M 860 450 L 1480 450"
          stroke="rgb(var(--color-hairline))"
          strokeWidth="1.5"
          strokeOpacity="0.55"
          strokeDasharray="4 5"
          fill="none"
        />
      </svg>
    </div>
  );
}

/* ─────────── Scene hotspot (overview glow) ─────────── */

function SceneHotspot({
  scene,
  pos,
  presentCount,
  onClick,
}: {
  scene: Scene;
  pos: ScenePosition;
  presentCount: number;
  onClick: () => void;
}) {
  const isMainStage = scene.id === 'scene_main_stage';
  const isPerforming = isMainStage && !!scene.performance;
  const privacy = PRIVACY_LABEL[scene.privacyLevel];

  return (
    <div
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      className="group absolute z-20 -translate-x-1/2 -translate-y-1/2 outline-none pointer-events-auto"
    >
      {isPerforming && scene.performance ? (
        <span className="absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-cinnabar/45 bg-surface/95 px-3 py-1.5 text-2xs tracking-widest text-cinnabar shadow-lg shadow-cinnabar/20 backdrop-blur-md dark:bg-elevated/90">
          <span aria-hidden className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-cinnabar opacity-75" />
            <span className="relative h-2 w-2 rounded-full bg-cinnabar" />
          </span>
          《{scene.performance.title}》
        </span>
      ) : null}

      <button
        type="button"
        onClick={onClick}
        aria-label={`進入 ${scene.name}`}
        className="relative flex cursor-pointer items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-canvas transition-transform duration-300 focus-visible:ring-2 focus-visible:ring-cinnabar group-hover:scale-110 active:scale-95 dark:ring-offset-canvas"
      >
        <span
          aria-hidden
          className={`absolute h-14 w-14 rounded-full opacity-70 blur-md transition-opacity duration-500 group-hover:opacity-100 ${
            isPerforming ? 'bg-cinnabar/50' : 'bg-cinnabar/25'
          }`}
        />
        <span
          aria-hidden
          className={`absolute h-10 w-10 animate-ping rounded-full opacity-40 ${
            isPerforming ? 'bg-cinnabar/60' : 'bg-jade/35'
          }`}
          style={{ animationDuration: isPerforming ? '2s' : '3.2s' }}
        />
        <span
          className={`relative h-3 w-3 rounded-full shadow-lg ring-2 ring-white/80 transition-all duration-300 dark:ring-white/25 ${
            isPerforming
              ? 'scale-125 bg-cinnabar ring-cinnabar/50'
              : 'bg-cinnabar/90 ring-cinnabar/30 dark:bg-jade dark:ring-jade/40'
          }`}
        />
      </button>

      {/* hover / focus：展開場景資訊卡（與 button 同層，避免巢狀 block） */}
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-4 w-max max-w-[min(260px,calc(100vw-3rem))] -translate-x-1/2 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="rounded-2xl border border-hairline/50 bg-surface/95 px-4 py-3 text-left shadow-xl shadow-black/10 backdrop-blur-md dark:bg-elevated/95 dark:shadow-black/40">
          <p className="font-serif text-base text-ink">{scene.name}</p>
          <p className="mt-2 text-2xs leading-relaxed tracking-wider text-mute">{privacy}</p>
          <p className="mt-2 flex items-center gap-1.5 text-2xs tracking-widest text-mute">
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 rounded-full ${presentCount > 0 ? 'bg-jade' : 'bg-mute/50'}`}
            />
            {presentCount > 0 ? `${presentCount} 人在此` : '— 無人 —'}
          </p>
          <p className="mt-3 border-t border-hairline/60 pt-2 text-2xs tracking-widest text-cinnabar/90 dark:text-jade">
            點熱點細看 →
          </p>
        </div>
      </div>
    </div>
  );
}
