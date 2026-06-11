'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, CatmullRomCurve3, DoubleSide, SRGBColorSpace, Vector3 } from 'three';
import type { Group } from 'three';
import type { TableItem } from './scene-design.js';

/**
 * The placeable block vocabulary for `SceneDesign`. Each renders at local origin;
 * `SceneRenderer` wraps it in a group carrying pos / yaw / scale. Tasteful
 * procedural East-Asian elements — the pieces GLM composes a scene from.
 */

// ── 四面台 (open-on-four-sides opera stage) ──────────────────────────
/**
 * The canopy structure of a minimal-modern 四面台 standing directly on the
 * lacquer stage floor (the WHOLE ground is the stage — no plinth island):
 * a gold inlay square marks the playing area, four slender vermilion columns,
 * a 攢尖 canopy with 飛簷 (curved ridge + eave tubes kicking up at the
 * corners), gold 寶頂, corner lantern bulbs and 紅綢流蘇 hangers.
 */
export function OperaStage() {
  const COL = 3.05; // column inset from centre
  const EAVE = 3.55; // eave-tip reach
  const TIP = 3.5; // eave-tip height (kicked up)
  const corners: [number, number][] = [
    [-COL, -COL],
    [COL, -COL],
    [-COL, COL],
    [COL, COL],
  ];

  // 飛簷 curves: 4 sagging eave edges between kicked tips + 4 戧脊 from apex
  const { eaves, ridges } = useMemo(() => {
    const tips: [number, number][] = [
      [-EAVE, EAVE],
      [EAVE, EAVE],
      [EAVE, -EAVE],
      [-EAVE, -EAVE],
    ];
    const eaves = tips.map((t, i) => {
      const n = tips[(i + 1) % 4];
      return new CatmullRomCurve3([
        new Vector3(t[0], TIP, t[1]),
        new Vector3(((t[0] + n[0]) / 2) * 1.05, 3.0, ((t[1] + n[1]) / 2) * 1.05),
        new Vector3(n[0], TIP, n[1]),
      ]);
    });
    const ridges = tips.map(
      (t) =>
        new CatmullRomCurve3([
          new Vector3(0, 4.08, 0),
          new Vector3(t[0] * 0.55, 3.38, t[1] * 0.55),
          new Vector3(t[0], TIP, t[1]),
        ]),
    );
    return { eaves, ridges };
  }, []);

  return (
    <group>
      {/* gold inlay square marking the playing area on the lacquer floor */}
      {[
        [0, 3.27, 6.59, 0.05] as const,
        [0, -3.27, 6.59, 0.05] as const,
      ].map(([x, z, w], i) => (
        <mesh key={`gx${i}`} position={[x, 0.006, z]}>
          <boxGeometry args={[w, 0.012, 0.05]} />
          <meshStandardMaterial color="#caa64a" metalness={0.45} roughness={0.4} />
        </mesh>
      ))}
      {[
        [3.27, 0] as const,
        [-3.27, 0] as const,
      ].map(([x, z], i) => (
        <mesh key={`gz${i}`} position={[x, 0.006, z]}>
          <boxGeometry args={[0.05, 0.012, 6.59]} />
          <meshStandardMaterial color="#caa64a" metalness={0.45} roughness={0.4} />
        </mesh>
      ))}

      {/* four slender vermilion columns */}
      {corners.map(([x, z], i) => (
        <mesh key={`c${i}`} position={[x, 1.5, z]} castShadow>
          <cylinderGeometry args={[0.085, 0.095, 3.0, 12]} />
          <meshStandardMaterial color="#7e2a1d" roughness={0.5} />
        </mesh>
      ))}
      {/* top ring beams */}
      {[
        { pos: [0, 3.04, -COL] as [number, number, number], args: [6.4, 0.12, 0.12] as [number, number, number] },
        { pos: [0, 3.04, COL] as [number, number, number], args: [6.4, 0.12, 0.12] as [number, number, number] },
        { pos: [-COL, 3.04, 0] as [number, number, number], args: [0.12, 0.12, 6.4] as [number, number, number] },
        { pos: [COL, 3.04, 0] as [number, number, number], args: [0.12, 0.12, 6.4] as [number, number, number] },
      ].map((b, i) => (
        <mesh key={`b${i}`} position={b.pos} castShadow>
          <boxGeometry args={b.args} />
          <meshStandardMaterial color="#3a2a1c" roughness={0.7} />
        </mesh>
      ))}

      {/* roof body (slightly inside the curved edges) */}
      <mesh position={[0, 3.56, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[4.35, 0.95, 4]} />
        <meshStandardMaterial color="#333a40" roughness={0.65} flatShading />
      </mesh>
      {/* 飛簷 — curved eave edges + 戧脊 ridges */}
      {eaves.map((c, i) => (
        <mesh key={`e${i}`} castShadow>
          <tubeGeometry args={[c, 24, 0.075, 8, false]} />
          <meshStandardMaterial color="#2c3238" roughness={0.6} />
        </mesh>
      ))}
      {ridges.map((c, i) => (
        <mesh key={`r${i}`} castShadow>
          <tubeGeometry args={[c, 24, 0.065, 8, false]} />
          <meshStandardMaterial color="#2c3238" roughness={0.6} />
        </mesh>
      ))}
      {/* gold beads on the four kicked tips */}
      {[
        [-EAVE, EAVE] as const,
        [EAVE, EAVE] as const,
        [EAVE, -EAVE] as const,
        [-EAVE, -EAVE] as const,
      ].map(([x, z], i) => (
        <mesh key={`t${i}`} position={[x, TIP + 0.06, z]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial color="#caa64a" metalness={0.55} roughness={0.35} />
        </mesh>
      ))}
      {/* 寶頂 finial */}
      <mesh position={[0, 4.2, 0]}>
        <cylinderGeometry args={[0.06, 0.1, 0.22, 10]} />
        <meshStandardMaterial color="#caa64a" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 4.38, 0]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color="#caa64a" metalness={0.55} roughness={0.35} emissive="#7a5a1e" emissiveIntensity={0.25} />
      </mesh>

      {/* 紅綢 + 流蘇 at each corner */}
      {corners.map(([x, z], i) => (
        <group key={`s${i}`} position={[x * 0.93, 0, z * 0.93]} rotation={[0, Math.atan2(x, z), 0]}>
          <mesh position={[0, 2.5, 0]}>
            <planeGeometry args={[0.16, 1.05]} />
            <meshStandardMaterial color="#b3261d" roughness={0.6} side={DoubleSide} />
          </mesh>
          <mesh position={[0, 1.93, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.07, 8]} />
            <meshStandardMaterial color="#caa64a" metalness={0.45} roughness={0.4} />
          </mesh>
          <mesh position={[0, 1.78, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.05, 0.24, 8]} />
            <meshStandardMaterial color="#b3261d" roughness={0.65} />
          </mesh>
        </group>
      ))}

      {/* corner lantern bulbs + one warm stage light */}
      {corners.map(([x, z], i) => (
        <mesh key={`l${i}`} position={[x * 0.93, 2.66, z * 0.93]}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshStandardMaterial color="#b3261d" emissive="#ff5a32" emissiveIntensity={1.5} roughness={0.5} />
        </mesh>
      ))}
      <pointLight position={[0, 2.5, 0]} color="#ffb070" intensity={1.5} distance={7.5} decay={2} />
    </group>
  );
}

// ── 一桌二椅 — the opera convention itself ────────────────────────────

/** 桌上點睛之物 — one symbolic item the agent picks (一盞燈/一封信/一把劍). */
function TableTopItem({ item }: { item: TableItem }) {
  const TOP = 0.865; // tabletop height
  if (item === 'lamp') {
    return (
      <group position={[0, TOP, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.055, 0.07, 0.05, 12]} />
          <meshStandardMaterial color="#caa64a" metalness={0.45} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color="#ffdf9e" emissive="#ffb347" emissiveIntensity={1.3} roughness={0.4} />
        </mesh>
        <pointLight position={[0, 0.12, 0]} color="#ffcf86" intensity={1.1} distance={2.6} decay={2} />
      </group>
    );
  }
  if (item === 'letter') {
    return (
      <group position={[0, TOP, 0]}>
        <mesh position={[0, 0.008, 0]} rotation={[0, 0.18, 0]} castShadow>
          <boxGeometry args={[0.3, 0.012, 0.2]} />
          <meshStandardMaterial color="#e9e2d0" roughness={0.85} />
        </mesh>
        <mesh position={[0.04, 0.022, 0.02]} rotation={[0, -0.32, 0]} castShadow>
          <boxGeometry args={[0.28, 0.012, 0.19]} />
          <meshStandardMaterial color="#f0ead9" roughness={0.85} />
        </mesh>
        {/* 封蠟 red seal */}
        <mesh position={[0.07, 0.034, 0.04]}>
          <cylinderGeometry args={[0.022, 0.022, 0.012, 10]} />
          <meshStandardMaterial color="#a03226" roughness={0.5} />
        </mesh>
      </group>
    );
  }
  if (item === 'sword') {
    return (
      <group position={[0, TOP, 0]} rotation={[0, 0.5, 0]}>
        {/* two tiny rests */}
        {[-0.28, 0.28].map((x) => (
          <mesh key={x} position={[x, 0.025, 0]}>
            <boxGeometry args={[0.04, 0.05, 0.1]} />
            <meshStandardMaterial color="#3b2f24" roughness={0.7} />
          </mesh>
        ))}
        {/* blade + guard + hilt */}
        <mesh position={[0.1, 0.065, 0]} castShadow>
          <boxGeometry args={[0.78, 0.018, 0.055]} />
          <meshStandardMaterial color="#b8c2cc" metalness={0.75} roughness={0.25} />
        </mesh>
        <mesh position={[-0.31, 0.065, 0]}>
          <boxGeometry args={[0.035, 0.05, 0.1]} />
          <meshStandardMaterial color="#caa64a" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[-0.43, 0.065, 0]}>
          <boxGeometry args={[0.2, 0.03, 0.04]} />
          <meshStandardMaterial color="#42302a" roughness={0.6} />
        </mesh>
      </group>
    );
  }
  return null;
}

