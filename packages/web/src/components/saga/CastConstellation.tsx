'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
import type {
  Character,
  RelationshipEdge,
  RelationshipTone,
} from '@endless-story/shared';
import { characterPortraitTone } from '@/components/common/CharacterPortrait';
import { BlobImage } from '@/components/common/BlobImage';

/**
 * 班底關係圖 — saga 內成員 + 江湖外連節點。
 * 全螢幕沉浸式星圖佈局，支援 Hover 動態關係展示。
 */
const VIEWBOX_W = 1200;
const VIEWBOX_H = 800;
const CENTER_X = VIEWBOX_W / 2;
const CENTER_Y = VIEWBOX_H / 2;
const INNER_RX = 320;
const INNER_RY = 200;
const OUTER_RX = 480;
const OUTER_RY = 300;
const SAGA_BOUNDARY_RX = 400;
const SAGA_BOUNDARY_RY = 250;
const CAST_NODE_RADIUS = 32;
const WILD_NODE_RADIUS = 24;

interface PositionedCharacter {
  char: Character;
  x: number;
  y: number;
  kind: 'center' | 'cast' | 'wild';
}

const TONE_COLOR: Record<RelationshipTone, string> = {
  affection: 'rgb(var(--color-cinnabar))',
  romance: 'rgb(var(--color-cinnabar))',
  mentorship: 'rgb(var(--color-jade))',
  rivalry: 'rgb(var(--color-cinnabar))',
  wary: 'rgb(var(--color-mute))',
  tension: 'rgb(var(--color-cinnabar))',
  estrangement: 'rgb(var(--color-mute))',
  neutral: 'rgb(var(--color-hairline))',
};

const TONE_DASH: Record<RelationshipTone, string> = {
  affection: '',
  romance: '',
  mentorship: '',
  rivalry: '4 3',
  wary: '2 4',
  tension: '6 2 2 2',
  estrangement: '1 5',
  neutral: '1 6',
};

const TONE_LABEL: Record<RelationshipTone, string> = {
  affection: '親近',
  romance: '戀慕',
  mentorship: '師承',
  rivalry: '競爭',
  wary: '戒備',
  tension: '緊張',
  estrangement: '疏離',
  neutral: '平淡',
};

