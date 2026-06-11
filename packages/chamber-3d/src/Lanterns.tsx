'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Points } from 'three';
import type { RoomDims } from './types.js';

/** One hanging 紅燈籠: cord + glowing body + tassel + an interior warm light. */
function Lantern({ position, ceil }: { position: [number, number, number]; ceil: number }) {
  const [x, y, z] = position;
  return (
    <group position={[x, y, z]}>
      {/* cord up to the ceiling */}
      <mesh position={[0, (ceil - y) / 2, 0]}>
        <cylinderGeometry args={[0.008, 0.008, ceil - y, 6]} />
        <meshStandardMaterial color="#1a1208" />
      </mesh>
      {/* body */}
      <mesh scale={[1, 1.25, 1]} castShadow>
        <sphereGeometry args={[0.17, 20, 16]} />
        <meshStandardMaterial
          color="#b3261d"
          emissive="#ff5a32"
          emissiveIntensity={1.6}
          roughness={0.5}
        />
      </mesh>
      {/* gold caps */}
      <mesh position={[0, 0.21, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 0.05, 12]} />
        <meshStandardMaterial color="#caa64a" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.21, 0]}>
        <cylinderGeometry args={[0.09, 0.07, 0.05, 12]} />
        <meshStandardMaterial color="#caa64a" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* tassel */}
      <mesh position={[0, -0.33, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.16, 6]} />
        <meshStandardMaterial color="#caa64a" emissive="#7a5a1e" emissiveIntensity={0.3} />
      </mesh>
      <pointLight position={[0, 0, 0]} color="#ff9a5a" intensity={3.2} distance={4.5} decay={2} />
    </group>
  );
}

/** Drifting plum petals — 落英, the 春雪社 spring motif. */
function Petals({ dims, count = 40 }: { dims: RoomDims; count?: number }) {
  const ref = useRef<Points>(null);
  const top = dims.height + 0.4;
  const array = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.sin(i * 91.7) * 0.5 + 0.5) * dims.width - dims.width / 2;
      a[i * 3 + 1] = ((i * 6.7) % 1) * top;
      a[i * 3 + 2] = -dims.depth * 0.6 + ((i * 4.3) % 1) * dims.depth;
    }
    return a;
  }, [count, dims.width, dims.depth, top]);

  useFrame((_, dt) => {
    const geo = ref.current?.geometry;
    if (!geo) return;
    const pos = geo.attributes.position;
    const t = performance.now() * 0.001;
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) - 0.22 * dt;
      const x = pos.getX(i) + Math.sin(t * 1.2 + i) * 0.18 * dt;
      if (y < -0.1) y = top;
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[array, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#f3c4d2" size={0.08} transparent opacity={0.85} sizeAttenuation depthWrite={false} />
    </points>
  );
}

export function Lanterns({ dims }: { dims: RoomDims }) {
  const ceil = dims.height;
  const hangY = dims.height - 0.6;
  return (
    <group>
      <Lantern position={[-dims.width * 0.26, hangY, -dims.depth * 0.28]} ceil={ceil} />
      <Lantern position={[dims.width * 0.26, hangY, -dims.depth * 0.28]} ceil={ceil} />
      <Lantern position={[0, dims.height - 0.45, dims.depth * 0.18]} ceil={ceil} />
      <Petals dims={dims} />
    </group>
  );
}
