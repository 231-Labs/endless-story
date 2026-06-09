'use client';

import { MeshReflectorMaterial } from '@react-three/drei';
import type { ChamberEnvironment, RoomDims } from './types.js';

/**
 * Open water-court stage (山东卫视 reference): a large reflective 水台 that
 * mirrors the figures, with a free-standing 月洞門 framed against the 青綠山水
 * backdrop. Minimal architecture — the backdrop + reflection do the work.
 */
const WATER: Record<string, string> = {
  day: '#3f5a60',
  dawn: '#46545e',
  dusk: '#2a3142',
  night: '#161e2a',
};

const RING: Record<string, string> = {
  day: '#c9d6cf',
  dawn: '#d6c4b2',
  dusk: '#5a5468',
  night: '#33414e',
};

export function ChamberRoom({ env, dims }: { env: ChamberEnvironment; dims: RoomDims }) {
  const HALF_W = dims.width / 2;
  const BACK_Z = -dims.depth * 0.7;
  const FRONT_Z = dims.depth * 0.5;
  const midZ = (BACK_Z + FRONT_Z) / 2;

  const moonR = Math.min(dims.width, dims.height) * 0.34;
  const moonCY = moonR + 0.25;

  const water = WATER[env.timeOfDay] ?? WATER.day;
  const ring = RING[env.timeOfDay] ?? RING.day;

  return (
    <group>
      {/* reflective 水台 — extends wide and back so the reflection fills the scene */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, midZ]}>
        <planeGeometry args={[dims.width * 2.6, (FRONT_Z - BACK_Z) * 1.8]} />
        <MeshReflectorMaterial
          resolution={512}
          blur={[420, 180]}
          mixBlur={1.1}
          mixStrength={2.4}
          roughness={0.75}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.3}
          color={water}
          metalness={0.55}
        />
      </mesh>

      {/* free-standing 月洞門 at the back, framed against the painted mountains */}
      <group position={[0, 0, BACK_Z]}>
        <mesh position={[0, moonCY, 0]} castShadow>
          <torusGeometry args={[moonR, 0.13, 18, 64]} />
          <meshStandardMaterial color={ring} roughness={0.5} metalness={0.12} />
        </mesh>
        {/* low base the gate rests on */}
        <mesh position={[0, 0.16, 0]}>
          <boxGeometry args={[dims.width * 0.92, 0.32, 0.18]} />
          <meshStandardMaterial color={ring} roughness={0.8} metalness={0.05} />
        </mesh>
      </group>
    </group>
  );
}
