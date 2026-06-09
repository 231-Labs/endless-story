'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, DoubleSide, SRGBColorSpace } from 'three';
import type { Group } from 'three';

/**
 * The placeable block vocabulary for `SceneDesign`. Each renders at local origin;
 * `SceneRenderer` wraps it in a group carrying pos / yaw / scale. Tasteful
 * procedural East-Asian elements — the pieces GLM composes a scene from.
 */

// ── 月洞門 ────────────────────────────────────────────────────────────
export function MoonGate() {
  const r = 1.4;
  return (
    <group>
      <mesh position={[0, r + 0.25, 0]} castShadow>
        <torusGeometry args={[r, 0.12, 18, 64]} />
        <meshStandardMaterial color="#cdd6cf" roughness={0.5} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[r * 2.4, 0.32, 0.18]} />
        <meshStandardMaterial color="#c9d2cb" roughness={0.8} />
      </mesh>
    </group>
  );
}

// ── 竹 ───────────────────────────────────────────────────────────────
function Stalk({ x, z, h, r }: { x: number; z: number; h: number; r: number }) {
  const segs = Math.max(4, Math.round(h / 0.6));
  const segH = h / segs;
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: segs }).map((_, i) => (
        <mesh key={i} position={[0, i * segH + segH / 2, 0]} castShadow>
          <cylinderGeometry args={[r * (1 - i * 0.04), r * (1 - (i - 1) * 0.04), segH * 0.9, 8]} />
          <meshStandardMaterial color="#739b54" roughness={0.7} />
        </mesh>
      ))}
      {[0.3, 0.9, 1.6, 2.3].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.22, h - 0.2 - i * 0.28, Math.sin(a) * 0.22]} rotation={[0.5, a, 0.6]}>
          <planeGeometry args={[0.5, 0.12]} />
          <meshStandardMaterial color="#6f9a4b" roughness={0.6} side={DoubleSide} transparent opacity={0.95} />
        </mesh>
      ))}
    </group>
  );
}
export function Bamboo() {
  return (
    <group>
      <Stalk x={0} z={0} h={2.6} r={0.05} />
      <Stalk x={0.3} z={-0.2} h={2.1} r={0.045} />
      <Stalk x={-0.25} z={0.15} h={2.4} r={0.04} />
      <Stalk x={0.5} z={0.25} h={1.7} r={0.04} />
    </group>
  );
}

// ── 太湖石 ───────────────────────────────────────────────────────────
export function ScholarRock() {
  const blobs: { p: [number, number, number]; r: number }[] = [
    { p: [0, 0.35, 0], r: 0.5 },
    { p: [0.18, 0.85, 0.06], r: 0.4 },
    { p: [-0.16, 1.2, -0.05], r: 0.34 },
    { p: [0.12, 1.55, 0.04], r: 0.26 },
    { p: [-0.05, 0.6, 0.2], r: 0.3 },
    { p: [0.05, 1.0, -0.18], r: 0.28 },
  ];
  return (
    <group>
      {blobs.map((b, i) => (
        <mesh key={i} position={b.p} castShadow>
          <icosahedronGeometry args={[b.r, 1]} />
          <meshStandardMaterial color="#aaa89e" roughness={0.92} metalness={0.04} flatShading />
        </mesh>
      ))}
    </group>
  );
}

// ── 燈籠 (on a slender stand) ─────────────────────────────────────────
export function Lantern() {
  const H = 2.4;
  return (
    <group>
      <mesh position={[0, H / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.025, H, 8]} />
        <meshStandardMaterial color="#2a1d10" roughness={0.7} />
      </mesh>
      <group position={[0, H, 0]}>
        <mesh scale={[1, 1.25, 1]} castShadow>
          <sphereGeometry args={[0.17, 20, 16]} />
          <meshStandardMaterial color="#b3261d" emissive="#ff5a32" emissiveIntensity={1.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.21, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 0.05, 12]} />
          <meshStandardMaterial color="#caa64a" metalness={0.5} roughness={0.4} />
        </mesh>
        <pointLight color="#ff9a5a" intensity={3} distance={4.5} decay={2} />
      </group>
    </group>
  );
}

// ── 古琴几 ───────────────────────────────────────────────────────────
export function Guqin() {
  return (
    <group>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[1.4, 0.06, 0.42]} />
        <meshStandardMaterial color="#5a4434" roughness={0.7} />
      </mesh>
      {[-0.6, 0.6].map((x) =>
        [-0.16, 0.16].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.14, z]} castShadow>
            <boxGeometry args={[0.06, 0.28, 0.06]} />
            <meshStandardMaterial color="#3b2f24" roughness={0.8} />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.34, 0]} castShadow>
        <boxGeometry args={[1.2, 0.05, 0.24]} />
        <meshStandardMaterial color="#7a5a3a" roughness={0.5} metalness={0.05} />
      </mesh>
    </group>
  );
}

// ── 香爐 + 青煙 ──────────────────────────────────────────────────────
function smokeTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rad.addColorStop(0, 'rgba(230,235,240,0.5)');
  rad.addColorStop(1, 'rgba(230,235,240,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
export function Incense() {
  const ref = useRef<Group>(null);
  const tex = useMemo(() => smokeTexture(), []);
  const N = 7;
  useFrame((_, dt) => {
    const grp = ref.current;
    if (!grp) return;
    for (const child of grp.children) {
      child.position.y += dt * 0.32;
      child.position.x += Math.sin(child.position.y * 3 + child.id) * dt * 0.04;
      if (child.position.y > 1.4) child.position.set(0, 0.2, 0);
    }
  });
  return (
    <group>
      {/* 香爐 */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.1, 0.16, 16]} />
        <meshStandardMaterial color="#7d5a2e" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.04, 16]} />
        <meshStandardMaterial color="#5a3f20" metalness={0.4} roughness={0.6} />
      </mesh>
      {/* 青煙 */}
      <group ref={ref}>
        {Array.from({ length: N }).map((_, i) => (
          <sprite key={i} position={[0, 0.2 + i * 0.17, 0]} scale={[0.22, 0.22, 1]}>
            <spriteMaterial map={tex} color="#cdd8d2" transparent opacity={0.4} depthWrite={false} fog={false} />
          </sprite>
        ))}
      </group>
    </group>
  );
}

// ── 屏風 ─────────────────────────────────────────────────────────────
export function Screen() {
  const panels: [number, number][] = [
    [-0.9, 0.35],
    [0, 0],
    [0.9, 0.35],
  ];
  return (
    <group>
      {panels.map(([x, ry], i) => (
        <mesh key={i} position={[x, 0.9, 0]} rotation={[0, ry, 0]} castShadow>
          <boxGeometry args={[0.86, 1.8, 0.04]} />
          <meshStandardMaterial color="#cdbfa0" roughness={0.85} side={DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

// ── 梅枝 ─────────────────────────────────────────────────────────────
export function PlumBranch() {
  const blossoms = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 12; i++) {
      pts.push([
        Math.sin(i * 1.7) * 0.5,
        0.6 + i * 0.11,
        Math.cos(i * 2.1) * 0.2,
      ]);
    }
    return pts;
  }, []);
  return (
    <group>
      <mesh position={[0, 0.8, 0]} rotation={[0, 0, 0.3]}>
        <cylinderGeometry args={[0.02, 0.04, 1.6, 6]} />
        <meshStandardMaterial color="#3a2a20" roughness={0.9} />
      </mesh>
      {blossoms.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#f3c4d2" emissive="#caa" emissiveIntensity={0.1} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
