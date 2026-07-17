'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import type { Group, Points } from 'three';
import { TableChairs } from './SceneElements.js';
import { BrokenBridgeProp, CostumeRack, PaperUmbrella, PropTrunks } from './StageProps.js';
import type { PlatformSpec } from './scene-design.js';
import type { RoomDims } from './types.js';

/**
 * 藏閣外景 — the fairyland shell around the exhibit ring (春雪社氣質).
 * Hand-built procedural assets, not primitive blobs: plum trees with a real
 * branch skeleton and instanced five-petal blossoms, a plastered moon-gate
 * wall with tile coping and a 「聽雪」 plaque, curving cloud walls, a
 * swoop-roofed pavilion, weathered stone lanterns, craggy scholar rocks,
 * bamboo with painted leaves — and the troupe's namesake: plum petals
 * falling like spring snow. Everything sits OUTSIDE radius ~6.5 so it frames
 * the collection without competing with it. Pure ambience — never
 * selectable, never part of the saved layout.
 */

function rnd(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── painted textures (canvas — keeps the ink-wash hand feel) ─────────

const texCache = new Map<string, CanvasTexture>();

function cachedTexture(key: string, paint: (c: HTMLCanvasElement) => void): CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  paint(c);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** 白粉牆 — plaster with damp mottling rising from the foot of the wall. */
function plasterTexture(): CanvasTexture {
  return cachedTexture('plaster', (c) => {
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#efe9dc';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 420; i++) {
      const x = rnd(i, 1) * 256;
      const y = rnd(i, 2) * 256;
      const r = rnd(i, 3) * 14 + 2;
      const dampness = y / 256; // wetter toward the bottom
      g.globalAlpha = 0.025 + rnd(i, 4) * 0.05 + dampness * 0.03;
      g.fillStyle = i % 3 === 0 ? '#c9beA6' : i % 3 === 1 ? '#d8d2c2' : '#b7ad9a';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  });
}

/** 五瓣梅花 — one blossom, petals + gold stamens, alpha background. */
function blossomTexture(): CanvasTexture {
  return cachedTexture('blossom', (c) => {
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 64, 64);
    const cx = 32;
    const cy = 32;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * 13;
      const py = cy + Math.sin(a) * 13;
      const grad = g.createRadialGradient(px, py, 1, px, py, 13);
      grad.addColorStop(0, 'rgba(252,240,244,0.98)');
      grad.addColorStop(0.75, 'rgba(244,214,224,0.95)');
      grad.addColorStop(1, 'rgba(230,182,198,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(px, py, 13, 0, Math.PI * 2);
      g.fill();
    }
    // heart + stamens
    g.fillStyle = 'rgba(214,148,168,0.9)';
    g.beginPath();
    g.arc(cx, cy, 4.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(206,168,84,0.95)';
    g.lineWidth = 1.2;
    for (let s = 0; s < 7; s++) {
      const a = (s / 7) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7);
      g.stroke();
      g.fillStyle = 'rgba(222,186,96,0.95)';
      g.beginPath();
      g.arc(cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 7.5, 1.3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** 落瓣 — a single soft petal for the falling-snow particles. */
function petalTexture(): CanvasTexture {
  return cachedTexture('petal', (c) => {
    c.width = 32;
    c.height = 32;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 32, 32);
    g.translate(16, 16);
    g.rotate(0.6);
    const grad = g.createRadialGradient(0, -2, 1, 0, 0, 11);
    grad.addColorStop(0, 'rgba(252,238,243,0.95)');
    grad.addColorStop(0.7, 'rgba(243,206,219,0.85)');
    grad.addColorStop(1, 'rgba(238,196,212,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(0, 0, 6.5, 10, 0, 0, Math.PI * 2);
    g.fill();
  });
}

/** 竹葉 — a spray of painted leaves on alpha, used as crossed planes. */
function bambooLeafTexture(): CanvasTexture {
  return cachedTexture('bambooLeaf', (c) => {
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 128, 128);
    const leaf = (x: number, y: number, angle: number, len: number, tone: string) => {
      g.save();
      g.translate(x, y);
      g.rotate(angle);
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, tone);
      grad.addColorStop(1, 'rgba(74,110,58,0.15)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.45, -len * 0.13, len, 0);
      g.quadraticCurveTo(len * 0.45, len * 0.13, 0, 0);
      g.closePath();
      g.fill();
      g.restore();
    };
    for (let i = 0; i < 9; i++) {
      leaf(
        24 + rnd(i, 1) * 46,
        18 + rnd(i, 2) * 60,
        0.5 + rnd(i, 3) * 1.6,
        34 + rnd(i, 4) * 30,
        i % 2 ? 'rgba(92,128,72,0.95)' : 'rgba(74,108,58,0.95)',
      );
    }
  });
}

/** contact-shadow blob — grounds every asset on the mirror floor. */
function shadowTexture(): CanvasTexture {
  return cachedTexture('shadow', (c) => {
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

/** 匾額 — small stone plaque reading 「聽雪」 (the troupe listens for snow). */
function plaqueTexture(): CanvasTexture {
  return cachedTexture('plaque', (c) => {
    c.width = 256;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2e3238';
    g.fillRect(0, 0, 256, 96);
    g.strokeStyle = 'rgba(202,166,74,0.85)';
    g.lineWidth = 3;
    g.strokeRect(7, 7, 242, 82);
    g.fillStyle = '#e8e2d2';
    g.font = '500 56px "Songti SC", "Noto Serif CJK TC", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('聽 雪', 128, 52);
  });
}

function ContactShadow({ radius, opacity = 0.3 }: { radius: number; opacity?: number }) {
  const tex = useMemo(() => shadowTexture(), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

// ── 梅樹 — real branch skeleton + instanced five-petal blossoms ──────

interface BranchSpec {
  curve: CatmullRomCurve3;
  r0: number;
  r1: number;
}

/** grow a branch as a jittered arc from `from` toward `dir`, upward-biased. */
function growBranch(
  from: Vector3,
  dir: Vector3,
  len: number,
  seed: number,
  upBias: number,
): CatmullRomCurve3 {
  const pts: Vector3[] = [from.clone()];
  const step = dir.clone().normalize().multiplyScalar(len / 4);
  const p = from.clone();
  for (let i = 1; i <= 4; i++) {
    p.add(step);
    p.y += upBias * (i / 4) * len * 0.22;
    pts.push(
      new Vector3(
        p.x + (rnd(seed, i * 3 + 1) - 0.5) * len * 0.14,
        p.y + (rnd(seed, i * 3 + 2) - 0.5) * len * 0.1,
        p.z + (rnd(seed, i * 3 + 3) - 0.5) * len * 0.14,
      ),
    );
  }
  return new CatmullRomCurve3(pts);
}

function buildPlum(seed: number): {
  branches: BranchSpec[];
  blossoms: { p: Vector3; s: number }[];
  buds: Vector3[];
} {
  const branches: BranchSpec[] = [];
  const blossoms: { p: Vector3; s: number }[] = [];
  const buds: Vector3[] = [];

  // trunk — leans like an old tree bowing over water
  const lean = 0.5 + rnd(seed, 1) * 0.4;
  const trunkDir = new Vector3(Math.sin(lean), 1.35, rnd(seed, 2) * 0.4 - 0.2);
  const trunk = growBranch(new Vector3(0, 0, 0), trunkDir, 2.5 + rnd(seed, 3), seed, 0.12);
  branches.push({ curve: trunk, r0: 0.13, r1: 0.07 });

  // primaries off the trunk, then secondaries, then flowering twigs
  const nPrim = 3;
  for (let i = 0; i < nPrim; i++) {
    const t = 0.45 + (i / nPrim) * 0.5;
    const start = trunk.getPoint(t);
    const a = rnd(seed, 11 + i) * Math.PI * 2;
    const dir = new Vector3(Math.cos(a), 0.55 + rnd(seed, 13 + i) * 0.5, Math.sin(a));
    const len = 1.3 + rnd(seed, 17 + i) * 0.9;
    const prim = growBranch(start, dir, len, seed * 3 + i, 0.3);
    branches.push({ curve: prim, r0: 0.055, r1: 0.028 });

    const nSec = 2 + (i % 2);
    for (let j = 0; j < nSec; j++) {
      const t2 = 0.35 + (j / nSec) * 0.55;
      const s2 = prim.getPoint(t2);
      const a2 = a + (rnd(seed, 23 + i * 5 + j) - 0.5) * 2.4;
      const dir2 = new Vector3(Math.cos(a2), 0.4 + rnd(seed, 29 + i * 5 + j) * 0.6, Math.sin(a2));
      const len2 = 0.65 + rnd(seed, 31 + i * 5 + j) * 0.55;
      const sec = growBranch(s2, dir2, len2, seed * 7 + i * 5 + j, 0.42);
      branches.push({ curve: sec, r0: 0.024, r1: 0.011 });

      // blossoms cling to the outer 2/3 of every flowering twig
      const nFl = 14 + Math.floor(rnd(seed, 37 + i * 5 + j) * 9);
      for (let k = 0; k < nFl; k++) {
        const tf = 0.3 + (k / nFl) * 0.7;
        const base = sec.getPoint(tf);
        const off = 0.05 + rnd(seed, 41 + k) * 0.16;
        blossoms.push({
          p: new Vector3(
            base.x + (rnd(seed, 43 + i * 31 + j * 7 + k) - 0.5) * off * 2,
            base.y + (rnd(seed, 47 + i * 31 + j * 7 + k) - 0.5) * off * 2,
            base.z + (rnd(seed, 53 + i * 31 + j * 7 + k) - 0.5) * off * 2,
          ),
          s: 0.65 + rnd(seed, 59 + k) * 0.75,
        });
        if (k % 3 === 0) {
          buds.push(
            new Vector3(
              base.x + (rnd(seed, 61 + k) - 0.5) * 0.1,
              base.y + (rnd(seed, 67 + k) - 0.5) * 0.1,
              base.z + (rnd(seed, 71 + k) - 0.5) * 0.1,
            ),
          );
        }
      }
    }
  }
  return { branches, blossoms, buds };
}

function InstancedBlossoms({
  blossoms,
  night,
}: {
  blossoms: { p: Vector3; s: number }[];
  night: boolean;
}) {
  const mesh = useMemo(() => {
    const geo = new PlaneGeometry(0.16, 0.16);
    const mat = new MeshStandardMaterial({
      map: blossomTexture(),
      transparent: true,
      alphaTest: 0.25,
      side: DoubleSide,
      roughness: 0.9,
      emissive: night ? '#8d6a78' : '#5a3c48',
      emissiveIntensity: night ? 0.32 : 0.14,
      depthWrite: false,
    });
    const im = new InstancedMesh(geo, mat, blossoms.length);
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const s = new Vector3();
    blossoms.forEach((b, i) => {
      e.set(rnd(i, 101) * Math.PI, rnd(i, 103) * Math.PI * 2, rnd(i, 107) * Math.PI);
      q.setFromEuler(e);
      s.setScalar(b.s);
      m.compose(b.p, q, s);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [blossoms, night]);
  return <primitive object={mesh} />;
}

function InstancedBuds({ buds }: { buds: Vector3[] }) {
  const mesh = useMemo(() => {
    const geo = new SphereGeometry(0.02, 6, 6);
    const mat = new MeshStandardMaterial({ color: '#a63a4e', roughness: 0.7 });
    const im = new InstancedMesh(geo, mat, buds.length);
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    buds.forEach((p, i) => {
      s.setScalar(0.75 + rnd(i, 109) * 0.5);
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [buds]);
  return <primitive object={mesh} />;
}

function PlumTree({ seed = 1, night }: { seed?: number; night: boolean }) {
  const { branches, blossoms, buds } = useMemo(() => buildPlum(seed), [seed]);
  return (
    <group>
      {branches.map((b, i) => (
        <mesh key={i} castShadow>
          {/* tapered read: thin tube; the r0→r1 taper is faked by two radii segments */}
          <tubeGeometry args={[b.curve, 16, (b.r0 + b.r1) / 2, 7, false]} />
          <meshStandardMaterial color="#39281f" roughness={0.95} />
        </mesh>
      ))}
      {/* root flare */}
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.16, 0.24, 0.18, 9]} />
        <meshStandardMaterial color="#33241c" roughness={0.95} />
      </mesh>
      <InstancedBlossoms blossoms={blossoms} night={night} />
      <InstancedBuds buds={buds} />
      <ContactShadow radius={1.7} opacity={night ? 0.34 : 0.24} />
    </group>
  );
}

// ── 月洞門 — a real plastered wall with a circular opening ───────────

const WALL_W = 7.2;
const WALL_H = 3.7;
const WALL_D = 0.36;
const GATE_R = 1.62;
const GATE_CY = 1.78;

function MoonGateWall({ night }: { night: boolean }) {
  const plaster = useMemo(() => {
    const t = plasterTexture();
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(2.4, 1.3);
    return t;
  }, []);
  const plaque = useMemo(() => plaqueTexture(), []);
  const wallShape = useMemo(() => {
    const s = new Shape();
    s.moveTo(-WALL_W / 2, 0);
    s.lineTo(WALL_W / 2, 0);
    s.lineTo(WALL_W / 2, WALL_H);
    s.lineTo(-WALL_W / 2, WALL_H);
    s.closePath();
    const hole = new Path();
    hole.absarc(0, GATE_CY, GATE_R, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return s;
  }, []);

  return (
    <group>
      <mesh position={[0, 0, -WALL_D / 2]} castShadow receiveShadow>
        <extrudeGeometry args={[wallShape, { depth: WALL_D, bevelEnabled: false }]} />
        <meshStandardMaterial map={plaster} color="#f0eadd" roughness={0.92} />
      </mesh>

      {/* grey-tile ring facing both sides of the opening (磨磚門圈) */}
      {[-WALL_D / 2 - 0.012, WALL_D / 2 + 0.012].map((z, i) => (
        <mesh key={i} position={[0, GATE_CY, z]}>
          <torusGeometry args={[GATE_R + 0.02, 0.07, 10, 56]} />
          <meshStandardMaterial color="#4b5054" roughness={0.72} metalness={0.08} />
        </mesh>
      ))}

      {/* 瓦簷 coping: overhanging cap + rounded tile ridge */}
      <mesh position={[0, WALL_H + 0.09, 0]} castShadow>
        <boxGeometry args={[WALL_W + 0.5, 0.18, WALL_D + 0.42]} />
        <meshStandardMaterial color="#3c4146" roughness={0.7} />
      </mesh>
      <mesh position={[0, WALL_H + 0.22, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, WALL_W + 0.56, 12]} />
        <meshStandardMaterial color="#33383d" roughness={0.68} />
      </mesh>
      {/* tile-end dots along the eave (瓦當) */}
      {Array.from({ length: 13 }).map((_, i) => {
        const x = -WALL_W / 2 + 0.3 + (i * (WALL_W - 0.6)) / 12;
        return (
          <mesh key={i} position={[x, WALL_H + 0.02, WALL_D / 2 + 0.19]}>
            <cylinderGeometry args={[0.05, 0.05, 0.035, 10]} />
            <meshStandardMaterial color="#565c61" roughness={0.65} />
          </mesh>
        );
      })}

      {/* stone base course */}
      <mesh position={[0, 0.14, 0]} receiveShadow>
        <boxGeometry args={[WALL_W + 0.24, 0.28, WALL_D + 0.2]} />
        <meshStandardMaterial color="#8b877c" roughness={0.95} />
      </mesh>
      {/* threshold slab through the opening */}
      <mesh position={[0, 0.035, 0]}>
        <boxGeometry args={[GATE_R * 2 + 0.5, 0.07, WALL_D + 0.7]} />
        <meshStandardMaterial color="#7f7c72" roughness={0.9} />
      </mesh>

      {/* 「聽雪」 plaque above the circle */}
      <mesh position={[0, WALL_H - 0.32, WALL_D / 2 + 0.01]}>
        <planeGeometry args={[1.06, 0.4]} />
        <meshBasicMaterial map={plaque} toneMapped={false} />
      </mesh>

      {/* moonlight / daylight wash through and onto the wall */}
      {night ? (
        <pointLight position={[0, 4.4, 2.4]} color="#a9c3ea" intensity={2.6} distance={10} decay={2} />
      ) : null}
    </group>
  );
}

/** 雲牆 — low curved white walls sweeping back from the gate. */
function CloudWall({ thetaStart, thetaLength }: { thetaStart: number; thetaLength: number }) {
  const plaster = useMemo(() => {
    const t = plasterTexture();
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(3, 1);
    return t;
  }, []);
  const R = 9.3;
  const H = 2.3;
  // tile coping follows the arc — a few short cylinders chained along it
  const copes = useMemo(() => {
    const segs = 7;
    return Array.from({ length: segs }, (_, i) => {
      const a = thetaStart + ((i + 0.5) / segs) * thetaLength;
      return {
        pos: [Math.sin(a) * R, H + 0.06, Math.cos(a) * R] as [number, number, number],
        rotY: a + Math.PI / 2,
        len: (thetaLength * R) / segs + 0.09,
      };
    });
  }, [thetaStart, thetaLength]);
  return (
    <group>
      <mesh position={[0, H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R, R, H, 32, 1, true, thetaStart, thetaLength]} />
        <meshStandardMaterial map={plaster} color="#efe9dc" roughness={0.92} side={DoubleSide} />
      </mesh>
      {copes.map((cp, i) => (
        <mesh key={i} position={cp.pos} rotation={[Math.PI / 2, 0, cp.rotY]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, cp.len, 10]} />
          <meshStandardMaterial color="#3c4146" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// ── 涼亭 — hexagonal pavilion with a swooping lathe roof ─────────────

function Pavilion({ lit }: { lit: boolean }) {
  const R = 1.05;
  const cols = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        return [Math.cos(a) * R, Math.sin(a) * R] as [number, number];
      }),
    [],
  );
  // swooping roof profile: apex → concave sweep → kicked eave
  const roofProfile = useMemo(() => {
    const pts: Vector2[] = [];
    const STEPS = 10;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const x = t * (R + 0.85);
      const y = 1.02 * (1 - t) * (1 - t) + 0.14 * Math.sin(t * Math.PI) + (t > 0.85 ? (t - 0.85) * 0.5 : 0);
      pts.push(new Vector2(x, y));
    }
    // lathe profile must run bottom→top: reverse so eave (low) comes first
    return pts.reverse();
  }, []);
  const hipRidges = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6 + Math.PI / 6;
        const tip = new Vector3(Math.cos(a) * (R + 0.85), 0.18, Math.sin(a) * (R + 0.85));
        return new CatmullRomCurve3([
          new Vector3(0, 1.04, 0),
          new Vector3(Math.cos(a) * (R + 0.85) * 0.55, 0.52, Math.sin(a) * (R + 0.85) * 0.55),
          tip,
        ]);
      }),
    [],
  );
  const rails = useMemo(
    () =>
      // balustrade on 4 of 6 bays — front two stay open
      [1, 2, 3, 4].map((i) => {
        const a1 = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const a2 = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
        const mx = (Math.cos(a1) + Math.cos(a2)) * 0.5 * R;
        const mz = (Math.sin(a1) + Math.sin(a2)) * 0.5 * R;
        return { mx, mz, rot: -Math.atan2(mz, mx) + Math.PI / 2, len: R };
      }),
    [],
  );
  return (
    <group>
      {/* two-step stone base */}
      <mesh position={[0, 0.07, 0]} receiveShadow>
        <cylinderGeometry args={[R + 0.6, R + 0.68, 0.14, 6]} />
        <meshStandardMaterial color="#8b877b" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0, 0.19, 0]} receiveShadow>
        <cylinderGeometry args={[R + 0.42, R + 0.48, 0.12, 6]} />
        <meshStandardMaterial color="#96917f" roughness={0.95} flatShading />
      </mesh>
      {/* columns with stone drums */}
      {cols.map(([x, z], i) => (
        <group key={i} position={[x, 0.25, z]}>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.085, 0.1, 0.1, 10]} />
            <meshStandardMaterial color="#7f7b70" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.04, 0]} castShadow>
            <cylinderGeometry args={[0.048, 0.058, 1.9, 10]} />
            <meshStandardMaterial color="#7c3125" roughness={0.5} />
          </mesh>
        </group>
      ))}
      {/* ring beam + 掛落 fretwork hint (thin dark band under the beam) */}
      <mesh position={[0, 2.2, 0]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[R + 0.1, R + 0.1, 0.1, 6, 1, true]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.7} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 2.08, 0]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[R + 0.06, R + 0.06, 0.14, 6, 1, true]} />
        <meshStandardMaterial color="#5a2620" roughness={0.65} side={DoubleSide} transparent opacity={0.75} />
      </mesh>
      {/* balustrade */}
      {rails.map((r, i) => (
        <group key={i} position={[r.mx, 0.25, r.mz]} rotation={[0, r.rot, 0]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[r.len, 0.05, 0.05]} />
            <meshStandardMaterial color="#7c3125" roughness={0.55} />
          </mesh>
          {[-0.3, 0, 0.3].map((x) => (
            <mesh key={x} position={[x, 0.21, 0]}>
              <boxGeometry args={[0.035, 0.4, 0.035]} />
              <meshStandardMaterial color="#7c3125" roughness={0.55} />
            </mesh>
          ))}
        </group>
      ))}
      {/* swooping hex roof (lathe, 6 radial segments = hip roof) */}
      <group position={[0, 2.28, 0]}>
        <mesh rotation={[0, Math.PI / 6 + Math.PI / 6, 0]} castShadow>
          <latheGeometry args={[roofProfile, 6]} />
          <meshStandardMaterial color="#2e3439" roughness={0.62} flatShading side={DoubleSide} />
        </mesh>
        {hipRidges.map((c, i) => (
          <mesh key={i} castShadow>
            <tubeGeometry args={[c, 12, 0.045, 6, false]} />
            <meshStandardMaterial color="#23282c" roughness={0.6} />
          </mesh>
        ))}
        {/* gold finial */}
        <mesh position={[0, 1.12, 0]}>
          <cylinderGeometry args={[0.035, 0.06, 0.18, 8]} />
          <meshStandardMaterial color="#caa64a" metalness={0.55} roughness={0.35} />
        </mesh>
        <mesh position={[0, 1.26, 0]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshStandardMaterial color="#caa64a" metalness={0.55} roughness={0.35} emissive="#7a5a1e" emissiveIntensity={0.3} />
        </mesh>
      </group>
      {/* stone table + a red lantern under the eave */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.28, 0.44, 10]} />
        <meshStandardMaterial color="#8f8b80" roughness={0.9} />
      </mesh>
      <group position={[0, 1.98, 0]}>
        <mesh scale={[1, 1.22, 1]}>
          <sphereGeometry args={[0.09, 14, 12]} />
          <meshStandardMaterial
            color="#a8281e"
            emissive={lit ? '#ff5a32' : '#38100a'}
            emissiveIntensity={lit ? 1.5 : 0.25}
            roughness={0.5}
          />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.04, 0.05, 0.03, 10]} />
          <meshStandardMaterial color="#caa64a" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>
      {lit ? <pointLight position={[0, 1.85, 0]} color="#ff9a5a" intensity={2.2} distance={5} decay={2} /> : null}
      <ContactShadow radius={2.1} opacity={0.3} />
    </group>
  );
}

// ── 石燈籠 — weathered stone lantern with glowing windows ────────────

function StoneLantern({ lit }: { lit: boolean }) {
  return (
    <group>
      {/* stacked hex base */}
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.21, 0.25, 0.12, 6]} />
        <meshStandardMaterial color="#7e7b6f" roughness={0.96} flatShading />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 0.08, 6]} />
        <meshStandardMaterial color="#8a8779" roughness={0.96} flatShading />
      </mesh>
      {/* shaft with a waist ring */}
      <mesh position={[0, 0.52, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.07, 0.68, 8]} />
        <meshStandardMaterial color="#8e8b7d" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <torusGeometry args={[0.066, 0.014, 8, 14]} />
        <meshStandardMaterial color="#7a776b" roughness={0.95} />
      </mesh>
      {/* fire box with four window cuts */}
      <mesh position={[0, 0.98, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.11, 0.24, 4, 1]} />
        <meshStandardMaterial color="#94907f" roughness={0.9} flatShading />
      </mesh>
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a, i) => (
        <mesh key={i} position={[Math.sin(a + Math.PI / 4) * 0.093, 0.98, Math.cos(a + Math.PI / 4) * 0.093]} rotation={[0, a + Math.PI / 4, 0]}>
          <planeGeometry args={[0.085, 0.13]} />
          <meshStandardMaterial
            color={lit ? '#ffd9a0' : '#2c2a24'}
            emissive={lit ? '#ffb35c' : '#000000'}
            emissiveIntensity={lit ? 1.6 : 0}
            side={DoubleSide}
          />
        </mesh>
      ))}
      {/* wide curved cap + jewel */}
      <mesh position={[0, 1.18, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.26, 0.14, 6, 1]} />
        <meshStandardMaterial color="#807d70" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#8a8779" roughness={0.9} />
      </mesh>
      {lit ? <pointLight position={[0, 0.98, 0]} color="#ffb666" intensity={1.5} distance={3.2} decay={2} /> : null}
      <ContactShadow radius={0.5} opacity={0.28} />
    </group>
  );
}

