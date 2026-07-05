'use client';

import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import type { Character, Scene } from '@endless-story/shared';

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

  // Kept light: this glow now sits ON TOP of the painted terrain, so a heavy
  // multiply blob reads as a dark smudge over the art. Warm accents stay (they
  // tint), the grey (mute) is nearly dropped (it only darkened).
  const bleedStyle = heat
    ? {
        background: `
          radial-gradient(circle at 30% 35%, rgba(var(--color-cinnabar) / ${heat.cinnabar * 0.16}), transparent 62%),
          radial-gradient(circle at 70% 65%, rgba(var(--color-jade) / ${heat.jade * 0.13}), transparent 62%),
          radial-gradient(circle at 50% 80%, rgba(var(--color-mute) / ${heat.mute * 0.06}), transparent 62%)
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
        className="pointer-events-none absolute inset-[-30%] mix-blend-soft-light dark:mix-blend-screen"
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
        {/* 團扇 — the scene marker IS a round silk fan bearing the scene name;
            it lifts and warms on hover. (Replaces the old text plaque + dot.) */}
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-transform duration-300 ease-out group-hover:-translate-y-[calc(50%+7px)] group-hover:scale-[1.14]"
        >
          <span className="relative block h-[64px] w-[56px]">
            {isPerforming ? (
              <span
                aria-hidden
                className="absolute inset-x-1 top-0 h-[54px] animate-pulse rounded-full bg-cinnabar/30 blur-md"
              />
            ) : null}
            {/* A silk fan reads the same in any theme: warm cream face, dark ink
                name, so it pops on the painted terrain rather than sinking in. */}
            <svg
              viewBox="0 0 100 118"
              className="relative h-full w-full drop-shadow-[0_4px_9px_rgba(20,12,8,0.55)]"
            >
              <rect x="47" y="86" width="6" height="30" rx="3" fill="#7a5a3c" opacity="0.9" />
              <circle cx="50" cy="50" r="46" fill="#ece3ce" fillOpacity="0.96" />
              <g stroke="#8a6844" strokeWidth="0.8" opacity="0.28">
                {Array.from({ length: 9 }).map((_, k) => {
                  const a = ((-80 + k * 20) * Math.PI) / 180;
                  return (
                    <line key={k} x1="50" y1="50" x2={50 + 46 * Math.cos(a)} y2={50 + 46 * Math.sin(a)} />
                  );
                })}
              </g>
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                strokeWidth="2.6"
                stroke={isPerforming ? 'rgb(var(--color-cinnabar))' : '#a8824c'}
                opacity={isPerforming ? 0.9 : 0.75}
              />
            </svg>
            <span className="pointer-events-none absolute inset-x-0 top-0 flex h-[80%] items-center justify-center font-serif text-[10px] font-medium leading-[1.12] tracking-[0.06em] text-[#3a2c22] [writing-mode:vertical-rl]">
              {scene.name}
            </span>
          </span>
        </motion.span>

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

    </div>
  );
}
