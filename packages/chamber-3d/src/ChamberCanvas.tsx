'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Fog } from 'three';
import { SceneRenderer, type SceneEditProps } from './SceneRenderer.js';
import { ChamberEffects } from './ChamberEffects.js';
import { CharacterAvatar } from './CharacterAvatar.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { buildGroupFromCode } from './runSceneCode.js';
import { deriveEnvironment, deriveRoomDims, paletteForEnv } from './environment.js';
import { deterministicDesign } from './scene-design.js';
import type { ChamberAvatar, ChamberEnvironment, ChamberLayout } from './types.js';

export interface ChamberCanvasProps extends SceneEditProps {
  className?: string;
  style?: CSSProperties;
  layout?: ChamberLayout;
  envOverride?: Partial<ChamberEnvironment>;
  roomScale?: number;
  /** 立軸感: mist-reveal entrance + slow idle orbit (stops on first interaction). */
  cinematic?: boolean;
  /** initial camera position override (e.g. a wide shot over multi-zone vaults). */
  cameraPos?: [number, number, number];
}

/** Front standing spots for overlaying real character standees on a code scene. */
const OVERLAY_SPOTS: [number, number, number][] = [
  [0, 0, 1.4],
  [-1.7, 0, 0.9],
  [1.7, 0, 0.9],
];

/**
 * 霧中顯影 — start with dense fog and ease it out to the design values over a
 * few seconds, so the chamber emerges from mist like an unrolling scroll.
 */
function MistReveal({ near, far }: { near: number; far: number }) {
  const { scene } = useThree();
  const t0 = useRef<number | null>(null);
  useFrame(({ clock }) => {
    const fog = scene.fog as Fog | null;
    if (!fog) return;
    if (t0.current == null) t0.current = clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - t0.current) / 3.2);
    const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
    fog.near = 1.2 + (near - 1.2) * e;
    fog.far = 6 + (far - 6) * e;
  });
  return null;
}

export function ChamberCanvas({
  className,
  style,
  layout,
  envOverride,
  roomScale = 1,
  cinematic = false,
  cameraPos,
  editable,
  selectedIndex,
  transformMode,
  onSelect,
  onCommit,
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
  const [interacted, setInteracted] = useState(false);

  // EXPERIMENT (option 3): GLM-authored Three.js scene.
  const generated = useMemo(
    () => (layout?.code ? buildGroupFromCode(layout.code) : null),
    [layout?.code],
  );

  const isVault = design.backdrop.style === '藏閣';
  const bright = env.timeOfDay === 'day' || env.timeOfDay === 'dawn';
  // 明閣: pull the fog back and tint it paper, or every still reads washed-out
  const fogScale = isVault && bright ? 2.6 : 1;
  const fogColor = isVault && bright ? '#e0e3d2' : palette.bg;
  const fogNear = dims.depth * 1.4 * fogScale;
  const fogFar = (dims.depth * 5 + 14) * fogScale;
  const camPos: [number, number, number] =
    cameraPos ?? [dims.width * 0.5, dims.height * 0.55, dims.depth * 0.95 + 3.4];

  return (
    <Canvas
      className={className}
      style={style}
      shadows
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.1, far: 300, position: camPos }}
      onPointerMissed={editable ? () => onSelect?.(null) : undefined}
    >
      <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
      {cinematic ? <MistReveal near={fogNear} far={fogFar} /> : null}

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
        <ErrorBoundary fallback={<mesh position={[0, 1, 0]}><boxGeometry args={[0.5, 0.5, 0.5]} /><meshBasicMaterial color="#a03226" /></mesh>}>
          <SceneRenderer
            design={design}
            env={env}
            avatars={avatars}
            dims={dims}
            editable={editable}
            selectedIndex={selectedIndex}
            transformMode={transformMode}
            onSelect={onSelect}
            onCommit={onCommit}
          />
        </ErrorBoundary>
      )}

      <ChamberEffects bright={bright} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        target={[0, dims.height * 0.34, -dims.depth * 0.15]}
        minDistance={3}
        maxDistance={dims.width * (design.platforms?.length ? 2.6 : 1.9)}
        maxPolarAngle={Math.PI * 0.52}
        autoRotate={cinematic && !interacted && !editable}
        autoRotateSpeed={0.45}
        onStart={() => setInteracted(true)}
      />
    </Canvas>
  );
}
