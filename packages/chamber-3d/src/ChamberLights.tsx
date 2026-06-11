'use client';

import type { EnvPalette } from './environment.js';

/**
 * Lighting rig, driven by the parametric `EnvPalette` (time-of-day / season /
 * weather / atmosphere). The warm-key + cool-fill + hemisphere structure is
 * ported from 231-Labs `pavilion`; the colours/intensities now come from the
 * environment so the room's light tracks the living world state.
 */
export function ChamberLights({ palette }: { palette: EnvPalette }) {
  return (
    <>
      <ambientLight color={palette.ambientColor} intensity={palette.ambientIntensity} />

      <directionalLight
        color={palette.keyColor}
        intensity={palette.keyIntensity}
        position={palette.keyPos}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.00005}
      />

      <hemisphereLight
        color={palette.hemiSky}
        groundColor={palette.hemiGround}
        intensity={palette.hemiIntensity}
      />

      {/* cool + warm fills for edge definition */}
      <directionalLight color={0x6a90e2} intensity={0.4} position={[-8, 12, -8]} />
      <directionalLight color={0x8a6ae2} intensity={0.3} position={[8, 12, -8]} />
      <directionalLight color={0xffffff} intensity={0.25} position={[0, 25, -15]} />
    </>
  );
}
