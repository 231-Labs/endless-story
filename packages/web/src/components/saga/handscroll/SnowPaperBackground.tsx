'use client';

import { useEffect, useState } from 'react';
import type { DayPart } from '@endless-story/shared';

/**
 * 雪景寒林手卷底紙 — 范寬／郭熙風。
 *  · 紙面 + 細粒
 *  · 三層遠／中／近山（淡墨，dark mode 改成淡卡其）
 *  · 戲樓（左）／月洞門（中）／院落（右）建築剪影
 *  · 枯枝、雪地、燈籠（黃昏／夜亮）
 *
 * 墨色採 CSS 變數 --color-ink / --color-mute 隨主題切換，
 * 暗色模式自動變成暖灰／米色，山林才看得見。
 */

const DAY_PART_PAPER: Record<DayPart, string> = {
  morning: 'rgba(255, 248, 232, 0.10)',
  noon: 'rgba(255, 253, 240, 0.05)',
  dusk: 'rgba(220, 130, 90, 0.18)',
  night: 'rgba(28, 24, 50, 0.42)',
};

const DAY_PART_INK_OPACITY: Record<DayPart, number> = {
  morning: 0.32,
  noon: 0.28,
  dusk: 0.42,
  night: 0.62,
};

const LANTERN_X = [380, 540, 720, 900, 1500, 1700, 1900, 2150];

