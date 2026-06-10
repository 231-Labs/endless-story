'use client';

import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { MeshReflectorMaterial } from '@react-three/drei';
import { ChamberLights } from './ChamberLights.js';
import { SkyBackdrop } from './SkyBackdrop.js';
import { Weather } from './Weather.js';
import { DriftingMist } from './Mist.js';
import {
  Bamboo,
  Guqin,
  Incense,
  Lantern,
  MoonGate,
  PlumBranch,
  ScholarRock,
  Screen,
} from './SceneElements.js';
import { GlbProp } from './GlbProp.js';
import { PropPrimitive } from './PropPrimitive.js';
import { ScrollQuad, FallbackQuad } from './ScrollQuad.js';
import { CharacterAvatar } from './CharacterAvatar.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { paletteForEnv } from './environment.js';
import type { ChamberAvatar, ChamberEnvironment, RoomDims } from './types.js';
import type { FloorType, SceneDesign, SceneElement } from './scene-design.js';

const GLB_RE = /\.(glb|gltf)(\?|#|$)/i;

const WATER: Record<string, string> = {
  day: '#3f5a60',
  dawn: '#46545e',
  dusk: '#2a3142',
  night: '#161e2a',
};

function Floor({ type, color, dims, timeOfDay }: { type: FloorType; color?: string; dims: RoomDims; timeOfDay: string }) {
  if (type === 'void') return null;
  const w = dims.width * 2.6;
  const d = dims.depth * 1.8;
  if (type === 'water') {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -dims.depth * 0.1]}>
        <planeGeometry args={[w, d]} />
        <MeshReflectorMaterial
          resolution={512}
          blur={[420, 180]}
          mixBlur={1.1}
          mixStrength={2.4}
          roughness={0.75}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.3}
          color={color ?? WATER[timeOfDay] ?? WATER.day}
          metalness={0.55}
        />
      </mesh>
    );
  }
  const flat = type === 'wood' ? (color ?? '#6e5238') : (color ?? '#9a9386');
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -dims.depth * 0.1]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={flat} roughness={type === 'wood' ? 0.82 : 0.9} metalness={0.04} />
    </mesh>
  );
}

function Element({ el, avatars }: { el: SceneElement; avatars: ChamberAvatar[] }) {
  const pos = el.pos;
  const rot: [number, number, number] = [0, ((el.yaw ?? 0) * Math.PI) / 180, 0];
  const scale = el.scale ?? 1;
  const wrap = (node: ReactNode) => (
    <group position={pos} rotation={rot} scale={scale}>
      {node}
    </group>
  );

  switch (el.kind) {
    case 'moon_gate':
      return wrap(<MoonGate />);
    case 'bamboo':
      return wrap(<Bamboo />);
    case 'scholar_rock':
      return wrap(<ScholarRock />);
    case 'lantern':
      return wrap(<Lantern />);
    case 'guqin':
      return wrap(<Guqin />);
    case 'incense':
      return wrap(<Incense />);
    case 'screen':
      return wrap(<Screen />);
    case 'plum_branch':
      return wrap(<PlumBranch />);
    case 'scroll':
      return wrap(
        el.assetUrl ? (
          <Suspense fallback={<FallbackQuad />}>
            <ErrorBoundary fallback={<FallbackQuad />}>
              <ScrollQuad url={el.assetUrl} />
            </ErrorBoundary>
          </Suspense>
        ) : (
          <FallbackQuad />
        ),
      );
    case 'prop':
      if (el.assetUrl && GLB_RE.test(el.assetUrl)) {
        return wrap(
          <Suspense fallback={<PropPrimitive tag={el.tag} />}>
            <ErrorBoundary fallback={<PropPrimitive tag={el.tag} />}>
              <GlbProp url={el.assetUrl} fitHeight={el.fitHeight} />
            </ErrorBoundary>
          </Suspense>,
        );
      }
      return wrap(<PropPrimitive tag={el.tag} />);
    case 'character': {
      const a = avatars[el.characterIndex ?? 0];
      if (!a) return null;
      return wrap(<CharacterAvatar isSelf={a.isSelf} portraitUrl={a.portraitUrl} />);
    }
    default:
      return null;
  }
}

/**
 * Interprets a `SceneDesign` (LLM-authored or deterministic) into a 3D scene:
 * backdrop + floor + mood lighting/weather + every placed element. This is the
 * generic renderer that makes "GLM designs the whole scene" possible.
 */
export function SceneRenderer({
  design,
  env,
  avatars,
  dims,
}: {
  design: SceneDesign;
  env: ChamberEnvironment;
  avatars: ChamberAvatar[];
  dims: RoomDims;
}) {
  const palette = paletteForEnv(env);

  return (
    <group>
      <SkyBackdrop env={env} />
      <ChamberLights palette={palette} />
      <Floor type={design.floor.type} color={design.floor.color} dims={dims} timeOfDay={env.timeOfDay} />
      <Weather weather={env.weather} dims={dims} />
      {/* 雲氣 — the 虛無 layer: slow mist breathing over the water */}
      <DriftingMist
        dims={dims}
        tone={env.timeOfDay === 'dusk' || env.timeOfDay === 'night' ? '#aab6c6' : '#f2f5f1'}
      />
      {design.elements.map((el, i) => (
        <Element key={`${el.kind}:${i}`} el={el} avatars={avatars} />
      ))}
    </group>
  );
}