// ── 太湖石 — craggy displaced rock, not stacked spheres ──────────────

function ScholarRock({ seed = 1 }: { seed?: number }) {
  const geo = useMemo(() => {
    const g = new IcosahedronGeometry(0.85, 3);
    const pos = g.attributes.position;
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n =
        Math.sin(v.x * 5.1 + seed) * 0.5 +
        Math.sin(v.y * 3.7 + seed * 2.3) * 0.6 +
        Math.sin(v.z * 6.3 + seed * 4.1) * 0.5 +
        Math.sin((v.x + v.y + v.z) * 8.2 + seed) * 0.25;
      const d = 1 + n * 0.16;
      pos.setXYZ(i, v.x * d, v.y * d, v.z * d);
    }
    g.computeVertexNormals();
    return g;
  }, [seed]);
  return (
    <group>
      <mesh position={[0, 0.85, 0]} scale={[0.62, 1.15, 0.5]} castShadow geometry={geo}>
        <meshStandardMaterial color="#88867c" roughness={0.98} flatShading />
      </mesh>
      {/* stone footing */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.5, 0.58, 0.1, 8]} />
        <meshStandardMaterial color="#75726a" roughness={0.95} flatShading />
      </mesh>
      <ContactShadow radius={0.8} opacity={0.3} />
    </group>
  );
}