export function CastConstellation({
  cast,
  wildCast = [],
  edges,
  centerId = 'char_shen_huaiyin',
}: {
  cast: Character[];
  wildCast?: Character[];
  edges: RelationshipEdge[];
  centerId?: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (cast.length === 0) return null;

  // ── 排版邏輯 ──
  const center = cast.find((c) => c.id === centerId);
  const others = cast.filter((c) => c.id !== centerId);
  const positioned: PositionedCharacter[] = [];
  if (center) {
    positioned.push({ char: center, x: CENTER_X, y: CENTER_Y, kind: 'center' });
  }
  const castAngleByCharId = new Map<string, number>();
  others.forEach((char, i) => {
    const angle = (i / others.length) * Math.PI * 2 - Math.PI / 2;
    const x = CENTER_X + Math.cos(angle) * INNER_RX;
    const y = CENTER_Y + Math.sin(angle) * INNER_RY;
    positioned.push({ char, x, y, kind: 'cast' });
    castAngleByCharId.set(char.id, angle);
  });

  const wildEdgeStrength = new Map<string, Map<string, number>>();
  edges.forEach((e) => {
    const wildId = wildCast.find((w) => w.id === e.fromId || w.id === e.toId)?.id;
    if (!wildId) return;
    const sagaId = e.fromId === wildId ? e.toId : e.fromId;
    if (!cast.some((c) => c.id === sagaId)) return;
    const inner = wildEdgeStrength.get(wildId) ?? new Map<string, number>();
    inner.set(sagaId, Math.max(inner.get(sagaId) ?? 0, e.weight));
    wildEdgeStrength.set(wildId, inner);
  });

  const wildSlotsUsed = new Set<string>();
  wildCast.forEach((char, idx) => {
    const strengths = wildEdgeStrength.get(char.id);
    let baseAngle: number | undefined;
    if (strengths) {
      let topSagaId: string | null = null;
      let topW = 0;
      for (const [sid, w] of strengths) {
        if (w > topW) {
          topW = w;
          topSagaId = sid;
        }
      }
      if (topSagaId) {
        baseAngle = castAngleByCharId.get(topSagaId);
      }
    }
    if (baseAngle === undefined) {
      baseAngle = (idx / wildCast.length) * Math.PI * 2 - Math.PI / 2;
    }
    
    let key = baseAngle.toFixed(3);
    let offset = 0;
    while (wildSlotsUsed.has(key)) {
      offset += 0.18;
      key = (baseAngle + offset).toFixed(3);
    }
    wildSlotsUsed.add(key);
    const finalAngle = baseAngle + offset;
    const x = CENTER_X + Math.cos(finalAngle) * OUTER_RX;
    const y = CENTER_Y + Math.sin(finalAngle) * OUTER_RY;
    positioned.push({ char, x, y, kind: 'wild' });
  });

  const posById = new Map(positioned.map((p) => [p.char.id, p]));
  const kindByCharId = new Map(positioned.map((p) => [p.char.id, p.kind]));

  const validEdges = edges.filter((e) => posById.has(e.fromId) && posById.has(e.toId));

  // ── Hover 邏輯 ──
  const hoveredEdges = useMemo(() => {
    if (!hoveredId) return [];
    return validEdges
      .filter((e) => e.fromId === hoveredId || e.toId === hoveredId)
      .sort((a, b) => b.weight - a.weight);
  }, [hoveredId, validEdges]);

  const connectedIds = useMemo(() => {
    const set = new Set<string>();
    if (!hoveredId) return set;
    set.add(hoveredId);
    hoveredEdges.forEach(e => {
      set.add(e.fromId);
      set.add(e.toId);
    });
    return set;
  }, [hoveredId, hoveredEdges]);

  return (
    <section className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-canvas">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(var(--color-surface),0.6)_0%,rgba(var(--color-canvas),1)_100%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(var(--color-elevated),0.3)_0%,rgba(var(--color-canvas),1)_100%)]" />
      
      <div 
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{ backgroundImage: 'radial-gradient(rgb(var(--color-ink)) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />

      {/* Elegant Header */}
      <div className="absolute left-6 top-24 z-20 sm:left-10 sm:top-28 pointer-events-none">
        <div className="flex items-center gap-4">
          <div className="h-px w-8 bg-cinnabar/60" />
          <h2 className="font-serif text-3xl tracking-[0.15em] text-ink drop-shadow-sm sm:text-4xl">人物圖譜</h2>
        </div>
        <p className="mt-3 pl-12 text-xs tracking-widest text-mute/80 drop-shadow-sm">
          班底 {cast.length} 人 · 江湖外連 {wildCast.length}
        </p>
      </div>

      {/* Dynamic Relationship Panel */}
      <div className="absolute bottom-8 right-6 z-20 sm:bottom-12 sm:right-10 pointer-events-none">
        {hoveredId ? (
          <div className="w-64 rounded-3xl border border-hairline/40 bg-surface/85 p-5 shadow-2xl backdrop-blur-xl dark:bg-elevated/85 animate-fade-in-up">
            <div className="flex items-end gap-3 border-b border-hairline/50 pb-3">
              <span className="font-serif text-xl text-ink">{posById.get(hoveredId)?.char.name}</span>
              <span className="text-2xs tracking-widest text-mute mb-0.5">的牽絆</span>
            </div>
            <ul className="mt-3 space-y-3 max-h-[40vh] overflow-y-auto [scrollbar-width:none]">
              {hoveredEdges.length > 0 ? (
                hoveredEdges.map((e) => {
                  const targetId = e.fromId === hoveredId ? e.toId : e.fromId;
                  const target = posById.get(targetId)?.char;
                  const toneLabel = e.tone ? TONE_LABEL[e.tone] : '平淡';
                  const toneColor = e.tone ? TONE_COLOR[e.tone] : TONE_COLOR.neutral;
                  return (
                    <li key={targetId} className="flex items-center justify-between">
                      <span className="text-sm text-ink/90">{target?.name}</span>
                      <span 
                        className="text-xs tracking-widest"
                        style={{ color: toneColor }}
                      >
                        {toneLabel}
                      </span>
                    </li>
                  );
                })
              ) : (
                <li className="text-xs text-mute italic">尚無深刻牽絆</li>
              )}
            </ul>
          </div>
        ) : (
          <p className="text-xs tracking-widest text-mute/60 drop-shadow-sm">
            游標懸浮於人物以查看牽絆
          </p>
        )}
      </div>

      {/* The Constellation Map */}
      <div className="relative z-10 w-full max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-4rem)] lg:max-w-[calc(85vh*1.5)] mx-auto">
        <div className="relative w-full" style={{ aspectRatio: `${VIEWBOX_W}/${VIEWBOX_H}` }}>
          <svg viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
            {/* saga 邊界虛線橢圓 */}
            <ellipse
              cx={CENTER_X}
              cy={CENTER_Y}
              rx={SAGA_BOUNDARY_RX}
              ry={SAGA_BOUNDARY_RY}
              fill="none"
              stroke="rgb(var(--color-hairline))"
              strokeWidth="1.5"
              strokeDasharray="4 6"
              className="transition-opacity duration-500"
              opacity={hoveredId ? 0.1 : 0.4}
            />

            {/* edges */}
            {validEdges.map((edge) => {
              const from = posById.get(edge.fromId)!;
              const to = posById.get(edge.toId)!;
              const isCross =
                (kindByCharId.get(edge.fromId) === 'wild') !==
                (kindByCharId.get(edge.toId) === 'wild');
              
              const strokeWidth = 0.8 + (edge.weight / 10) * (isCross ? 2.5 : 4);
              const stroke = edge.tone ? TONE_COLOR[edge.tone] : TONE_COLOR.neutral;
              const dash = edge.tone ? TONE_DASH[edge.tone] : '';
              const baseOpacity = isCross
                ? 0.25 + (edge.weight / 10) * 0.35
                : 0.4 + (edge.weight / 10) * 0.5;
              const finalDash = isCross && !dash ? '2 5' : dash;

              const isHovered = hoveredId ? (edge.fromId === hoveredId || edge.toId === hoveredId) : false;
              const opacity = hoveredId 
                ? (isHovered ? Math.min(1, baseOpacity * 2) : 0.05)
                : baseOpacity;

              // Calculate curved path
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              const nx = -dy / len;
              const ny = dx / len;
              const offset = len * 0.12; // 12% curve
              const cx = midX + nx * offset;
              const cy = midY + ny * offset;

              return (
                <path
                  key={`${edge.fromId}-${edge.toId}`}
                  d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={finalDash || undefined}
                  strokeLinecap="round"
                  fill="none"
                  opacity={opacity}
                  className="transition-all duration-500"
                />
              );
            })}
          </svg>

          {/* nodes */}
          {positioned.map(({ char, x, y, kind }) => {
            const isDimmed = hoveredId ? !connectedIds.has(char.id) : false;
            return (
              <ConstellationNode 
                key={char.id} 
                char={char} 
                x={x} 
                y={y} 
                kind={kind} 
                isDimmed={isDimmed}
                onMouseEnter={() => setHoveredId(char.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            );
          })}

          {/* 江湖標記 — 邊界外側淡標 */}
          <span
            aria-hidden
            className={`pointer-events-none absolute left-1/2 top-[8%] -translate-x-1/2 text-xs tracking-[0.6em] text-mute/40 transition-opacity duration-500 ${hoveredId ? 'opacity-0' : 'opacity-100'}`}
          >
            江湖
          </span>
          <span
            aria-hidden
            className={`pointer-events-none absolute left-1/2 bottom-[8%] -translate-x-1/2 text-xs tracking-[0.6em] text-mute/40 transition-opacity duration-500 ${hoveredId ? 'opacity-0' : 'opacity-100'}`}
          >
            江湖
          </span>
        </div>
      </div>
    </section>
  );
}

function ConstellationNode({
  char,
  x,
  y,
  kind,
  isDimmed,
  onMouseEnter,
  onMouseLeave,
}: {
  char: Character;
  x: number;
  y: number;
  kind: 'center' | 'cast' | 'wild';
  isDimmed: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const tone = characterPortraitTone(char.role);
  const imageUrl = char.gallery?.anchor?.imageUrl;
  const sizePx =
    kind === 'center' ? CAST_NODE_RADIUS * 2 + 16 : kind === 'cast' ? CAST_NODE_RADIUS * 2 : WILD_NODE_RADIUS * 2;
  const ringClass =
    kind === 'wild'
      ? 'ring-1 ring-mute/40 border border-dashed border-mute/50'
      : `ring-2 ring-surface ${tone.ring}`;

  return (
    <Link
      href={{ pathname: '/dossier', query: { id: char.id } }}
      title={`${char.name} · ${char.role}${kind === 'wild' ? ' · 江湖' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 outline-none ring-offset-2 ring-offset-transparent transition-all duration-500 hover:scale-110 hover:brightness-[1.05] focus-visible:ring-2 focus-visible:ring-cinnabar dark:hover:brightness-110 active:scale-100 ${
        isDimmed ? 'opacity-25 grayscale-[0.6]' : 'opacity-100'
      }`}
      style={{
        left: `${(x / VIEWBOX_W) * 100}%`,
        top: `${(y / VIEWBOX_H) * 100}%`,
      }}
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
          style={{ fontSize: kind === 'center' ? 24 : kind === 'cast' ? 18 : 14 }}
        >
          {char.name[0]}
        </span>
        {imageUrl ? (
          <BlobImage src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
      </span>
      <span
        className={`whitespace-nowrap font-serif text-sm drop-shadow-sm transition-colors group-hover:text-ink sm:text-base ${
          kind === 'wild' ? 'text-mute/90 italic' : 'text-ink/85'
        }`}
      >
        {char.name}
      </span>
    </Link>
  );
}
