'use client';

import { useState } from 'react';
import type { Character } from '@endless-story/shared';

const ROLE_TINT: Record<string, string> = {
  班主: 'rgb(var(--color-cinnabar))',
  青衣: 'rgb(var(--color-jade))',
  花旦: 'rgb(var(--color-cinnabar))',
  小生: 'rgb(var(--color-mute))',
  武旦: 'rgb(var(--color-cinnabar))',
  老旦: 'rgb(var(--color-mute))',
  丑: 'rgb(var(--color-mute))',
  樂師: 'rgb(var(--color-jade))',
  箱管: 'rgb(var(--color-mute))',
  學徒: 'rgb(var(--color-jade))',
  看客: 'rgb(var(--color-mute))',
};

/**
 * A small "living in the scene" silhouette that sways within the scene band.
 * Hover reveals name / role. Could later use a thumbnail from character.gallery.anchor.
 */
export function WanderingFigure({
  character,
  offsetX,
  offsetY,
  delaySeconds = 0,
}: {
  character: Character;
  offsetX: number; // px relative to vignette anchor
  offsetY: number;
  delaySeconds?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const tint = ROLE_TINT[character.role] ?? 'rgb(var(--color-mute))';

  return (
    <div
      className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-1/2"
      style={{ left: offsetX, top: offsetY }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="es-figure-idle relative cursor-pointer"
        style={{ animationDelay: `${delaySeconds}s` }}
      >
        {/* 剪影本身 — 簡化「人」字形 */}
        <svg
          width="22"
          height="34"
          viewBox="0 0 22 34"
          aria-hidden
          style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.18))' }}
        >
          {/* 頭 */}
          <circle cx="11" cy="6" r="4" fill={tint} fillOpacity="0.88" />
          {/* 身（長袍剪影） */}
          <path
            d="M 4 14 Q 11 10 18 14 L 19 28 Q 11 31 3 28 Z"
            fill={tint}
            fillOpacity="0.78"
          />
          {/* 衣襬陰影 */}
          <path
            d="M 5 27 Q 11 30 17 27 L 17 32 Q 11 33.5 5 32 Z"
            fill="rgba(0,0,0,0.35)"
          />
        </svg>
      </div>

      {hovered ? (
        <div className="absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-hairline/60 bg-surface/95 px-2.5 py-1.5 text-2xs tracking-widest text-ink shadow-lg backdrop-blur-md dark:bg-elevated/95">
          <span className="text-cinnabar/90">{character.name}</span>
          <span className="ml-2 text-mute">{character.role}</span>
        </div>
      ) : null}
    </div>
  );
}
