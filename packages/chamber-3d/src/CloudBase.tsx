'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Group } from 'three';
import type { RoomDims } from './types.js';

/**
 * Grounds the floating chamber: a stepped 台基 (stone terrace) under the floor
 * and a 雲海 (sea of clouds) below it — so the room reads as a 樓閣 floating on
 * clouds (intentional 仙閣), not an awkward fragment hanging in the void.
 *
 * The clouds are cheap camera-facing sprite puffs (a soft radial-gradient
 * texture) — deliberately NOT drei's volumetric `<Cloud>`, which is GPU-heavy
 * enough to lose the WebGL context here.
 */
function puffTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(248,244,250,0.5)');
  grad.addColorStop(1, 'rgba(248,244,250,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function CloudBase({ dims, tint }: { dims: RoomDims; tint: string }) {
  const w = dims.width;
  const d = dims.depth;
  const tex = useMemo(() => puffTexture(), []);
  const cloudsRef = useRef<Group>(null);

  // deterministic puff layout (a couple of layers of a 雲海)
  const puffs = useMemo(() => {
    const out: { x: number; y: number; z: number; s: number; o: number; tone: string }[] = [];
    const n = 22;
    for (let i = 0; i < n; i++) {
      const ring = i / n;
      const ang = i * 2.39996;
      const rad = (0.4 + ((i * 7) % 10) / 10) * w * 0.9;
      out.push({
        x: Math.cos(ang) * rad,
        y: -1.05 - ((i * 3) % 5) * 0.4,
        z: -d * 0.1 + Math.sin(ang) * rad * 0.8,
        s: (2.4 + ((i * 5) % 7) / 7 * 3) * (w / 8),
        o: 0.7 - ring * 0.28,
        tone: i % 3 === 0 ? '#f0e3ec' : i % 3 === 1 ? '#dfe6f2' : '#efe8e2',
      });
    }
    return out;
  }, [w, d]);

  useFrame((_, dt) => {
    if (cloudsRef.current) cloudsRef.current.rotation.y += dt * 0.012;
  });

  return (
    <group>
      {/* terrace — stepped stone base under the floor */}
      <mesh position={[0, -0.16, -d * 0.1]} receiveShadow>
        <boxGeometry args={[w * 1.12, 0.28, d * 1.12]} />
        <meshStandardMaterial color="#b3ac9e" roughness={0.85} metalness={0.03} />
      </mesh>
      <mesh position={[0, -0.46, -d * 0.1]} receiveShadow>
        <boxGeometry args={[w * 1.32, 0.34, d * 1.32]} />
        <meshStandardMaterial color="#9a9386" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.86, -d * 0.1]}>
        <boxGeometry args={[w * 1.5, 0.5, d * 1.5]} />
        <meshStandardMaterial color={tint} roughness={0.95} />
      </mesh>

      {/* 雲海 — cheap sprite puffs */}
      <group ref={cloudsRef}>
        {puffs.map((p, i) => (
          <sprite key={i} position={[p.x, p.y, p.z]} scale={[p.s, p.s * 0.7, 1]}>
            <spriteMaterial map={tex} color={p.tone} transparent opacity={p.o} depthWrite={false} fog={false} />
          </sprite>
        ))}
      </group>
    </group>
  );
}
