'use client';

import { useMemo } from 'react';
import { CanvasTexture, CatmullRomCurve3, DoubleSide, SRGBColorSpace, Vector3 } from 'three';

/**
 * 春雪社の戲班道具 — story-world props for the vault garden. These are the
 * troupe's STAGE PROPS, not real architecture: the 斷橋 set piece sits on a
 * visible wooden skid base with A-frame braces, the paper umbrella is the one
 * from 遊湖借傘, the prop trunks carry the troupe's name, the costume rack
 * holds a water-sleeve robe. Everything procedural, painted with canvas
 * textures where a brush reads better than geometry.
 */

function rnd(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

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

/** 「春雪社」 trunk label — gold characters on dark lacquer. */
function troupeLabelTexture(): CanvasTexture {
  return cachedTexture('troupe-label', (c) => {
    c.width = 192;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#241a12';
    g.fillRect(0, 0, 192, 96);
    g.strokeStyle = 'rgba(202,166,74,0.9)';
    g.lineWidth = 2.5;
    g.strokeRect(5, 5, 182, 86);
    g.fillStyle = '#d9b96a';
    g.font = '500 44px "Songti SC", "Noto Serif CJK TC", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('春雪社', 96, 52);
  });
}

/** 水袖戲服 — a pale robe with long sleeves spread on the rod. */
function robeTexture(): CanvasTexture {
  return cachedTexture('robe', (c) => {
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 256, 256);
    // body + spread sleeves, one soft silhouette
    g.fillStyle = 'rgba(238,233,222,0.97)';
    g.beginPath();
    g.moveTo(128, 18); // collar
    g.quadraticCurveTo(60, 30, 14, 66); // left sleeve top
    g.lineTo(6, 118); // left sleeve tip (水袖 falls long)
    g.quadraticCurveTo(48, 96, 84, 92); // sleeve underside back to body
    g.quadraticCurveTo(78, 170, 88, 238); // body left hem
    g.lineTo(168, 238); // hem
    g.quadraticCurveTo(178, 170, 172, 92);
    g.quadraticCurveTo(208, 96, 250, 118);
    g.lineTo(242, 66);
    g.quadraticCurveTo(196, 30, 128, 18);
    g.closePath();
    g.fill();
    // 青 collar band
    g.strokeStyle = 'rgba(74,110,118,0.9)';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(104, 24);
    g.quadraticCurveTo(128, 60, 128, 116);
    g.moveTo(152, 24);
    g.quadraticCurveTo(128, 60, 128, 116);
    g.stroke();
    // hem + cuff trims
    g.strokeStyle = 'rgba(74,110,118,0.65)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(88, 232);
    g.lineTo(168, 232);
    g.stroke();
    // scattered plum dots (the troupe's motif)
    g.fillStyle = 'rgba(196,142,158,0.5)';
    for (let i = 0; i < 14; i++) {
      const x = 70 + rnd(i, 5) * 116;
      const y = 90 + rnd(i, 9) * 130;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2, 2, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

// ── 斷橋舞台道具 — the Broken Bridge set piece on its stage skid ─────

export function BrokenBridgeProp({ night = false }: { night?: boolean }) {
  // two quarter-arches rising toward a jagged gap at centre (斷橋殘雪)
  const half = (dir: 1 | -1) => {
    const N = 4;
    return Array.from({ length: N }, (_, i) => {
      const t0 = i / N;
      const t1 = (i + 1) / N;
      // rises from the end (|z|=1.15) toward the break (z≈0.18*dir)
      const z0 = dir * (1.15 - t0 * 0.97);
      const z1 = dir * (1.15 - t1 * 0.97);
      const y0 = Math.sin((t0 * Math.PI) / 2) * 0.52;
      const y1 = Math.sin((t1 * Math.PI) / 2) * 0.52;
      return {
        z: (z0 + z1) / 2,
        y: (y0 + y1) / 2 + 0.13,
        len: Math.hypot(z1 - z0, y1 - y0) + 0.012,
        rotX: Math.atan2(y1 - y0, (z1 - z0) * 1),
      };
    });
  };
  const halves = useMemo(() => [half(1), half(-1)], []);

  return (
    <group>
      {/* stage skid base — tells you it's a prop, not a bridge */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.95, 0.12, 2.7]} />
        <meshStandardMaterial color="#5c452e" roughness={0.9} />
      </mesh>
      {[-1.05, 0, 1.05].map((z) => (
        <mesh key={z} position={[0, 0.015, z]}>
          <boxGeometry args={[1.15, 0.05, 0.14]} />
          <meshStandardMaterial color="#4a3826" roughness={0.9} />
        </mesh>
      ))}

      {halves.map((segs, hi) => (
        <group key={hi}>
          {segs.map((d, i) => (
            <group key={i}>
              {/* deck */}
              <mesh position={[0, d.y, d.z]} rotation={[d.rotX, 0, 0]} castShadow>
                <boxGeometry args={[0.62, 0.07, d.len]} />
                <meshStandardMaterial color="#b9b4a8" roughness={0.9} />
              </mesh>
              {/* painted stone side faces */}
              {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 0.29, (d.y + 0.05) / 2 + 0.06, d.z]}>
                  <boxGeometry args={[0.045, d.y - 0.02, d.len + 0.02]} />
                  <meshStandardMaterial color="#a19c90" roughness={0.95} />
                </mesh>
              ))}
              {/* 殘雪 dusting on the deck edge */}
              <mesh position={[0.12, d.y + 0.045, d.z]} rotation={[d.rotX, 0.2, 0]}>
                <boxGeometry args={[0.3, 0.018, d.len * 0.7]} />
                <meshStandardMaterial color="#f4f4f0" roughness={0.6} />
              </mesh>
            </group>
          ))}
          {/* jagged break face at the gap */}
          <mesh
            position={[0, 0.58, (0.18 + 0.045) * (hi === 0 ? 1 : -1)]}
            rotation={[hi === 0 ? -0.5 : 0.5, 0.15, 0.1]}
          >
            <boxGeometry args={[0.6, 0.14, 0.1]} />
            <meshStandardMaterial color="#8f8a7e" roughness={0.95} flatShading />
          </mesh>
          {/* low railing stubs */}
          {segs
            .filter((_, i) => i % 2 === 0)
            .map((d, i) => (
              <group key={`r${i}`}>
                {[-1, 1].map((s) => (
                  <mesh key={s} position={[s * 0.27, d.y + 0.14, d.z]}>
                    <boxGeometry args={[0.04, 0.16, 0.04]} />
                    <meshStandardMaterial color="#a59e92" roughness={0.9} />
                  </mesh>
                ))}
              </group>
            ))}
          {/* A-frame stage brace behind each half — the stagecraft giveaway */}
          <mesh
            position={[-0.42, 0.34, (hi === 0 ? 1 : -1) * 0.62]}
            rotation={[(hi === 0 ? -1 : 1) * 0.6, 0, 0.12]}
          >
            <boxGeometry args={[0.045, 0.75, 0.045]} />
            <meshStandardMaterial color="#6a5236" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* snow patches on the skid (斷橋殘雪 spills off the set piece) */}
      {[0.35, -0.4].map((z, i) => (
        <mesh key={i} position={[0.2 - i * 0.35, 0.125, z]} rotation={[-Math.PI / 2, 0, rnd(i, 7) * 3]}>
          <circleGeometry args={[0.16 + rnd(i, 3) * 0.08, 10]} />
          <meshStandardMaterial color="#f2f3ef" roughness={0.65} />
        </mesh>
      ))}
      {night ? (
        <pointLight position={[0, 1.1, 0]} color="#bcd0ee" intensity={0.7} distance={3.4} decay={2} />
      ) : null}
    </group>
  );
}

// ── 遊湖紙傘 — the borrowed umbrella, leaning where it was left ──────

export function PaperUmbrella({ open = true }: { open?: boolean }) {
  const ribs = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return new CatmullRomCurve3([
          new Vector3(0, 0.24, 0),
          new Vector3(Math.cos(a) * 0.3, 0.17, Math.sin(a) * 0.3),
          new Vector3(Math.cos(a) * 0.55, 0.03, Math.sin(a) * 0.55),
        ]);
      }),
    [],
  );
  if (!open) {
    // furled: slim cone with wrap bands
    return (
      <group>
        <mesh position={[0, 0.62, 0]} rotation={[0, 0, 0.06]} castShadow>
          <coneGeometry args={[0.09, 1.1, 10]} />
          <meshStandardMaterial color="#5d8290" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <cylinderGeometry args={[0.014, 0.016, 0.2, 6]} />
          <meshStandardMaterial color="#7a5c38" roughness={0.8} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      {/* canopy — shallow cone, 湖青 paper */}
      <mesh position={[0, 0.14, 0]} castShadow>
        <coneGeometry args={[0.58, 0.22, 12, 1, true]} />
        <meshStandardMaterial color="#63929f" roughness={0.62} side={DoubleSide} />
      </mesh>
      {/* rib lines over the paper */}
      {ribs.map((c, i) => (
        <mesh key={i}>
          <tubeGeometry args={[c, 6, 0.006, 5, false]} />
          <meshStandardMaterial color="#3e5a63" roughness={0.7} />
        </mesh>
      ))}
      {/* hub + shaft (leans as placed by the parent group) */}
      <mesh position={[0, 0.27, 0]}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshStandardMaterial color="#7a5c38" roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.18, 0]}>
        <cylinderGeometry args={[0.013, 0.015, 0.85, 7]} />
        <meshStandardMaterial color="#6e5334" roughness={0.85} />
      </mesh>
    </group>
  );
}