/** Red-skirted table + two chairs with 椅帔; gold trim. 以一當十. */
export function TableChairs({ item = 'lamp' }: { item?: TableItem }) {
  const chair = (x: number) => (
    <group position={[x, 0, -0.55]}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.42, 0.5, 0.42]} />
        <meshStandardMaterial color="#b3261d" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.53, 0]}>
        <boxGeometry args={[0.44, 0.05, 0.44]} />
        <meshStandardMaterial color="#caa64a" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.95, -0.19]} castShadow>
        <boxGeometry args={[0.44, 0.8, 0.05]} />
        <meshStandardMaterial color="#b3261d" roughness={0.55} />
      </mesh>
    </group>
  );
  return (
    <group>
      <group>
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[1.06, 0.8, 0.64]} />
          <meshStandardMaterial color="#b3261d" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.74, 0]}>
          <boxGeometry args={[1.1, 0.05, 0.68]} />
          <meshStandardMaterial color="#caa64a" metalness={0.4} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.83, 0]} castShadow>
          <boxGeometry args={[1.16, 0.07, 0.74]} />
          <meshStandardMaterial color="#2c2420" roughness={0.4} />
        </mesh>
        <TableTopItem item={item} />
      </group>
      {chair(-0.95)}
      {chair(0.95)}
    </group>
  );
}

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
