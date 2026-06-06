'use client';

import { useEffect, useState } from 'react';
import type { DayPart } from '@endless-story/shared';
import type { LocationSegment } from './handscrollLayout';

/**
 * 資料驅動的手卷底紙 — 范寬／郭熙風雪景寒林，但院落是「一個 location 一段」生成的。
 *
 * （取代了早期把戲樓／月洞門／院落畫死在 3000 寬固定畫布的做法；換 saga 就對不上。）
 * 這裡改成：viewBox 寬 = segmentCount × SEG，每個 location 段中央依其 terrain／
 * 名稱挑一個院落母題（碼頭／茶樓／院落／街坊／遊樂場／後巷／戲台…），段與段之間沿地面
 * 連一道矮牆、牆上開月洞門當「相鄰」暗示。遠山、雪地、枯枝、燈籠橫貫整卷、隨段數伸縮。
 *
 * 墨色採 --color-ink / --color-mute 隨主題切換（暗色模式轉暖灰米色）。
 */

const SEG = 1000; // 每段在 viewBox 內的寬度單位
const VH = 1000; // viewBox 高
const GROUND_Y = 700; // 建築坐落的地平線
const WALL_Y = 712;
const MOON_R = 64; // 月洞門半徑

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

type Motif =
  | 'stage'
  | 'teahouse'
  | 'courtyard'
  | 'street'
  | 'wharf'
  | 'amusement'
  | 'alley'
  | 'pavilion';

function pickMotif(terrain: string | undefined, name: string): Motif {
  const t = (terrain ?? '').toLowerCase();
  const n = name ?? '';
  if (/wharf|dock|pier|harbor|harbour/.test(t) || /碼頭|河|港|渡/.test(n)) return 'wharf';
  if (/tea|press|news/.test(t) || /茶|報館|報|館/.test(n)) return 'teahouse';
  if (/compound|courtyard|yard|manor/.test(t) || /院|庫|宅|府|園/.test(n)) return 'courtyard';
  if (/amusement|hall|fair|park/.test(t) || /遊樂|樂場|大世界/.test(n)) return 'amusement';
  if (/alley|back/.test(t) || /後街|巷|弄/.test(n)) return 'alley';
  if (/street|concession|road|avenue/.test(t) || /街|路/.test(n)) return 'street';
  if (/stage|theat/.test(t) || /戲台|戲樓|台/.test(n)) return 'stage';
  return 'pavilion';
}

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

