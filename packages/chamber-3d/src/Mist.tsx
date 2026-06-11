'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Group } from 'three';
import type { RoomDims } from './types.js';

/**
 * 雲氣 — low mist wisps drifting slowly over the water. The poetry layer: it
 * keeps the stage feeling 虛無 (most of the scene is emptiness + breath) and
 * softens every hard edge. Cheap camera-facing sprites, deterministic layout.
 */
function puffTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function DriftingMist({
  dims,
  tone = '#f2f5f1',
  opacity = 0.16,
}: {
  dims: RoomDims;
  tone?: string;
  opacity?: number;
}) {
  const ref = useRef<Group>(null);
  const tex = useMemo(() => puffTexture(), []);
  const W = dims.width * 0.95;

  const puffs = useMemo(() => {
    const out: { x: number; y: number; z: number; s: number; o: number; v: number }[] = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      out.push({
        x: ((i * 73) % 19) / 19 * W * 2 - W,
        y: 0.12 + ((i * 37) % 11) / 11 * 0.8,
        z: -dims.depth * 0.65 + ((i * 53) % 13) / 13 * dims.depth * 1.1,
        s: (1.6 + ((i * 29) % 7) / 7 * 2.6) * (dims.width / 8),
        o: opacity * (0.5 + ((i * 17) % 5) / 5 * 0.5),
        v: 0.04 + ((i * 11) % 6) / 6 * 0.07,
      });
    }
    return out;
  }, [W, dims.depth, dims.width, opacity]);

  useFrame((_, dt) => {
    const grp = ref.current;
    if (!grp) return;
    grp.children.forEach((child, i) => {
      const p = puffs[i];
      if (!p) return;
      child.position.x += p.v * dt;
      if (child.position.x > W) child.position.x = -W;
    });
  });

  return (
    <group ref={ref}>
      {puffs.map((p, i) => (
        <sprite key={i} position={[p.x, p.y, p.z]} scale={[p.s, p.s * 0.45, 1]}>
          <spriteMaterial map={tex} color={tone} transparent opacity={p.o} depthWrite={false} fog={false} />
        </sprite>
      ))}
    </group>
  );
}