// ── 竹 — jointed stalks with painted leaf sprays ─────────────────────

function BambooStalk({ x, z, h, lean, seed }: { x: number; z: number; h: number; lean: number; seed: number }) {
  const leafTex = useMemo(() => bambooLeafTexture(), []);
  const segs = Math.max(4, Math.round(h / 0.55));
  const segH = h / segs;
  return (
    <group position={[x, 0, z]} rotation={[lean * 0.6, 0, lean]}>
      {Array.from({ length: segs }).map((_, i) => (
        <group key={i} position={[0, i * segH + segH / 2, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.028 * (1 - i * 0.05), 0.031 * (1 - (i - 1) * 0.05), segH * 0.94, 7]} />
            <meshStandardMaterial color={i % 2 ? '#7d9a58' : '#74924f'} roughness={0.75} />
          </mesh>
          {/* joint ring */}
          <mesh position={[0, segH / 2 - 0.01, 0]}>
            <torusGeometry args={[0.031, 0.006, 6, 10]} />
            <meshStandardMaterial color="#5e7842" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* leaf sprays near the top, crossed planes */}
      {[0, 1, 2].map((k) => {
        const a = rnd(seed, k * 3) * Math.PI * 2;
        const y = h - 0.25 - k * 0.4;
        return (
          <group key={k} position={[Math.cos(a) * 0.1, y, Math.sin(a) * 0.1]} rotation={[0.3 + rnd(seed, k) * 0.5, a, 0.3]}>
            <mesh>
              <planeGeometry args={[0.85, 0.85]} />
              <meshStandardMaterial map={leafTex} transparent alphaTest={0.2} side={DoubleSide} roughness={0.85} depthWrite={false} />
            </mesh>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[0.85, 0.85]} />
              <meshStandardMaterial map={leafTex} transparent alphaTest={0.2} side={DoubleSide} roughness={0.85} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function BambooGrove({ seed = 1 }: { seed?: number }) {
  const stalks = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        x: (rnd(seed, i * 2) - 0.5) * 0.9,
        z: (rnd(seed, i * 2 + 1) - 0.5) * 0.9,
        h: 2.3 + rnd(seed, i * 3) * 1.2,
        lean: (rnd(seed, i * 5) - 0.5) * 0.16,
      })),
    [seed],
  );
  return (
    <group>
      {stalks.map((s, i) => (
        <BambooStalk key={i} {...s} seed={seed * 7 + i} />
      ))}
      <ContactShadow radius={0.85} opacity={0.24} />
    </group>
  );
}

// ── 石拱橋 — the Jiangnan arch bridge; its half-circle plus the mirror
//    reflection closes into a full moon on the water ──────────────────

const BR_HALF = 1.6; // half span (bridge runs along local z)
const BR_RISE = 0.52;
const BR_W = 1.15;

function StoneBridge() {
  const deck = useMemo(() => {
    const N = 9;
    return Array.from({ length: N }, (_, i) => {
      const t0 = i / N;
      const t1 = (i + 1) / N;
      const z0 = -BR_HALF + t0 * BR_HALF * 2;
      const z1 = -BR_HALF + t1 * BR_HALF * 2;
      const y0 = Math.sin(t0 * Math.PI) * BR_RISE;
      const y1 = Math.sin(t1 * Math.PI) * BR_RISE;
      return {
        z: (z0 + z1) / 2,
        y: (y0 + y1) / 2 + 0.07,
        len: Math.hypot(z1 - z0, y1 - y0) + 0.015,
        rotX: Math.atan2(y1 - y0, z1 - z0),
      };
    });
  }, []);
  const posts = useMemo(
    () =>
      [0, 0.25, 0.5, 0.75, 1].map((t) => ({
        z: -BR_HALF + t * BR_HALF * 2,
        y: Math.sin(t * Math.PI) * BR_RISE + 0.07,
      })),
    [],
  );
  return (
    <group>
      {/* deck slabs following the arc */}
      {deck.map((d, i) => (
        <mesh key={i} position={[0, d.y, d.z]} rotation={[d.rotX, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[BR_W, 0.09, d.len]} />
          <meshStandardMaterial color={i % 2 ? '#8e8b80' : '#86837a'} roughness={0.95} />
        </mesh>
      ))}
      {/* balustrades */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (BR_W / 2 - 0.05), 0, 0]}>
          {posts.map((p, i) => (
            <group key={i} position={[0, p.y, p.z]}>
              <mesh position={[0, 0.19, 0]} castShadow>
                <boxGeometry args={[0.07, 0.34, 0.07]} />
                <meshStandardMaterial color="#8a877c" roughness={0.95} />
              </mesh>
              <mesh position={[0, 0.4, 0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshStandardMaterial color="#93907f" roughness={0.9} />
              </mesh>
            </group>
          ))}
          {deck.map((d, i) => (
            <mesh key={`r${i}`} position={[0, d.y + 0.31, d.z]} rotation={[d.rotX, 0, 0]}>
              <boxGeometry args={[0.055, 0.06, d.len]} />
              <meshStandardMaterial color="#908d82" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      {/* solid spandrel walls — the stone faces between deck and water; they
          hide the far balustrade and give the bridge its mass */}
      {[-1, 1].map((side) =>
        deck.map((d, i) => (
          <mesh key={`${side}:${i}`} position={[side * (BR_W / 2 - 0.03), (d.y + 0.02) / 2, d.z]}>
            <boxGeometry args={[0.06, d.y + 0.02, d.len + 0.03]} />
            <meshStandardMaterial color="#7b786e" roughness={0.95} />
          </mesh>
        )),
      )}
      {/* the round arch opening (the mirror completes the circle) */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (BR_W / 2 - 0.04), -0.44, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.88, 0.07, 8, 28, Math.PI]} />
          <meshStandardMaterial color="#636058" roughness={0.95} />
        </mesh>
      ))}
      {/* abutments + steps at both ends */}
      {[-1, 1].map((end) => (
        <group key={end}>
          <mesh position={[0, 0.1, end * (BR_HALF + 0.18)]} receiveShadow>
            <boxGeometry args={[BR_W + 0.1, 0.2, 0.42]} />
            <meshStandardMaterial color="#7c7970" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.035, end * (BR_HALF + 0.5)]} receiveShadow>
            <boxGeometry args={[BR_W + 0.02, 0.07, 0.3]} />
            <meshStandardMaterial color="#75726a" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── 烏篷船 — a moored black-awning boat, bobbing gently ──────────────

function WoodenBoat({ night }: { night: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.position.y = Math.sin(t * 0.7) * 0.018;
    g.rotation.z = Math.sin(t * 0.5) * 0.012;
    g.rotation.x = Math.sin(t * 0.62 + 1) * 0.01;
  });
  return (
    <group>
      <group ref={ref}>
        {/* hull — a stretched half-shell, ~2.5m bow to stern */}
        <mesh position={[0, 0.24, 0]} scale={[1.25, 0.32, 0.42]} castShadow>
          <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshStandardMaterial color="#2f2620" roughness={0.85} side={DoubleSide} />
        </mesh>
        {/* gunwale rim */}
        <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.25, 0.42, 1]}>
          <torusGeometry args={[1, 0.03, 8, 36]} />
          <meshStandardMaterial color="#4a3a2a" roughness={0.75} />
        </mesh>
        {/* deck boards */}
        <mesh position={[0, 0.13, 0]}>
          <boxGeometry args={[1.8, 0.04, 0.46]} />
          <meshStandardMaterial color="#3d3227" roughness={0.9} />
        </mesh>
        {/* 烏篷 awning — half-pipe arched over the midship, opening down */}
        <mesh position={[-0.18, 0.26, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.4, 0.4, 1.1, 14, 1, true, 0, Math.PI]} />
          <meshStandardMaterial color="#1d1b17" roughness={0.9} side={DoubleSide} />
        </mesh>
        {[-0.7, -0.18, 0.34].map((x) => (
          <mesh key={x} position={[x, 0.26, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.41, 0.016, 6, 14, Math.PI]} />
            <meshStandardMaterial color="#3a352c" roughness={0.85} />
          </mesh>
        ))}
        {/* 船頭燈 */}
        <group position={[1.02, 0.42, 0]}>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.26, 6]} />
            <meshStandardMaterial color="#2a2018" roughness={0.8} />
          </mesh>
          <mesh scale={[1, 1.2, 1]}>
            <sphereGeometry args={[0.06, 12, 10]} />
            <meshStandardMaterial
              color="#a8281e"
              emissive={night ? '#ff5a32' : '#38100a'}
              emissiveIntensity={night ? 1.6 : 0.25}
              roughness={0.5}
            />
          </mesh>
          {night ? <pointLight color="#ff9a5a" intensity={1.1} distance={2.8} decay={2} /> : null}
        </group>
      </group>
      {/* mooring pole leaning into the water */}
      <mesh position={[1.35, 0.6, 0.4]} rotation={[0.12, 0, -0.18]} castShadow>
        <cylinderGeometry args={[0.02, 0.028, 1.5, 7]} />
        <meshStandardMaterial color="#4c3d2c" roughness={0.9} />
      </mesh>
      <ContactShadow radius={1.2} opacity={0.26} />
    </group>
  );
}

// ── 垂柳 — willow with hanging painted strands, swaying slightly ─────

/** 柳絲 — one hanging strand: stem line with small alternating leaves. */
function willowTexture(): CanvasTexture {
  return cachedTexture('willow', (c) => {
    c.width = 32;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 32, 128);
    g.strokeStyle = 'rgba(96,124,74,0.85)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(16, 0);
    g.quadraticCurveTo(19, 64, 15, 128);
    g.stroke();
    for (let i = 0; i < 14; i++) {
      const y = 6 + i * 8.6;
      const side = i % 2 ? 1 : -1;
      g.save();
      g.translate(16 + side * 2, y);
      g.rotate(side * (0.9 + rnd(i, 3) * 0.4));
      g.fillStyle = i % 3 ? 'rgba(110,140,84,0.9)' : 'rgba(92,122,70,0.9)';
      g.beginPath();
      g.ellipse(5, 0, 5.5, 1.7, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  });
}

function Willow({ seed = 1 }: { seed?: number }) {
  const tex = useMemo(() => willowTexture(), []);
  const canopyRef = useRef<Group>(null);
  const strands = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2 + rnd(seed, i) * 0.5;
        const r = 0.45 + rnd(seed, i * 3) * 0.75;
        return {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          y: 2.5 + rnd(seed, i * 5) * 0.7,
          len: 1.5 + rnd(seed, i * 7) * 1.1,
          rotY: a + rnd(seed, i * 11) * 0.8,
          tilt: (rnd(seed, i * 13) - 0.5) * 0.16,
        };
      }),
    [seed],
  );
  useFrame(({ clock }) => {
    const g = canopyRef.current;
    if (!g) return;
    g.rotation.z = Math.sin(clock.elapsedTime * 0.4 + seed) * 0.025;
  });
  const { trunk, limbs } = useMemo(() => {
    const trunk = new CatmullRomCurve3([
      new Vector3(0, 0, 0),
      new Vector3(0.06, 1.0, 0.02),
      new Vector3(0.18, 1.9, -0.03),
      new Vector3(0.26, 2.65, 0),
    ]);
    const limbs = [0, 1, 2].map((k) => {
      const a = (k / 3) * Math.PI * 2 + rnd(seed, k * 9) * 0.8;
      const start = trunk.getPoint(0.78 + k * 0.08);
      return new CatmullRomCurve3([
        start,
        new Vector3(start.x + Math.cos(a) * 0.4, start.y + 0.3, start.z + Math.sin(a) * 0.4),
        new Vector3(start.x + Math.cos(a) * 0.85, start.y + 0.42, start.z + Math.sin(a) * 0.85),
      ]);
    });
    return { trunk, limbs };
  }, [seed]);
  return (
    <group>
      {/* one continuous bending trunk + three limbs the strands hang from */}
      <mesh castShadow>
        <tubeGeometry args={[trunk, 12, 0.11, 8, false]} />
        <meshStandardMaterial color="#3c3226" roughness={0.95} />
      </mesh>
      {limbs.map((c, i) => (
        <mesh key={i} castShadow>
          <tubeGeometry args={[c, 8, 0.045, 6, false]} />
          <meshStandardMaterial color="#443828" roughness={0.95} />
        </mesh>
      ))}
      {/* root flare */}
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.13, 0.2, 0.14, 9]} />
        <meshStandardMaterial color="#362c22" roughness={0.95} />
      </mesh>
      {/* hanging strands */}
      <group ref={canopyRef} position={[0.24, 0, 0]}>
        {strands.map((s, i) => (
          <mesh key={i} position={[s.x, s.y - s.len / 2, s.z]} rotation={[s.tilt, s.rotY, 0]}>
            <planeGeometry args={[0.15, s.len]} />
            <meshStandardMaterial
              map={tex}
              transparent
              alphaTest={0.15}
              side={DoubleSide}
              roughness={0.9}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      <ContactShadow radius={1.3} opacity={0.24} />
    </group>
  );
}

// ── 荷 — lotus pads and a bloom or two floating on the mirror ────────

function LotusCluster({ seed = 1, night }: { seed?: number; night: boolean }) {
  const pads = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const a = rnd(seed, i * 3) * Math.PI * 2;
        const r = rnd(seed, i * 5) * 0.85;
        return {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          s: 0.13 + rnd(seed, i * 7) * 0.17,
          rot: rnd(seed, i * 11) * Math.PI * 2,
          tilt: rnd(seed, i * 13) * 0.14,
          tone: i % 3 === 0 ? '#57774f' : i % 3 === 1 ? '#4d6c46' : '#5f8156',
        };
      }),
    [seed],
  );
  return (
    <group>
      {pads.map((p, i) => (
        <mesh key={i} position={[p.x, 0.022, p.z]} rotation={[-Math.PI / 2 + p.tilt, 0, p.rot]}>
          <circleGeometry args={[p.s, 18]} />
          <meshStandardMaterial color={p.tone} roughness={0.8} side={DoubleSide} />
        </mesh>
      ))}
      {/* one open bloom + one bud on short stems */}
      <group position={[pads[0].x, 0, pads[0].z]}>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.012, 0.016, 0.2, 6]} />
          <meshStandardMaterial color="#4a6844" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.22, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.11, 0.1, 9, 1, true]} />
          <meshStandardMaterial
            color="#e8a9be"
            roughness={0.75}
            side={DoubleSide}
            emissive={night ? '#7a4658' : '#3a2028'}
            emissiveIntensity={night ? 0.35 : 0.12}
          />
        </mesh>
        <mesh position={[0, 0.26, 0]} rotation={[Math.PI, 0, 0.4]}>
          <coneGeometry args={[0.075, 0.09, 8, 1, true]} />
          <meshStandardMaterial
            color="#f3c9d6"
            roughness={0.75}
            side={DoubleSide}
            emissive={night ? '#8a5668' : '#402530'}
            emissiveIntensity={night ? 0.3 : 0.1}
          />
        </mesh>
        <mesh position={[0, 0.27, 0]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial color="#d9b552" roughness={0.7} />
        </mesh>
      </group>
      <group position={[pads[3].x, 0, pads[3].z]}>
        <mesh position={[0, 0.09, 0]} rotation={[0.12, 0, 0.1]}>
          <cylinderGeometry args={[0.01, 0.014, 0.18, 6]} />
          <meshStandardMaterial color="#4a6844" roughness={0.9} />
        </mesh>
        <mesh position={[0.015, 0.21, 0]} scale={[1, 1.5, 1]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial color="#e29ab2" roughness={0.75} />
        </mesh>
      </group>
    </group>
  );
}

