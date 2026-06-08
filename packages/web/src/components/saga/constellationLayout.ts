'use client';

import { useEffect, useState } from 'react';
import type { Character, RelationshipEdge, RelationshipTone, Scene } from '@endless-story/shared';

export const VIEWBOX_W = 1200;
export const VIEWBOX_H = 800;
export const SAGA = { x: 200, y: 100, w: 800, h: 600 };
export const WALL_Y = SAGA.y + SAGA.h / 2; // theater / courtyard divider
export const MOON_DOOR = { x1: 560, x2: 640, cx: 600, r: 40 };
export const CAST_NODE_PX_CENTER = 76;
export const CAST_NODE_PX_OTHER = 60;
export const WILD_NODE_PX = 48;

export type Zone = 'theater' | 'compound' | 'outside';

export interface PositionedCharacter {
  char: Character;
  x: number;
  y: number;
  /** Which scene inside the saga; outsiders = null */
  scene: Scene | null;
  /** liveState.location string — outsiders only */
  externalLabel?: string;
  kind: 'center' | 'cast' | 'wild';
}

export const TONE_COLOR: Record<RelationshipTone, string> = {
  affection: 'rgb(var(--color-cinnabar))',
  romance: 'rgb(var(--color-cinnabar))',
  mentorship: 'rgb(var(--color-jade))',
  rivalry: 'rgb(var(--color-cinnabar))',
  wary: 'rgb(var(--color-mute))',
  tension: 'rgb(var(--color-cinnabar))',
  estrangement: 'rgb(var(--color-mute))',
  acquaintance: 'rgb(var(--color-jade))',
  neutral: 'rgb(var(--color-hairline))',
};

export const TONE_DASH: Record<RelationshipTone, string> = {
  affection: '',
  romance: '',
  mentorship: '',
  rivalry: '',
  wary: '2 5',
  tension: '',
  estrangement: '1 6',
  acquaintance: '4 4',
  neutral: '',
};

export const TONE_LABEL: Record<RelationshipTone, string> = {
  affection: '親近',
  romance: '戀慕',
  mentorship: '師承',
  rivalry: '競爭',
  wary: '戒備',
  tension: '緊張',
  estrangement: '疏離',
  acquaintance: '故舊',
  neutral: '平淡',
};

export function useIsDark() {
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

// ── Helpers ──

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Node collision radius (viewBox units ≈ screen px, container ≈ viewBox 1200): avatar radius + nameplate padding. */
export function nodeCollisionRadius(kind: PositionedCharacter['kind']): number {
  if (kind === 'center') return 46;
  if (kind === 'cast') return 38;
  return 32; // wild
}

/**
 * Collision relaxation: push overlapping nodes apart until bond curves are visible.
 * Pure geometry, deterministic (no randomness); initial placement carries the
 * "who's where" semantics, this only resolves overlap.
 */
export function relaxOverlaps(nodes: PositionedCharacter[]): void {
  const n = nodes.length;
  if (n < 2) return;
  const PAD = 10;

  // Nudge exactly-coincident nodes apart by an index-based angle first, so relaxation has a direction to push.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (nodes[i].x === nodes[j].x && nodes[i].y === nodes[j].y) {
        const a = (j / n) * Math.PI * 2;
        nodes[j].x += Math.cos(a) * 0.5;
        nodes[j].y += Math.sin(a) * 0.5;
      }
    }
  }

  for (let iter = 0; iter < 90; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        const min = nodeCollisionRadius(a.kind) + nodeCollisionRadius(b.kind) + PAD;
        if (d >= min) continue;
        if (d < 1e-3) {
          dx = j - i;
          dy = (i + j) % 2 === 0 ? 1 : -1;
          d = Math.sqrt(dx * dx + dy * dy);
        }
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        moved = true;
      }
    }
    for (const p of nodes) {
      p.x = clamp(p.x, 60, VIEWBOX_W - 60);
      p.y = clamp(p.y, 60, VIEWBOX_H - 60);
    }
    if (!moved) break;
  }
}

export function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Dedupe ties — treat as undirected: A→B and B→A are the two subjective records
 * of the same relationship (edges are collected per character's outgoing list,
 * see saga page). Key by the sorted endpoints and keep one per tone (highest
 * weight wins) so the hover note doesn't repeat the same person/feeling and the
 * curves don't draw on top of each other.
 * Asymmetric feelings (one side romance, the other wary — different tones) are
 * still each kept as a separate edge.
 */
export function dedupeEdges(edges: RelationshipEdge[]): RelationshipEdge[] {
  const byKey = new Map<string, RelationshipEdge>();
  for (const e of edges) {
    const [a, b] = e.fromId < e.toId ? [e.fromId, e.toId] : [e.toId, e.fromId];
    const k = `${a}::${b}::${e.tone ?? 'none'}`;
    const prev = byKey.get(k);
    if (!prev || (e.weight ?? 0) > (prev.weight ?? 0)) byKey.set(k, e);
  }
  return [...byKey.values()];
}
