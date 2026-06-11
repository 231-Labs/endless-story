'use client';

import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { AdditiveBlending, CanvasTexture, DoubleSide, SRGBColorSpace } from 'three';
import type { Group } from 'three';
import { GlbProp } from './GlbProp.js';
import { PropPrimitive } from './PropPrimitive.js';
import { ErrorBoundary } from './ErrorBoundary.js';

/**
 * 藏閣 display blocks — every collected piece gets its own column of light:
 * 劇照 float as glass plates in a narrow shaft; 珍玩 turn slowly on a plinth.
 * Provenance is the luxury: each piece carries a floating 題籤 (title ·
 * edition · moment).
 */

// ── 題籤 — canvas-rendered caption plate ─────────────────────────────

function captionTexture(title: string, subtitle: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  g.fillStyle = 'rgba(238,233,220,0.92)';
  g.font = '500 38px "Songti SC", "Noto Serif CJK TC", serif';
  g.fillText(title.slice(0, 14), c.width / 2, 56);
  g.fillStyle = 'rgba(202,166,74,0.85)';
  g.font = '400 26px "Songti SC", "Noto Serif CJK TC", serif';
  g.fillText(subtitle.slice(0, 20), c.width / 2, 100);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function CaptionPlate({
  title,
  subtitle,
  width = 1.1,
}: {
  title: string;
  subtitle: string;
  width?: number;
}) {
  const tex = useMemo(() => captionTexture(title, subtitle), [title, subtitle]);
  return (
    <mesh>
      <planeGeometry args={[width, width * 0.25]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} side={DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// ── light shaft + floor glow ─────────────────────────────────────────

function LightShaft({ height = 3.6, radius = 0.85 }: { height?: number; radius?: number }) {
  return (
    <group>
      <mesh position={[0, height / 2, 0]}>
        <coneGeometry args={[radius, height, 24, 1, true]} />
        <meshBasicMaterial
          color="#cfd8de"
          transparent
          opacity={0.055}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[radius * 1.08, 28]} />
        <meshBasicMaterial
          color="#9fb2c0"
          transparent
          opacity={0.13}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── 劇照 glass plate ─────────────────────────────────────────────────

function StillPlate({ url, height = 1.45 }: { url: string; height?: number }) {
  const texture = useTexture(url);
  const img = texture.image as { width?: number; height?: number } | undefined;
  const aspect = img && img.width && img.height ? img.width / img.height : 0.7;
  const w = height * aspect;
  return (
    <group>
      {/* dark glass backing */}
      <mesh position={[0, 0, -0.012]}>
        <planeGeometry args={[w + 0.1, height + 0.1]} />
        <meshBasicMaterial color="#0c0f13" transparent opacity={0.55} side={DoubleSide} depthWrite={false} />
      </mesh>
      <mesh>
        <planeGeometry args={[w, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} side={DoubleSide} />
      </mesh>
      {/* gold base line */}
      <mesh position={[0, -height / 2 - 0.07, 0]}>
        <planeGeometry args={[w * 0.7, 0.018]} />
        <meshBasicMaterial color="#caa64a" toneMapped={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}

export function DisplayStill({
  url,
  title,
  subtitle,
  phase = 0,
}: {
  url?: string;
  title: string;
  subtitle: string;
  /** desync the float animation between pieces. */
  phase?: number;
}) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = 1.78 + Math.sin(clock.elapsedTime * 0.5 + phase) * 0.05;
    }
  });
  return (
    <group>
      <LightShaft />
      <group ref={ref} position={[0, 1.78, 0]}>
        {url ? (
          <Suspense fallback={null}>
            <ErrorBoundary fallback={null}>
              <StillPlate url={url} />
            </ErrorBoundary>
          </Suspense>
        ) : null}
      </group>
      <group position={[0, 0.62, 0]}>
        <CaptionPlate title={title} subtitle={subtitle} />
      </group>
    </group>
  );
}

// ── 珍玩 plinth ──────────────────────────────────────────────────────

export function DisplayCurio({
  assetUrl,
  fitHeight = 0.5,
  tag,
  title,
  subtitle,
  phase = 0,
}: {
  assetUrl?: string;
  fitHeight?: number;
  tag?: string;
  title: string;
  subtitle: string;
  phase?: number;
}) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.22 + phase;
  });
  const isGlb = assetUrl && /\.(glb|gltf)(\?|#|$)/i.test(assetUrl);
  return (
    <group>
      <LightShaft height={3.0} radius={0.7} />
      {/* plinth */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.38, 0.9, 20]} />
        <meshStandardMaterial color="#17151a" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.905, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.015, 20]} />
        <meshBasicMaterial color="#caa64a" toneMapped={false} />
      </mesh>
      {/* the piece, slowly turning */}
      <group ref={ref} position={[0, 0.92, 0]}>
        {isGlb ? (
          <Suspense fallback={<PropPrimitive tag={tag} />}>
            <ErrorBoundary fallback={<PropPrimitive tag={tag} />}>
              <GlbProp url={assetUrl!} fitHeight={fitHeight} />
            </ErrorBoundary>
          </Suspense>
        ) : (
          <PropPrimitive tag={tag} />
        )}
      </group>
      <pointLight position={[0, 1.7, 0]} color="#ffe2b0" intensity={1.4} distance={2.8} decay={2} />
      <group position={[0, 0.55, 0.42]}>
        <CaptionPlate title={title} subtitle={subtitle} width={0.95} />
      </group>
    </group>
  );
}
