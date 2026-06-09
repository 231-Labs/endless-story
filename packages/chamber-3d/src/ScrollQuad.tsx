'use client';

import { useTexture } from '@react-three/drei';
import { DoubleSide } from 'three';

/**
 * kind-1 掛軸 / 劇照 — the cheapest "real" asset: an image rendered on a
 * textured quad with a thin frame. The image is a still (人物誌 / 章回 key-art),
 * which is naturally cross-character ("在 A 的房看到 B 的劇照").
 */
export function ScrollQuad({
  url,
  width = 1.0,
  height = 1.4,
}: {
  url: string;
  width?: number;
  height?: number;
}) {
  const texture = useTexture(url);
  return (
    <group>
      {/* frame / mounting */}
      <mesh position={[0, 0, -0.015]}>
        <planeGeometry args={[width + 0.12, height + 0.12]} />
        <meshStandardMaterial color="#2a2118" roughness={0.9} side={DoubleSide} />
      </mesh>
      {/* the still */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} roughness={0.85} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** Fallback when a 掛軸 image can't load. */
export function FallbackQuad({ width = 1.0, height = 1.4 }: { width?: number; height?: number }) {
  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color="#15151f" roughness={1} side={DoubleSide} />
    </mesh>
  );
}