function useIsDark() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const update = () => setIsDark(html.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export function SnowPaperBackground({ partOfDay }: { partOfDay: DayPart }) {
  const isDark = useIsDark();
  const baseOpacity = DAY_PART_INK_OPACITY[partOfDay];
  // 暗色模式抬一階透明度，否則米色墨在深紙面上會太淡
  const inkOpacity = isDark ? Math.min(0.95, baseOpacity + 0.25) : baseOpacity;
  const lanternLit = partOfDay === 'dusk' || partOfDay === 'night';

  // 主題感知的墨色 — 亮模式深灰、暗模式米色
  const ink = (a: number) =>
    isDark
      ? `rgba(220, 206, 176, ${a})`
      : `rgba(40, 38, 44, ${a})`;
  const inkColor = ink(inkOpacity);
  const inkSoft = ink(inkOpacity * 0.55);
  const inkFaint = ink(inkOpacity * 0.32);

  return (
    <div className="absolute inset-0">
      {/* 紙底 */}
      <div className="absolute inset-0 bg-gradient-to-b from-canvas via-surface to-canvas dark:from-canvas dark:via-elevated/55 dark:to-canvas" />

      {/* 晝夜色洗 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-soft-light dark:mix-blend-screen"
        style={{ background: DAY_PART_PAPER[partOfDay] }}
      />

      {/* 紙質顆粒 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")",
        }}
      />

      {/* 主畫面 SVG — 山水 / 建築 / 雪林 */}
      <svg
        viewBox="0 0 3000 1000"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="snowGround" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="60%" stopColor={isDark ? 'rgba(230,220,200,0.04)' : 'rgba(255,255,255,0.06)'} />
            <stop offset="100%" stopColor={isDark ? 'rgba(230,220,200,0.10)' : 'rgba(255,255,255,0.18)'} />
          </linearGradient>
          <radialGradient id="lanternGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255, 196, 96, 0.85)" />
            <stop offset="55%" stopColor="rgba(220, 132, 60, 0.45)" />
            <stop offset="100%" stopColor="rgba(176, 74, 60, 0)" />
          </radialGradient>
        </defs>

        {/* 遠山 */}
        <g>
          <path
            d="M 0 540 Q 200 480 380 520 T 720 500 T 1080 510 T 1420 480 T 1780 520 T 2200 490 T 2620 510 T 3000 500 L 3000 1000 L 0 1000 Z"
            fill={inkFaint}
          />
        </g>

        {/* 中山 */}
        <g>
          <path
            d="M 0 640 L 140 540 L 260 620 L 420 480 L 580 610 L 760 530 L 920 620 L 1080 580 L 1240 610 L 1380 520 L 1540 600 L 1720 540 L 1880 610 L 2080 500 L 2280 620 L 2480 540 L 2700 610 L 2880 560 L 3000 600 L 3000 1000 L 0 1000 Z"
            fill={inkSoft}
          />
        </g>

        {/* 雪地高光 */}
        <rect x="0" y="720" width="3000" height="280" fill="url(#snowGround)" />

        {/* 戲樓 pavilion（左：x≈360-1000） */}
        <g>
          <path
            d="M 360 480 L 480 380 L 600 380 L 720 480 Z"
            fill={inkColor}
            stroke={inkColor}
            strokeLinejoin="round"
          />
          <path
            d="M 350 484 Q 358 470 370 478"
            stroke={inkColor}
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M 730 484 Q 722 470 710 478"
            stroke={inkColor}
            strokeWidth="2"
            fill="none"
          />
          <path d="M 410 480 L 540 420 L 670 480 Z" fill={inkSoft} />
          <rect x="380" y="480" width="320" height="180" fill={inkSoft} opacity="0.7" />
          {[420, 500, 580, 660].map((cx) => (
            <line
              key={cx}
              x1={cx}
              y1="480"
              x2={cx}
              y2="660"
              stroke={inkColor}
              strokeWidth="1.5"
            />
          ))}
          <path d="M 220 580 L 280 540 L 340 580 L 340 660 L 220 660 Z" fill={inkSoft} />
          <path d="M 740 540 L 820 540 L 820 660 L 740 660 Z" fill={inkSoft} />
          <path d="M 840 600 L 920 600 L 920 660 L 840 660 Z" fill={inkSoft} opacity="0.85" />
        </g>

        {/* 月洞門（中：x≈1180-1320） */}
        <g>
          <line x1="1000" y1="660" x2="1180" y2="660" stroke={inkColor} strokeWidth="2" />
          <line x1="1320" y1="660" x2="1480" y2="660" stroke={inkColor} strokeWidth="2" />
          <path
            d="M 1180 660 A 70 70 0 0 1 1320 660"
            stroke={inkColor}
            strokeWidth="2.5"
            fill="none"
          />
          <path
            d="M 1190 660 A 60 60 0 0 1 1310 660"
            stroke="rgb(var(--color-cinnabar))"
            strokeOpacity="0.32"
            strokeWidth="1.5"
            fill="none"
          />
          <text
            x="1250"
            y="600"
            textAnchor="middle"
            className="font-serif"
            style={{ fontSize: '20px', letterSpacing: '0.3em', fill: ink(inkOpacity * 0.7) }}
          >
            月洞門
          </text>
        </g>

        {/* 院落（右：x≈1500-2300） */}
        <g>
          <path
            d="M 1440 540 L 1560 500 L 1680 540 L 1680 660 L 1440 660 Z"
            fill={inkSoft}
            stroke={inkColor}
            strokeWidth="1"
          />
          <path
            d="M 1620 600 L 1700 600 L 1780 600 L 1780 660 L 1620 660 Z"
            fill={inkSoft}
          />
          <path
            d="M 2040 480 L 2160 440 L 2260 480 L 2260 660 L 2040 660 Z"
            fill={inkSoft}
            stroke={inkColor}
            strokeWidth="1"
          />
          <line x1="2260" y1="660" x2="2380" y2="660" stroke={inkColor} strokeWidth="2" />
        </g>

        {/* 枯枝 — 散佈整卷 */}
        <g stroke={inkColor} strokeWidth="1.2" fill="none" strokeLinecap="round">
          {[120, 1050, 1380, 1840, 2390, 2750].map((bx, i) => {
            const h = 130 + (i % 3) * 30;
            return (
              <g key={bx} transform={`translate(${bx},${720 - h})`}>
                <path d={`M 0 ${h} L 0 0`} strokeWidth="2" />
                <path d={`M 0 ${h * 0.6} L -22 ${h * 0.3}`} />
                <path d={`M -22 ${h * 0.3} L -32 ${h * 0.15}`} />
                <path d={`M -22 ${h * 0.3} L -16 ${h * 0.08}`} />
                <path d={`M 0 ${h * 0.45} L 24 ${h * 0.2}`} />
                <path d={`M 24 ${h * 0.2} L 34 ${h * 0.05}`} />
                <path d={`M 24 ${h * 0.2} L 30 ${h * 0.32}`} />
                <path d={`M 0 ${h * 0.78} L -16 ${h * 0.6}`} />
              </g>
            );
          })}
        </g>

        {/* 燈籠 — 黃昏／夜晚發光 */}
        {LANTERN_X.map((lx) => (
          <g key={lx} transform={`translate(${lx}, 530)`}>
            {lanternLit ? (
              <circle r="42" fill="url(#lanternGlow)" className="es-lantern-flicker" />
            ) : null}
            <ellipse
              cx="0"
              cy="0"
              rx="6"
              ry="8"
              fill={lanternLit ? 'rgb(var(--color-cinnabar))' : inkSoft}
              fillOpacity={lanternLit ? 0.9 : 0.5}
            />
            <line x1="0" y1="-12" x2="0" y2="-22" stroke={inkColor} strokeWidth="1" />
          </g>
        ))}
      </svg>
    </div>
  );
}