// ── 漣漪 — slow expanding rings where things touch the water ─────────

function Ripples({ spots, tone }: { spots: [number, number][]; tone: string }) {
  const ref = useRef<Group>(null);
  const RINGS = 2;
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, idx) => {
      const k = idx % RINGS;
      const cycle = (t * 0.14 + k / RINGS + (idx / RINGS) * 0.37) % 1;
      const s = 0.35 + cycle * 1.5;
      child.scale.setScalar(s);
      const mesh = child as unknown as { material: { opacity: number } };
      mesh.material.opacity = (1 - cycle) * 0.22;
    });
  });
  return (
    <group ref={ref}>
      {spots.flatMap(([x, z], si) =>
        Array.from({ length: RINGS }, (_, k) => (
          <mesh key={`${si}:${k}`} position={[x, 0.014, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.92, 1, 40]} />
            <meshBasicMaterial color={tone} transparent opacity={0} depthWrite={false} />
          </mesh>
        )),
      )}
    </group>
  );
}

// ── 春雪 — plum petals falling like snow, the troupe's namesake ───────

function PetalSnow({ tone, dims }: { tone: 'day' | 'night'; dims: RoomDims }) {
  const ref = useRef<Points>(null);
  const tex = useMemo(() => petalTexture(), []);
  const count = 170;
  const top = dims.height + 2.2;
  const spread = 11;
  const { array, vel, phase } = useMemo(() => {
    const a = new Float32Array(count * 3);
    const v = new Float32Array(count);
    const p = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (rnd(i, 3) * 2 - 1) * spread;
      a[i * 3 + 1] = rnd(i, 5) * top;
      a[i * 3 + 2] = (rnd(i, 7) * 2 - 1) * spread;
      v[i] = 0.5 + rnd(i, 11) * 0.8;
      p[i] = rnd(i, 13) * Math.PI * 2;
    }
    return { array: a, vel: v, phase: p };
  }, [top]);

  useFrame((state, dt) => {
    const geo = ref.current?.geometry;
    if (!geo) return;
    const pos = geo.attributes.position;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) - 0.26 * vel[i] * dt;
      // petals seesaw as they fall (落花回風)
      const x = pos.getX(i) + Math.sin(t * 0.7 + phase[i]) * 0.3 * dt;
      const z = pos.getZ(i) + Math.cos(t * 0.55 + phase[i] * 1.3) * 0.24 * dt;
      if (y < -0.1) y = top;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[array, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={tex}
        color={tone === 'day' ? '#f3b8ca' : '#ddc9d6'}
        size={0.13}
        transparent
        opacity={tone === 'day' ? 0.95 : 0.75}
        alphaTest={0.05}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// ── 螢火 — fireflies wandering the dark garden (night only) ──────────

function Fireflies() {
  const ref = useRef<Group>(null);
  const flies = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        cx: (rnd(i, 3) * 2 - 1) * 8.5,
        cz: (rnd(i, 5) * 2 - 1) * 8,
        cy: 0.4 + rnd(i, 7) * 1.6,
        rx: 0.5 + rnd(i, 11) * 1.3,
        rz: 0.5 + rnd(i, 13) * 1.3,
        sp: 0.14 + rnd(i, 17) * 0.3,
        ph: rnd(i, 19) * Math.PI * 2,
      })),
    [],
  );

  useFrame(({ clock }) => {
    const grp = ref.current;
    if (!grp) return;
    const t = clock.elapsedTime;
    grp.children.forEach((child, i) => {
      const f = flies[i];
      if (!f) return;
      child.position.set(
        f.cx + Math.sin(t * f.sp * 2 + f.ph) * f.rx,
        f.cy + Math.sin(t * f.sp * 3.1 + f.ph * 2) * 0.35,
        f.cz + Math.cos(t * f.sp * 1.7 + f.ph) * f.rz,
      );
      // slow breathing glow
      const s = 0.04 + (Math.sin(t * (1.1 + f.sp) + f.ph * 3) * 0.5 + 0.5) * 0.065;
      child.scale.setScalar(s);
    });
  });

  return (
    <group ref={ref}>
      {flies.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial color="#e2f2a8" transparent opacity={0.85} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ── 展區 dressing — each satellite island gets a story-prop vignette ─

/** 雲步石 — floating slabs hopping from the main island to a satellite. */
function HopStones({ platform }: { platform: PlatformSpec }) {
  const stones = useMemo(() => {
    const len = Math.hypot(platform.x, platform.z);
    const ux = platform.x / len;
    const uz = platform.z / len;
    // between the main island's edge (~11.3) and the satellite's near edge
    const inner = len - Math.max(platform.width, platform.depth) / 2 - 0.6;
    const a = Math.min(12.3, inner - 1.4);
    const b = Math.min(13.8, inner - 0.2);
    return [a, b].map((d, i) => ({
      x: ux * d + (rnd(i, 41) - 0.5) * 0.5,
      z: uz * d + (rnd(i, 43) - 0.5) * 0.5,
      r: 0.42 + rnd(i, 47) * 0.14,
      rot: rnd(i, 53) * Math.PI,
    }));
  }, [platform]);
  return (
    <group>
      {stones.map((s, i) => (
        <mesh key={i} position={[s.x, -0.02, s.z]} rotation={[0, s.rot, 0]}>
          <cylinderGeometry args={[s.r, s.r * 1.1, 0.1, 7]} />
          <meshStandardMaterial color="#6f6c64" roughness={0.95} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** the vignette at a satellite's heart, keyed by zone index. */
function ZoneVignette({ index, night }: { index: number; night: boolean }) {
  if (index === 0) {
    // 白蛇傳 island — the 斷橋 set piece, the borrowed umbrella left against it
    return (
      <group>
        <group rotation={[0, 0.5, 0]}>
          <BrokenBridgeProp night={night} />
        </group>
        <group position={[0.62, 0.42, 0.75]} rotation={[0.5, 0.3, -0.45]}>
          <PaperUmbrella />
        </group>
        <ContactShadow radius={1.5} opacity={0.28} />
      </group>
    );
  }
  if (index === 1) {
    // backstage island — trunks and the airing robe
    return (
      <group>
        <group position={[0.35, 0, -0.3]} rotation={[0, -0.4, 0]}>
          <PropTrunks />
        </group>
        <group position={[-0.7, 0, 0.35]} rotation={[0, 0.55, 0]}>
          <CostumeRack />
        </group>
        <group position={[0.75, 0, 0.55]} rotation={[0, 0.2, 0]} scale={0.9}>
          <PaperUmbrella open={false} />
        </group>
        <ContactShadow radius={1.4} opacity={0.28} />
      </group>
    );
  }
  // rehearsal island — 一桌二椅, the opera convention itself
  return (
    <group>
      <group rotation={[0, 0.25, 0]} scale={0.85}>
        <TableChairs item="lamp" />
      </group>
      <ContactShadow radius={1.4} opacity={0.28} />
    </group>
  );
}

// ── the assembled shell ──────────────────────────────────────────────

export function VaultScenery({
  tone,
  dims,
  platforms,
}: {
  tone: 'day' | 'night';
  dims: RoomDims;
  platforms?: PlatformSpec[];
}) {
  const night = tone === 'night';
  return (
    <group>
      {/* 月洞門 wall framing the back — the way into the dream.
          Layout note: exhibit ring is r=5.1, cloud walls r=9.3; scenery lives
          between them, each piece placed with clearance checked against the
          ring, the walls and its neighbours (no interpenetration). */}
      <group position={[0, 0, -8.8]}>
        <MoonGateWall night={night} />
      </group>
      {/* 雲牆 sweeping back on both flanks of the gate */}
      <CloudWall thetaStart={Math.PI * 0.64} thetaLength={Math.PI * 0.24} />
      <CloudWall thetaStart={Math.PI * 1.12} thetaLength={Math.PI * 0.24} />

      {/* 梅樹 — inside the walls, crowns overhanging the coping (紅梅出牆) */}
      <group position={[-5.6, 0, -6.6]} scale={1.35} rotation={[0, 0.7, 0]}>
        <PlumTree seed={2} night={night} />
      </group>
      <group position={[6.2, 0, -5.6]} scale={1.15} rotation={[0, -1.9, 0]}>
        <PlumTree seed={5} night={night} />
      </group>
      {/* 梅石相伴 — each tree keeps its rock, clear of wall and ring */}
      <group position={[-4.4, 0, -7.0]} scale={1.05} rotation={[0, 0.5, 0]}>
        <ScholarRock seed={2} />
      </group>
      <group position={[4.6, 0, -7.0]} scale={0.8} rotation={[0, 2.3, 0]}>
        <ScholarRock seed={7} />
      </group>

      {/* 涼亭 west of the collection, past the wall's end — open to the water */}
      <group position={[-7.6, 0, -2.2]} rotation={[0, 0.6, 0]}>
        <Pavilion lit={night} />
      </group>

      {/* 竹影 — one grove by the water in front, one peeking from beyond the wall */}
      <group position={[-7.8, 0, 2.6]} scale={1.1}>
        <BambooGrove seed={3} />
      </group>
      <group position={[8.5, 0, -5.9]} scale={0.95}>
        <BambooGrove seed={8} />
      </group>

      {/* ── 江南水鄉 — the front half of the mirror IS the water ── */}
      {/* 石拱橋 leading in over the water; the mirror closes the arch */}
      <group position={[0.3, 0, 3.5]} rotation={[0, 0.35, 0]}>
        <StoneBridge />
      </group>
      {/* 石燈籠 pair flanking the bridge approach */}
      <group position={[-2.0, 0, 5.5]}>
        <StoneLantern lit={night} />
      </group>
      <group position={[2.0, 0, 5.5]}>
        <StoneLantern lit={night} />
      </group>
      {/* 烏篷船 moored east, under the willow */}
      <group position={[6.4, 0, 3.0]} rotation={[0, -0.5, 0]}>
        <WoodenBoat night={night} />
      </group>
      <group position={[8.3, 0, 1.0]} scale={1.1}>
        <Willow seed={4} />
      </group>
      {/* 荷 — lotus drifting near both banks */}
      <group position={[-5.9, 0, 4.3]}>
        <LotusCluster seed={3} night={night} />
      </group>
      <group position={[5.0, 0, 4.8]} scale={0.85}>
        <LotusCluster seed={9} night={night} />
      </group>
      {/* 漣漪 under the boat, the arch and the lotus */}
      <Ripples
        spots={[
          [6.4, 3.0],
          [0.3, 3.5],
          [-5.9, 4.3],
        ]}
        tone={night ? '#8fa8c8' : '#ffffff'}
      />

      {/* 戲班的家當 — trunks and the umbrella resting by the pavilion bank */}
      <group position={[-5.9, 0, 0.6]} rotation={[0, 0.4, 0]} scale={0.9}>
        <PropTrunks />
        <group position={[0.62, 0.4, 0.3]} rotation={[0.42, 0.2, -0.5]} scale={0.9}>
          <PaperUmbrella />
        </group>
        <ContactShadow radius={1.1} opacity={0.26} />
      </group>

      {/* 展區 — each added zone floats its own island, dressed with a
          different corner of the troupe's world */}
      {(platforms ?? []).map((p, i) => (
        <group key={i}>
          <group position={[p.x, 0, p.z]}>
            <ZoneVignette index={i} night={night} />
          </group>
          <HopStones platform={p} />
        </group>
      ))}

      {/* 春雪 — always falling, day as blossom, night as moonlit snow */}
      <PetalSnow tone={tone} dims={dims} />

      {night ? <Fireflies /> : null}
    </group>
  );
}
