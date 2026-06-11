'use client';

import { Suspense } from 'react';
import { Billboard, useTexture } from '@react-three/drei';
import { DoubleSide } from 'three';
import { ErrorBoundary } from './ErrorBoundary.js';
import { CharacterCapsule } from './CharacterCapsule.js';

/**
 * 2D 立牌 — the character's real portrait (Walrus) on an upright quad that
 * billboards toward the camera, on a small flat base. Reads as a standee and
 * stays in the same 2D visual language as the 掛軸, sidestepping the uncanny
 * image-to-3D character problem.
 */
function StandeeImage({ url, height }: { url: string; height: number }) {
  const texture = useTexture(url);
  const img = texture.image as { width?: number; height?: number } | undefined;
  const aspect = img && img.width && img.height ? img.width / img.height : 0.66;
  const w = height * aspect;
  return (
    <mesh position={[0, height / 2, 0]} castShadow>
      <planeGeometry args={[w, height]} />
      {/* unlit so the portrait reads at full colour regardless of the dim
          parametric environment — like a printed 立牌, not a lit surface. */}
      <meshBasicMaterial map={texture} side={DoubleSide} transparent toneMapped={false} />
    </mesh>
  );
}

export function CharacterStandee({
  portraitUrl,
  isSelf,
}: {
  portraitUrl: string;
  isSelf?: boolean;
}) {
  const height = isSelf ? 1.7 : 1.4;
  return (
    <group>
      {/* flat base on the floor (not billboarded) */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.42, 28]} />
        <meshStandardMaterial color={isSelf ? '#3a2e22' : '#26262e'} roughness={0.9} />
      </mesh>
      <Suspense fallback={<CharacterCapsule isSelf={isSelf} />}>
        <ErrorBoundary fallback={<CharacterCapsule isSelf={isSelf} />}>
          <Billboard follow lockX lockZ>
            <StandeeImage url={portraitUrl} height={height} />
          </Billboard>
        </ErrorBoundary>
      </Suspense>
    </group>
  );
}