// ── 戲箱 — the troupe's prop trunks, name plaque and spilling silk ───

export function PropTrunks() {
  const label = useMemo(() => troupeLabelTexture(), []);
  const trunk = (w: number, h: number, d: number) => (
    <group>
      <mesh castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#5f4025" roughness={0.85} />
      </mesh>
      {/* lid band + brass corners */}
      <mesh position={[0, h * 0.32, 0]}>
        <boxGeometry args={[w + 0.015, h * 0.14, d + 0.015]} />
        <meshStandardMaterial color="#4a3018" roughness={0.9} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (w / 2 - 0.035), -h * 0.28, sz * (d / 2 + 0.004)]}>
            <boxGeometry args={[0.07, 0.09, 0.012]} />
            <meshStandardMaterial color="#b0893c" metalness={0.5} roughness={0.45} />
          </mesh>
        )),
      )}
    </group>
  );
  return (
    <group>
      <group position={[0, 0.26, 0]}>{trunk(0.92, 0.52, 0.6)}</group>
      <group position={[0.06, 0.71, -0.02]} rotation={[0, 0.16, 0]}>
        {trunk(0.78, 0.38, 0.52)}
      </group>
      {/* 春雪社 plaque on the lower trunk face */}
      <mesh position={[0, 0.28, 0.312]}>
        <planeGeometry args={[0.42, 0.21]} />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
      {/* red silk spilling from under the top lid */}
      <mesh position={[-0.32, 0.62, 0.14]} rotation={[0.25, 0.4, -0.5]}>
        <planeGeometry args={[0.24, 0.5]} />
        <meshStandardMaterial color="#a8281e" roughness={0.65} side={DoubleSide} />
      </mesh>
    </group>
  );
}

// ── 衣桁 — costume rack with a water-sleeve robe airing on it ────────

export function CostumeRack() {
  const robe = useMemo(() => robeTexture(), []);
  return (
    <group>
      {/* posts + feet + top rod with upturned ends */}
      {[-0.75, 0.75].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.8, 0]} castShadow>
            <cylinderGeometry args={[0.028, 0.033, 1.6, 8]} />
            <meshStandardMaterial color="#4a3626" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[0.09, 0.06, 0.42]} />
            <meshStandardMaterial color="#3c2c1e" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.62, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.024, 0.024, 1.78, 8]} />
        <meshStandardMaterial color="#4a3626" roughness={0.85} />
      </mesh>
      {[-0.89, 0.89].map((x) => (
        <mesh key={x} position={[x, 1.66, 0]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#b0893c" metalness={0.45} roughness={0.5} />
        </mesh>
      ))}
      {/* the robe, sleeves spread along the rod */}
      <mesh position={[0, 1.08, 0.02]}>
        <planeGeometry args={[1.5, 1.12]} />
        <meshStandardMaterial
          map={robe}
          transparent
          alphaTest={0.2}
          side={DoubleSide}
          roughness={0.9}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
