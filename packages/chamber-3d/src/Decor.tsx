'use client';

import type { RoomDims } from './types.js';

/** A single bamboo stalk — tapered green segments + a few leaves near the top. */
function BambooStalk({ x, z, h, r }: { x: number; z: number; h: number; r: number }) {
  const segs = Math.max(4, Math.round(h / 0.6));
  const segH = h / segs;
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: segs }).map((_, i) => (
        <group key={i} position={[0, i * segH + segH / 2, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[r * (1 - i * 0.04), r * (1 - (i - 1) * 0.04), segH * 0.9, 8]} />
            <meshStandardMaterial color="#739b54" roughness={0.7} />
          </mesh>
          <mesh position={[0, segH * 0.45, 0]}>
            <cylinderGeometry args={[r * 1.12, r * 1.12, 0.03, 8]} />
            <meshStandardMaterial color="#5c7e40" roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* leaves */}
      {[0.3, 0.9, 1.6, 2.3].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.22, h - 0.2 - i * 0.28, Math.sin(a) * 0.22]} rotation={[0.5, a, 0.6]}>
          <planeGeometry args={[0.5, 0.12]} />
          <meshStandardMaterial color="#6f9a4b" roughness={0.6} side={2} transparent opacity={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** 太湖石 — a lumpy vertical scholar's rock from clustered facets. */
function ScholarRock({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const blobs: { p: [number, number, number]; r: number }[] = [
    { p: [0, 0.35, 0], r: 0.5 },
    { p: [0.18, 0.85, 0.06], r: 0.4 },
    { p: [-0.16, 1.2, -0.05], r: 0.34 },
    { p: [0.12, 1.55, 0.04], r: 0.26 },
    { p: [-0.05, 0.6, 0.2], r: 0.3 },
    { p: [0.05, 1.0, -0.18], r: 0.28 },
  ];
  return (
    <group position={position} scale={scale}>
      {blobs.map((b, i) => (
        <mesh key={i} position={b.p} castShadow>
          <icosahedronGeometry args={[b.r, 1]} />
          <meshStandardMaterial color="#aaa89e" roughness={0.92} metalness={0.04} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** A low 几 with a 古琴/guzheng on top. */
function GuqinTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
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
      {/* the 琴 */}
      <mesh position={[0, 0.34, 0]} castShadow>
        <boxGeometry args={[1.2, 0.05, 0.24]} />
        <meshStandardMaterial color="#7a5a3a" roughness={0.5} metalness={0.05} />
      </mesh>
    </group>
  );
}

export function Decor({ dims }: { dims: RoomDims }) {
  const w = dims.width;
  const d = dims.depth;
  return (
    <group>
      {/* bamboo cluster, right */}
      <group position={[w * 0.42, 0, -d * 0.3]}>
        <BambooStalk x={0} z={0} h={dims.height * 1.15} r={0.05} />
        <BambooStalk x={0.3} z={-0.2} h={dims.height * 0.95} r={0.045} />
        <BambooStalk x={-0.25} z={0.15} h={dims.height * 1.05} r={0.04} />
        <BambooStalk x={0.5} z={0.25} h={dims.height * 0.8} r={0.04} />
      </group>
      {/* 太湖石, left */}
      <ScholarRock position={[-w * 0.4, 0, -d * 0.2]} scale={1.1} />
      {/* 古琴几, left-centre */}
      <GuqinTable position={[-w * 0.16, 0, d * 0.05]} />
    </group>
  );
}
