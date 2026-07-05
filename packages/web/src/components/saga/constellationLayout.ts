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

/** True on phone-width viewports, so the plan can switch to a portrait layout. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
}

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
export function relaxOverlaps(
  nodes: PositionedCharacter[],
  w: number = VIEWBOX_W,
  h: number = VIEWBOX_H,
): void {
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
      p.x = clamp(p.x, 60, w - 60);
      p.y = clamp(p.y, 60, h - 60);
    }
    if (!moved) break;
  }
}

/**
 * Relationship layout — position nodes by WHO-IS-TIED-TO-WHOM, not by physical
 * scene. Tied characters attract, everyone repels, a gentle centre pull keeps
 * the graph on canvas. Deterministic (index-seeded, no randomness → SSR-safe),
 * so the graph reads as a relationship web that fills the space instead of the
 * whole cast piling into one opening scene's room.
 */
export function relationshipLayout(
  nodes: PositionedCharacter[],
  edges: ReadonlyArray<{ fromId: string; toId: string; weight?: number }>,
  w: number = VIEWBOX_W,
  h: number = VIEWBOX_H,
): void {
  const n = nodes.length;
  if (n === 0) return;
  const cx = w / 2;
  const cy = h / 2;
  const idx = new Map(nodes.map((p, i) => [p.char.id, i]));

  // seed on an ellipse, evenly spread by index (deterministic)
  const rx = w * 0.34;
  const ry = h * 0.34;
  nodes.forEach((p, i) => {
    const a = (i / n) * Math.PI * 2;
    p.x = cx + Math.cos(a) * rx;
    p.y = cy + Math.sin(a) * ry;
  });

  const links = edges
    .filter((e) => idx.has(e.fromId) && idx.has(e.toId) && e.fromId !== e.toId)
    .map((e) => ({ a: idx.get(e.fromId)!, b: idx.get(e.toId)!, w: clamp((e.weight ?? 1) / 6, 0.25, 1.5) }));

  for (let iter = 0; iter < 320; iter++) {
    const fx = new Array<number>(n).fill(0);
    const fy = new Array<number>(n).fill(0);
    // repulsion (spread everyone)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        let d2 = dx * dx + dy * dy || 1;
        const d = Math.sqrt(d2);
        const rep = 120_000 / d2;
        const ux = dx / d;
        const uy = dy / d;
        fx[i] -= ux * rep; fy[i] -= uy * rep;
        fx[j] += ux * rep; fy[j] += uy * rep;
      }
    }
    // attraction along ties (pull the bonded together, by strength)
    for (const l of links) {
      const dx = nodes[l.b].x - nodes[l.a].x;
      const dy = nodes[l.b].y - nodes[l.a].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 210) * 0.02 * l.w;
      const ux = dx / d;
      const uy = dy / d;
      fx[l.a] += ux * f; fy[l.a] += uy * f;
      fx[l.b] -= ux * f; fy[l.b] -= uy * f;
    }
    // centre pull — outsiders drift to the rim
    for (let i = 0; i < n; i++) {
      const pull = nodes[i].kind === 'wild' ? 0.004 : 0.011;
      fx[i] += (cx - nodes[i].x) * pull;
      fy[i] += (cy - nodes[i].y) * pull;
    }
    for (let i = 0; i < n; i++) {
      nodes[i].x = clamp(nodes[i].x + clamp(fx[i] * 0.85, -42, 42), 96, w - 96);
      nodes[i].y = clamp(nodes[i].y + clamp(fy[i] * 0.85, -42, 42), 96, h - 96);
    }
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
