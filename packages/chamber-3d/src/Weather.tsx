'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Points } from 'three';
import type { RoomDims, Weather as WeatherKind } from './types.js';

interface Bounds {
  x: number;
  yTop: number;
  zMin: number;
  zMax: number;
}

interface FallConfig {
  count: number;
  color: string;
  size: number;
  speed: number;
  drift: number;
  opacity: number;
}

const PRESETS: Record<WeatherKind, FallConfig | null> = {
  clear: { count: 90, color: '#cbb48a', size: 0.03, speed: 0.18, drift: 0.12, opacity: 0.45 },
  snow: { count: 460, color: '#f4f7fb', size: 0.07, speed: 0.55, drift: 0.55, opacity: 0.9 },
  rain: { count: 700, color: '#9fb6cf', size: 0.035, speed: 4.2, drift: 0.05, opacity: 0.5 },
  mist: { count: 140, color: '#cdd6e0', size: 0.5, speed: 0.06, drift: 0.3, opacity: 0.12 },
};

function FallingParticles({
  count,
  color,
  size,
  speed,
  drift,
  opacity,
  bounds,
}: FallConfig & { bounds: Bounds }) {
  const ref = useRef<Points>(null);
  const { array, vel, phase } = useMemo(() => {
    const a = new Float32Array(count * 3);
    const v = new Float32Array(count);
    const p = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      a[i * 3] = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * bounds.x * 2 - bounds.x;
      a[i * 3 + 1] = ((i * 7.13) % 1) * bounds.yTop;
      a[i * 3 + 2] = bounds.zMin + ((i * 3.71) % 1) * (bounds.zMax - bounds.zMin);
      v[i] = 0.6 + ((i * 5.17) % 1) * 0.8;
      p[i] = (i * 2.399) % (Math.PI * 2);
    }
    return { array: a, vel: v, phase: p };
  }, [count, bounds.x, bounds.yTop, bounds.zMin, bounds.zMax]);

  useFrame((_, dt) => {
    const geo = ref.current?.geometry;
    if (!geo) return;
    const pos = geo.attributes.position;
    const t = performance.now() * 0.001;
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) - speed * vel[i] * dt;
      let x = pos.getX(i) + Math.sin(t * 0.8 + phase[i]) * drift * dt;
      if (y < -0.1) {
        y = bounds.yTop;
        x = Math.sin(i + t) * bounds.x;
      }
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[array, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={size}
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

export function Weather({ weather, dims }: { weather: WeatherKind; dims: RoomDims }) {
  const cfg = PRESETS[weather];
  if (!cfg) return null;
  const bounds: Bounds = {
    x: dims.width * 0.6,
    yTop: dims.height + 1,
    zMin: -dims.depth * 0.7,
    zMax: dims.depth * 0.5,
  };
  return <FallingParticles {...cfg} bounds={bounds} />;
}
