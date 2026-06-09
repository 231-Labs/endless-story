'use client';

import { Suspense } from 'react';
import type { CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ChamberLights } from './ChamberLights.js';
import { ChamberDiorama } from './ChamberDiorama.js';
import { ChamberRoom } from './ChamberRoom.js';
import { Decor } from './Decor.js';
import { SkyBackdrop } from './SkyBackdrop.js';
import { Weather } from './Weather.js';
import { Lanterns } from './Lanterns.js';
import { ChamberEffects } from './ChamberEffects.js';
import { deriveEnvironment, deriveRoomDims, paletteForEnv } from './environment.js';
import type { ChamberEnvironment, ChamberLayout } from './types.js';

export interface ChamberCanvasProps {
  className?: string;
  style?: CSSProperties;
  layout?: ChamberLayout;
  envOverride?: Partial<ChamberEnvironment>;
  roomScale?: number;
}

/**
 * The 廂房 — an open 青綠山水 water-court stage: a reflective 水台 mirroring the
 * figures, a free-standing 月洞門 against a painted landscape, bamboo / 太湖石 /
 * 古琴, parametric weather + lighting, post-processing. Inspired by classical
 * Chinese stage design.
 */
export function ChamberCanvas({
  className,
  style,
  layout,
  envOverride,
  roomScale = 1,
}: ChamberCanvasProps) {
  const env: ChamberEnvironment = { ...deriveEnvironment(layout?.params), ...envOverride };
  const palette = paletteForEnv(env);
  const dims = deriveRoomDims(layout?.params, roomScale);
  const dark = env.timeOfDay === 'dusk' || env.timeOfDay === 'night';

  const camPos: [number, number, number] = [
    dims.width * 0.5,
    dims.height * 0.55,
    dims.depth * 0.95 + 3.4,
  ];

  return (
    <Canvas
      className={className}
      style={style}
      shadows
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.1, far: 300, position: camPos }}
    >
      <fog attach="fog" args={[palette.bg, dims.depth * 1.4, dims.depth * 5 + 14]} />

      <SkyBackdrop env={env} />
      <ChamberLights palette={palette} />
      <ChamberRoom env={env} dims={dims} />
      <Decor dims={dims} />
      {dark ? <Lanterns dims={dims} /> : null}
      <Weather weather={env.weather} dims={dims} />

      <Suspense fallback={null}>
        {layout ? <ChamberDiorama layout={layout} dims={dims} /> : null}
      </Suspense>

      <ChamberEffects />

      {/* orbit 觀賞相機 — no first-person / controller / collision */}
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
