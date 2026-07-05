'use client';

import type { Scene } from '@endless-story/shared';

/**
 * 團扇 — a scene marker shaped as a round silk fan. If the scene has generated
 * art (still / gallery moment) it fills the fan face; otherwise the scene name
 * is inked on a warm silk face. Theme-independent by design so it reads on the
 * dark painted scroll in either mode. Lifts on hover; click opens the 內頁.
 */
export function SceneFan({
  scene,
  onSelect,
  present = 0,
}: {
  scene: Scene;
  onSelect?: (sceneId: string) => void;
  present?: number;
}) {
  const isPrivate = (scene.privacyLevel ?? 0) >= 3;
  const isPerforming = !!scene.performance;
  const img = scene.imageUrl || scene.gallery?.anchor?.imageUrl || null;
  const rim = isPerforming ? 'rgb(var(--color-cinnabar))' : '#a8824c';
  const clip = `fan-clip-${scene.id.slice(2, 10)}`;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(scene.id)}
      aria-label={`細看 ${scene.name}`}
      className="group flex flex-col items-center gap-1.5 rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-cinnabar"
    >
      <span className="relative block h-[68px] w-[60px] transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.08]">
        {isPerforming ? (
          <span aria-hidden className="absolute inset-x-1 top-0 h-[58px] animate-pulse rounded-full bg-cinnabar/30 blur-md" />
        ) : null}
        <svg viewBox="0 0 100 118" className="relative h-full w-full drop-shadow-[0_4px_9px_rgba(20,12,8,0.5)]">
          <defs>
            <clipPath id={clip}>
              <circle cx="50" cy="50" r="45" />
            </clipPath>
          </defs>
          <rect x="47" y="86" width="6" height="30" rx="3" fill="#7a5a3c" opacity="0.9" />
          <circle cx="50" cy="50" r="46" fill="#ece3ce" fillOpacity="0.96" />
          {img ? (
            <image href={img} x="4" y="4" width="92" height="92" clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
          ) : (
            <g stroke="#8a6844" strokeWidth="0.8" opacity="0.28">
              {Array.from({ length: 9 }).map((_, k) => {
                const a = ((-80 + k * 20) * Math.PI) / 180;
                return <line key={k} x1="50" y1="50" x2={50 + 46 * Math.cos(a)} y2={50 + 46 * Math.sin(a)} />;
              })}
            </g>
          )}
          <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2.6" stroke={rim} opacity={isPerforming ? 0.9 : 0.75} />
          {isPrivate ? <circle cx="50" cy="50" r="46" fill="none" strokeWidth="1" stroke={rim} strokeDasharray="3 4" opacity="0.5" /> : null}
        </svg>
        {!img ? (
          <span className="pointer-events-none absolute inset-x-0 top-0 flex h-[80%] items-center justify-center font-serif text-[10px] font-medium leading-[1.12] tracking-[0.06em] text-[#3a2c22] [writing-mode:vertical-rl]">
            {scene.name}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap font-serif text-2xs tracking-[0.18em] text-ink/85">
        {isPerforming ? <span className="h-1.5 w-1.5 rounded-full bg-cinnabar shadow-[0_0_6px_rgba(201,85,63,0.7)]" /> : null}
        {isPrivate ? <span className="h-1.5 w-1.5 rounded-full bg-gold/70" /> : null}
        {img ? scene.name : ''}
        {present > 0 ? <span className="text-mute">· {present}</span> : null}
      </span>
    </button>
  );
}