export function SagaScrollBackdrop({
  segments,
  partOfDay,
}: {
  segments: LocationSegment[];
  partOfDay: DayPart;
}) {
  const isDark = useIsDark();
  const n = Math.max(1, segments.length);
  const W = n * SEG;

  const baseOpacity = DAY_PART_INK_OPACITY[partOfDay];
  const inkOpacity = isDark ? Math.min(0.95, baseOpacity + 0.25) : baseOpacity;
  const lanternLit = partOfDay === 'dusk' || partOfDay === 'night';

  const ink = (a: number) => (isDark ? `rgba(220, 206, 176, ${a})` : `rgba(40, 38, 44, ${a})`);
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

      {/* 主畫面 SVG — 山水 / 院落 / 雪林，寬度隨段數伸縮 */}
      <svg
        viewBox={`0 0 ${W} ${VH}`}
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

        <RemoteMountains width={W} fill={inkFaint} />
        <MidMountains width={W} fill={inkSoft} />

        {/* 雪地高光 */}
        <rect x="0" y={GROUND_Y + 20} width={W} height={VH - GROUND_Y - 20} fill="url(#snowGround)" />

        {/* 段間矮牆 + 月洞門（連續感 + 相鄰暗示） */}
        <DividerWalls count={n} inkColor={inkColor} inkSoft={inkSoft} />

        {/* 每個 location 一座院落 */}
        {segments.map((seg, i) => {
          const motif = pickMotif(seg.location.terrain, seg.location.name);
          return (
            <Courtyard
              key={seg.location.id}
              x0={i * SEG}
              motif={motif}
              inkColor={inkColor}
              inkSoft={inkSoft}
              inkFaint={inkFaint}
            />
          );
        })}

        {/* 枯枝 — 每段一兩株，錯落 */}
        <g stroke={inkColor} strokeWidth="1.2" fill="none" strokeLinecap="round">
          {Array.from({ length: n }).map((_, i) => {
            const bx = i * SEG + (i % 2 === 0 ? 120 : SEG - 150);
            const h = 150 + (i % 3) * 28;
            return <BareTree key={i} x={bx} groundY={GROUND_Y} h={h} />;
          })}
        </g>

        {/* 燈籠 — 每段兩盞，黃昏／夜晚發光 */}
        {Array.from({ length: n }).map((_, i) =>
          [0.32, 0.68].map((f, k) => {
            const lx = i * SEG + SEG * f;
            return (
              <g key={`${i}-${k}`} transform={`translate(${lx}, 540)`}>
                {lanternLit ? (
                  <circle r="44" fill="url(#lanternGlow)" className="es-lantern-flicker" />
                ) : null}
                <ellipse
                  cx="0"
                  cy="0"
                  rx="6"
                  ry="8"
                  fill={lanternLit ? 'rgb(var(--color-cinnabar))' : inkSoft}
                  fillOpacity={lanternLit ? 0.9 : 0.5}
                />
                <line x1="0" y1="-12" x2="0" y2="-24" stroke={inkColor} strokeWidth="1" />
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}

// ── 山水 ──

function RemoteMountains({ width, fill }: { width: number; fill: string }) {
  // 一條連續遠山，沿整卷起伏
  const step = 360;
  let d = `M 0 540`;
  for (let x = step; x <= width; x += step) {
    const y = 500 + ((x / step) % 2 === 0 ? 20 : -20);
    d += ` Q ${x - step / 2} ${y - 40} ${x} ${y}`;
  }
  d += ` L ${width} ${VH} L 0 ${VH} Z`;
  return <path d={d} fill={fill} />;
}

function MidMountains({ width, fill }: { width: number; fill: string }) {
  const step = 200;
  let d = `M 0 640`;
  let up = true;
  for (let x = 0; x <= width; x += step) {
    const y = up ? 560 : 630;
    d += ` L ${x} ${y}`;
    up = !up;
  }
  d += ` L ${width} ${VH} L 0 ${VH} Z`;
  return <path d={d} fill={fill} />;
}

// ── 段間矮牆 + 月洞門 ──

function DividerWalls({
  count,
  inkColor,
  inkSoft,
}: {
  count: number;
  inkColor: string;
  inkSoft: string;
}) {
  // count 段 → count-1 道隔牆（段之間）
  const boundaries = Array.from({ length: Math.max(0, count - 1) }, (_, k) => k + 1);
  return (
    <>
      {boundaries.map((i) => {
        const x = i * SEG;
        return (
          <g key={i}>
            {/* 牆基往兩側鋪一小段 */}
            <line x1={x - 130} y1={WALL_Y} x2={x - MOON_R} y2={WALL_Y} stroke={inkColor} strokeWidth="2" />
            <line x1={x + MOON_R} y1={WALL_Y} x2={x + 130} y2={WALL_Y} stroke={inkColor} strokeWidth="2" />
            {/* 月洞門拱 */}
            <path
              d={`M ${x - MOON_R} ${WALL_Y} A ${MOON_R} ${MOON_R} 0 0 1 ${x + MOON_R} ${WALL_Y}`}
              stroke={inkColor}
              strokeWidth="2.5"
              fill="none"
            />
            <path
              d={`M ${x - MOON_R + 8} ${WALL_Y} A ${MOON_R - 8} ${MOON_R - 8} 0 0 1 ${x + MOON_R - 8} ${WALL_Y}`}
              stroke="rgb(var(--color-cinnabar))"
              strokeOpacity="0.3"
              strokeWidth="1.5"
              fill="none"
            />
            {/* 門洞內透出的淡影 */}
            <path
              d={`M ${x - MOON_R + 8} ${WALL_Y} A ${MOON_R - 8} ${MOON_R - 8} 0 0 1 ${x + MOON_R - 8} ${WALL_Y} Z`}
              fill={inkSoft}
              opacity="0.25"
            />
          </g>
        );
      })}
    </>
  );
}

// ── 枯枝 ──

function BareTree({ x, groundY, h }: { x: number; groundY: number; h: number }) {
  return (
    <g transform={`translate(${x},${groundY - h})`}>
      <path d={`M 0 ${h} L 0 0`} strokeWidth="2" />
      <path d={`M 0 ${h * 0.6} L -24 ${h * 0.3}`} />
      <path d={`M -24 ${h * 0.3} L -34 ${h * 0.15}`} />
      <path d={`M -24 ${h * 0.3} L -16 ${h * 0.08}`} />
      <path d={`M 0 ${h * 0.45} L 26 ${h * 0.2}`} />
      <path d={`M 26 ${h * 0.2} L 36 ${h * 0.05}`} />
      <path d={`M 26 ${h * 0.2} L 32 ${h * 0.34}`} />
      <path d={`M 0 ${h * 0.78} L -18 ${h * 0.6}`} />
    </g>
  );
}

// ── 院落母題 ──
//
// 每座院落是一段純剪影（inkColor / inkSoft），坐落在 GROUND_Y。座標相對 x0（段左緣）。
// 母題只求「一眼能分出不同地方」，不追細節；換 saga 仍成立。

function Courtyard({
  x0,
  motif,
  inkColor,
  inkSoft,
  inkFaint,
}: {
  x0: number;
  motif: Motif;
  inkColor: string;
  inkSoft: string;
  inkFaint: string;
}) {
  const cx = x0 + SEG / 2;
  const g = GROUND_Y;
  switch (motif) {
    case 'stage':
      return (
        <g>
          {/* 歇山頂戲台 */}
          <path d={`M ${cx - 160} ${g - 180} L ${cx - 60} ${g - 270} L ${cx + 60} ${g - 270} L ${cx + 160} ${g - 180} Z`} fill={inkColor} stroke={inkColor} strokeLinejoin="round" />
          <path d={`M ${cx - 90} ${g - 180} L ${cx} ${g - 240} L ${cx + 90} ${g - 180} Z`} fill={inkSoft} />
          <rect x={cx - 130} y={g - 180} width={260} height={180} fill={inkSoft} opacity="0.7" />
          {[-90, -30, 30, 90].map((d) => (
            <line key={d} x1={cx + d} y1={g - 180} x2={cx + d} y2={g} stroke={inkColor} strokeWidth="2" />
          ))}
          {/* 台前低欄 */}
          <rect x={cx - 170} y={g - 24} width={340} height={24} fill={inkSoft} opacity="0.6" />
        </g>
      );
    case 'teahouse':
      return (
        <g>
          {/* 二層茶樓 */}
          <rect x={cx - 110} y={g - 240} width={220} height={120} fill={inkSoft} opacity="0.8" />
          <rect x={cx - 130} y={g - 120} width={260} height={120} fill={inkSoft} opacity="0.7" />
          <path d={`M ${cx - 150} ${g - 240} L ${cx} ${g - 300} L ${cx + 150} ${g - 240} Z`} fill={inkColor} stroke={inkColor} strokeLinejoin="round" />
          {/* 欄杆 */}
          {[-100, -60, -20, 20, 60, 100].map((d) => (
            <line key={d} x1={cx + d} y1={g - 132} x2={cx + d} y2={g - 120} stroke={inkColor} strokeWidth="2" />
          ))}
          {/* 招幌 */}
          <line x1={cx + 130} y1={g - 200} x2={cx + 130} y2={g - 60} stroke={inkColor} strokeWidth="2" />
          <rect x={cx + 122} y={g - 200} width={16} height={60} fill="rgb(var(--color-cinnabar))" opacity="0.4" />
        </g>
      );
    case 'courtyard':
      return (
        <g>
          {/* 圍牆 + 院門 + 內進屋頂 */}
          <rect x={cx - 200} y={g - 70} width={400} height={70} fill={inkFaint} stroke={inkSoft} strokeWidth="1.5" />
          <path d={`M ${cx - 200} ${g - 70} L ${cx - 200} ${g - 110} L ${cx - 60} ${g - 110}`} stroke={inkSoft} strokeWidth="1.5" fill="none" />
          <path d={`M ${cx - 60} ${g - 200} L ${cx + 40} ${g - 250} L ${cx + 140} ${g - 200} Z`} fill={inkColor} stroke={inkColor} strokeLinejoin="round" />
          <rect x={cx - 40} y={g - 200} width={160} height={130} fill={inkSoft} opacity="0.75" />
          {/* 院門 */}
          <rect x={cx - 150} y={g - 60} width={48} height={60} fill={inkColor} opacity="0.85" />
        </g>
      );
    case 'street':
      return (
        <g>
          {/* 牌坊 + 沿街連排店面 */}
          <line x1={cx - 150} y1={g - 220} x2={cx - 150} y2={g} stroke={inkColor} strokeWidth="3" />
          <line x1={cx + 150} y1={g - 220} x2={cx + 150} y2={g} stroke={inkColor} strokeWidth="3" />
          <path d={`M ${cx - 175} ${g - 220} L ${cx} ${g - 252} L ${cx + 175} ${g - 220} Z`} fill={inkColor} stroke={inkColor} strokeLinejoin="round" />
          <rect x={cx - 175} y={g - 232} width={350} height={14} fill={inkColor} />
          {[-120, -50, 20, 90].map((d) => (
            <rect key={d} x={cx + d} y={g - 90} width={50} height={90} fill={inkSoft} opacity="0.7" />
          ))}
        </g>
      );
    case 'wharf':
      return (
        <g>
          {/* 水線 + 木樁 + 停泊小舟 */}
          <path d={`M ${x0 + 40} ${g - 10} Q ${cx} ${g - 26} ${x0 + SEG - 40} ${g - 10}`} stroke={inkSoft} strokeWidth="2" fill="none" opacity="0.7" />
          <path d={`M ${x0 + 60} ${g + 18} Q ${cx} ${g + 2} ${x0 + SEG - 60} ${g + 18}`} stroke={inkSoft} strokeWidth="1.5" fill="none" opacity="0.5" />
          {[-180, -120, 120, 180].map((d) => (
            <line key={d} x1={cx + d} y1={g - 40} x2={cx + d} y2={g + 6} stroke={inkColor} strokeWidth="3" />
          ))}
          {/* 小舟 */}
          <path d={`M ${cx - 90} ${g - 30} Q ${cx} ${g + 6} ${cx + 90} ${g - 30} Z`} fill={inkColor} opacity="0.85" />
          <line x1={cx} y1={g - 30} x2={cx} y2={g - 130} stroke={inkColor} strokeWidth="2.5" />
          <path d={`M ${cx} ${g - 130} L ${cx + 70} ${g - 90} L ${cx} ${g - 70} Z`} fill={inkSoft} opacity="0.7" />
        </g>
      );
    case 'amusement':
      return (
        <g>
          {/* 圓頂遊樂場 + 旗桿 */}
          <path d={`M ${cx - 160} ${g} A 160 150 0 0 1 ${cx + 160} ${g} Z`} fill={inkSoft} opacity="0.8" stroke={inkColor} strokeWidth="1.5" />
          <line x1={cx} y1={g - 150} x2={cx} y2={g - 280} stroke={inkColor} strokeWidth="3" />
          <path d={`M ${cx} ${g - 280} L ${cx + 70} ${g - 262} L ${cx} ${g - 244} Z`} fill="rgb(var(--color-cinnabar))" opacity="0.45" />
          {[-110, 0, 110].map((d) => (
            <line key={d} x1={cx + d} y1={g - 140} x2={cx + d} y2={g - 200} stroke={inkColor} strokeWidth="2" />
          ))}
          {[-110, 110].map((d) => (
            <path key={d} d={`M ${cx + d} ${g - 200} L ${cx + d + 40} ${g - 190} L ${cx + d} ${g - 180} Z`} fill={inkColor} opacity="0.6" />
          ))}
        </g>
      );
    case 'alley':
      return (
        <g>
          {/* 兩棟窄高樓夾出後巷 */}
          <rect x={cx - 170} y={g - 240} width={120} height={240} fill={inkSoft} opacity="0.8" />
          <rect x={cx + 50} y={g - 280} width={120} height={280} fill={inkSoft} opacity="0.75" />
          <path d={`M ${cx - 178} ${g - 240} L ${cx - 110} ${g - 280} L ${cx - 42} ${g - 240} Z`} fill={inkColor} />
          <path d={`M ${cx + 42} ${g - 280} L ${cx + 110} ${g - 320} L ${cx + 178} ${g - 280} Z`} fill={inkColor} />
          {/* 巷中燈 */}
          <line x1={cx} y1={g - 120} x2={cx} y2={g - 96} stroke={inkColor} strokeWidth="1.5" />
          <ellipse cx={cx} cy={g - 92} rx="6" ry="8" fill="rgb(var(--color-cinnabar))" opacity="0.4" />
        </g>
      );
    case 'pavilion':
    default:
      return (
        <g>
          <path d={`M ${cx - 130} ${g - 170} L ${cx} ${g - 250} L ${cx + 130} ${g - 170} Z`} fill={inkColor} stroke={inkColor} strokeLinejoin="round" />
          <rect x={cx - 100} y={g - 170} width={200} height={170} fill={inkSoft} opacity="0.7" />
          {[-60, 0, 60].map((d) => (
            <line key={d} x1={cx + d} y1={g - 170} x2={cx + d} y2={g} stroke={inkColor} strokeWidth="2" />
          ))}
        </g>
      );
  }
}
