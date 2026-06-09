'use client';

import { Suspense, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SceneRenderer } from './SceneRenderer.js';
import { ChamberEffects } from './ChamberEffects.js';
import { CharacterAvatar } from './CharacterAvatar.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { buildGroupFromCode } from './runSceneCode.js';
import { deriveEnvironment, deriveRoomDims, paletteForEnv } from './environment.js';
import { deterministicDesign } from './scene-design.js';
import type { ChamberAvatar, ChamberEnvironment, ChamberLayout } from './types.js';

export interface ChamberCanvasProps {
  className?: string;
  style?: CSSProperties;
  layout?: ChamberLayout;
  envOverride?: Partial<ChamberEnvironment>;
  roomScale?: number;
}

/** Front standing spots for overlaying real character standees on a code scene. */
const OVERLAY_SPOTS: [number, number, number][] = [
  [0, 0, 1.4],
  [-1.7, 0, 0.9],
  [1.7, 0, 0.9],
];

export function ChamberCanvas({
  className,
  style,
  layout,
  envOverride,
  roomScale = 1,
}: ChamberCanvasProps) {
  const design = layout?.design ?? deterministicDesign();
  const base = deriveEnvironment(layout?.params);
  const env: ChamberEnvironment = {
    ...base,
    timeOfDay: design.mood.timeOfDay,
    season: design.mood.season ?? base.season,
    weather: design.mood.weather,
    atmosphere: design.mood.atmosphere ?? base.atmosphere,
    ...envOverride,
  };
  const palette = paletteForEnv(env);
  const dims = deriveRoomDims(layout?.params, roomScale);
  const avatars: ChamberAvatar[] = layout?.avatars ?? [];

  // EXPERIMENT (option 3): GLM-authored Three.js scene.
  const generated = useMemo(
    () => (layout?.code ? buildGroupFromCode(layout.code) : null),
    [layout?.code],
  );

  const camPos: [number, number, number] = [dims.width * 0.5, dims.height * 0.55, dims.depth * 0.95 + 3.4];

  return (
    <Canvas
      className={className}
      style={style}
      shadows
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.1, far: 300, position: camPos }}
    >
      <fog attach="fog" args={[palette.bg, dims.depth * 1.4, dims.depth * 5 + 14]} />

      {generated ? (
        <>
          {/* safety lights in case the generated code didn't add any */}
          <ambientLight color="#dfe6df" intensity={0.6} />
          <directionalLight position={[8, 16, 10]} intensity={0.9} castShadow />
          <Suspense fallback={null}>
            <ErrorBoundary
              fallback={<SceneRenderer design={design} env={env} avatars={avatars} dims={dims} />}
            >
              <primitive object={generated} />
            </ErrorBoundary>
          </Suspense>
          {/* overlay the real character standees on top of the generated set */}
          {avatars.slice(0, 3).map((a, i) => (
            <group key={a.id} position={OVERLAY_SPOTS[i]}>
              <CharacterAvatar isSelf={a.isSelf} portraitUrl={a.portraitUrl} />
            </group>
          ))}
        </>
      ) : (
        <SceneRenderer design={design} env={env} avatars={avatars} dims={dims} />
      )}

      <ChamberEffects />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        target={[0, dims.height * 0.34, -dims.depth * 0.15]}
        minDistance={3}
        maxDistance={dims.width * 1.9}
        maxPolarAngle={Math.PI * 0.52}
      />
    </Canvas>
  );
}
