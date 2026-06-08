'use client';

import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import type { Character, Scene } from '@endless-story/shared';
import { WanderingFigure } from './WanderingFigure';

export interface VignetteAnchor {
  // Percent, relative to the handscroll container (300vw x 100vh)
  x: number;
  y: number;
  zone: 'theater' | 'compound';
}

/**
 * One scene's marker block on the handscroll: scene plaque, heat bleed,
 * character silhouettes, performance seal. Does not handle the ghost quote
 * (SagaHandscroll lays that out at a larger scale).
 */
export function SceneVignette({
  scene,
  anchor,
  charactersById,
  onSelect,
  widthPct = 12,
}: {
  scene: Scene;
  anchor: VignetteAnchor;
  charactersById: Map<string, Character>;
  onSelect?: (sceneId: string) => void;
  /** Block width (percent of full scroll width). Wider scroll (more locations) → narrower, so adjacent scenes don't overlap. */
  widthPct?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4, margin: '-15% 0px -15% 0px' });
  const [hovered, setHovered] = useState(false);

  const heat = scene.heatProfile;
  const present = scene.currentCharacterIds
    .map((id) => charactersById.get(id))
    .filter((c): c is Character => Boolean(c));
  const isPerforming = !!scene.performance;

  const bleedStyle = heat
    ? {
        background: `
          radial-gradient(circle at 30% 35%, rgba(var(--color-cinnabar) / ${heat.cinnabar * 0.32}), transparent 60%),
          radial-gradient(circle at 70% 65%, rgba(var(--color-jade) / ${heat.jade * 0.28}), transparent 60%),
          radial-gradient(circle at 50% 80%, rgba(var(--color-mute) / ${heat.mute * 0.22}), transparent 60%)
        `,
      }
    : undefined;

  return (
    <div
      ref={ref}
      className={`absolute transition-z-index duration-300 ${hovered ? 'z-50' : 'z-10'}`}
      style={{
        left: `${anchor.x}%`,
        top: `${anchor.y}%`,
        width: `${widthPct}%`,
        height: '28%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* heat bleed 暈染（紙面散開） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[-50%] mix-blend-multiply dark:mix-blend-screen"
        style={bleedStyle}
      />

      {/* 點擊熱區 */}
      <button
        type="button"
        onClick={() => onSelect?.(scene.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={`細看 ${scene.name}`}
        className="group absolute inset-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cinnabar"
      >
        {/* 場景小匾 */}
        <motion.span
          initial={{ opacity: 0, y: 6 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded border border-hairline/50 bg-surface/85 px-3 py-1.5 font-serif text-xs tracking-[0.35em] text-ink/85 shadow-sm backdrop-blur-md dark:bg-elevated/80"
        >
          {scene.name}
        </motion.span>

        {/* 中心錨點 */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
        >
          <span
            className={`absolute h-8 w-8 rounded-full blur-md transition-opacity duration-500 ${
              isPerforming ? 'bg-cinnabar/45 opacity-100' : 'bg-cinnabar/25 opacity-70'
            }`}
          />
          {isPerforming ? (
            <span
              aria-hidden
              className="absolute h-6 w-6 rounded-full bg-cinnabar/55 opacity-50 animate-ping"
              style={{ animationDuration: '2.2s' }}
            />
          ) : null}
          <span
            className={`relative block h-2.5 w-2.5 rounded-full ring-2 ring-white/70 transition-transform duration-300 group-hover:scale-125 dark:ring-white/30 ${
              isPerforming
                ? 'bg-cinnabar shadow-[0_0_12px_rgba(176,74,60,0.6)]'
                : 'bg-cinnabar/85 dark:bg-jade'
            }`}
          />
        </span>

        {/* 落影 — 讓場景錨像落在手卷卷面上，而非飄在半空 */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-7 -translate-x-1/2 translate-y-3 rounded-[50%] bg-ink/15 blur-[2px] dark:bg-black/35"
        />

        {/* hover 卡 */}
        {hovered ? (
          <div className="pointer-events-none absolute left-1/2 top-full z-40 mt-3 w-max max-w-[280px] -translate-x-1/2 rounded-md border border-hairline/55 bg-surface/95 px-4 py-3 text-left shadow-xl backdrop-blur-md dark:bg-elevated/95">
            <p className="font-serif text-base text-ink">{scene.name}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-mute">{scene.description}</p>
            <p className="mt-3 flex items-center gap-1.5 text-xs tracking-widest text-mute">
              <span
                aria-hidden
                className={`inline-block h-2 w-2 rounded-full ${present.length > 0 ? 'bg-jade' : 'bg-mute/40'}`}
              />
              {present.length > 0 ? `${present.length} 人在此` : '— 無人 —'}
            </p>
            {isPerforming && scene.performance ? (
              <p className="mt-2 text-xs tracking-widest text-cinnabar/90">
                正演《{scene.performance.title}》
              </p>
            ) : null}
            <p className="mt-3 border-t border-hairline/60 pt-2 text-xs tracking-widest text-cinnabar/90 dark:text-jade">
              點進入細看 →
            </p>
          </div>
        ) : null}

        {/* performance 紅印 — 浮在右上角 */}
        {isPerforming && scene.performance ? (
          <span className="pointer-events-none absolute right-[-10px] top-3 flex items-center gap-1 rounded-full border border-cinnabar/40 bg-surface/90 px-2 py-0.5 text-xs tracking-widest text-cinnabar shadow-md backdrop-blur-md dark:bg-elevated/85">
            <span aria-hidden className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-cinnabar opacity-75" />
              <span className="relative block h-1.5 w-1.5 rounded-full bg-cinnabar" />
            </span>
            開鑼
          </span>
        ) : null}
      </button>

      {/* 在場人物剪影 — 圍繞錨點微擺 */}
      {present.slice(0, 4).map((c, i) => {
        const angle = (i / Math.max(present.length, 1)) * Math.PI * 2;
        const radius = 30;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius * 0.6 + 28;
        return (
          <div
            key={c.id}
            className="absolute left-1/2 top-1/2"
            style={{ transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))` }}
          >
            <WanderingFigure
              character={c}
              offsetX={0}
              offsetY={0}
              delaySeconds={i * 0.6}
            />
          </div>
        );
      })}
    </div>
  );
}
