'use client';

import Link from 'next/link';
import { characterPortraitTone } from '@/components/common/CharacterPortrait';
import { BlobImage } from '@/components/common/BlobImage';
import {
  CAST_NODE_PX_CENTER,
  CAST_NODE_PX_OTHER,
  VIEWBOX_H,
  VIEWBOX_W,
  WILD_NODE_PX,
  type PositionedCharacter,
} from './constellationLayout';

export function ConstellationBackdrop({ ink }: { ink: (a: number) => string }) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-canvas via-surface to-canvas dark:from-canvas dark:via-elevated/55 dark:to-canvas" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 65% at 50% 50%, rgba(var(--color-cinnabar) / 0.04), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")",
        }}
      />
      {/* 兩側枯枝 — 暗示「江湖」是真實的外世界 */}
      <svg viewBox="0 0 1600 900" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <g stroke={ink(0.32)} strokeWidth="1.1" fill="none" strokeLinecap="round">
          <g transform="translate(60, 110)">
            <path d="M 0 200 L 0 0" strokeWidth="1.8" />
            <path d="M 0 110 L -28 70" />
            <path d="M -28 70 L -42 45" />
            <path d="M 0 90 L 30 60" />
            <path d="M 0 150 L -22 120" />
          </g>
          <g transform="translate(1540, 130)">
            <path d="M 0 180 L 0 0" strokeWidth="1.8" />
            <path d="M 0 100 L 28 65" />
            <path d="M 28 65 L 42 40" />
            <path d="M 0 80 L -30 55" />
            <path d="M 0 140 L 22 110" />
          </g>
          <g transform="translate(120, 720)">
            <path d="M 0 150 L 0 0" strokeWidth="1.6" />
            <path d="M 0 80 L -24 50" />
            <path d="M 0 60 L 26 40" />
          </g>
        </g>
        {/* 一條極淡的遠山 */}
        <path
          d="M 0 720 Q 200 680 400 700 T 800 690 T 1200 700 T 1600 690 L 1600 900 L 0 900 Z"
          fill={ink(0.06)}
        />
      </svg>
    </>
  );
}

export function ConstellationNode({
  positioned, isDimmed, onMouseEnter, onMouseLeave,
}: {
  positioned: PositionedCharacter;
  isDimmed: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { char, x, y, kind, scene } = positioned;
  const tone = characterPortraitTone(char.role);
  const imageUrl = char.gallery?.anchor?.imageUrl;
  const sizePx = kind === 'center' ? CAST_NODE_PX_CENTER : kind === 'cast' ? CAST_NODE_PX_OTHER : WILD_NODE_PX;
  const ringClass =
    kind === 'wild'
      ? scene
        ? 'ring-2 ring-cinnabar/40 ring-offset-1 ring-offset-canvas/50'
        : 'ring-1 ring-mute/50'
      : kind === 'center'
        ? `ring-2 ring-cinnabar/55 ${tone.ring}`
        : `ring-2 ring-surface ${tone.ring}`;

  const sceneTag = scene?.name ?? null;

  return (
    <Link
      href={{ pathname: '/dossier', query: { id: char.id } }}
      title={`${char.name} · ${char.role}${kind === 'wild' ? ' · 江湖' : ''}${sceneTag ? ` · 現在於 ${sceneTag}` : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 outline-none ring-offset-2 ring-offset-transparent transition-all duration-500 hover:scale-110 focus-visible:ring-2 focus-visible:ring-cinnabar active:scale-100 ${
        isDimmed ? 'opacity-25 grayscale-[0.5]' : 'opacity-100'
      }`}
      style={{ left: `${(x / VIEWBOX_W) * 100}%`, top: `${(y / VIEWBOX_H) * 100}%` }}
    >
      <span
        className={`relative overflow-hidden rounded-full shadow-md transition-transform duration-300 group-hover:scale-105 ${ringClass} ${
          kind === 'wild' ? 'bg-canvas/80 backdrop-blur-sm' : tone.bg
        }`}
        style={{ width: sizePx, height: sizePx }}
      >
        <span
          className={`absolute inset-0 flex items-center justify-center font-serif ${
            kind === 'wild' ? 'text-mute' : tone.text
          }`}
          style={{ fontSize: kind === 'center' ? 24 : kind === 'cast' ? 20 : 14 }}
        >
          {char.name[0]}
        </span>
        {imageUrl ? (
          <BlobImage src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
      </span>
      <span
        className={`whitespace-nowrap font-serif tracking-[0.18em] drop-shadow-sm transition-colors group-hover:text-ink ${
          kind === 'wild'
            ? 'text-2xs italic text-mute/90'
            : kind === 'center'
              ? 'text-sm text-ink'
              : 'text-xs text-ink/85'
        }`}
      >
        {char.name}
      </span>
    </Link>
  );
}
