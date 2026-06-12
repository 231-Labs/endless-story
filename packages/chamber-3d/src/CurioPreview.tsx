'use client';

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Group } from 'three';
import { PropPrimitive } from './PropPrimitive.js';
import { GlbProp } from './GlbProp.js';
import { ErrorBoundary } from './ErrorBoundary.js';

const GLB_RE = /\.(glb|gltf)(\?|#|$)/i;

function CurioMesh({
  assetUrl,
  tag,
  fitHeight = 0.45,
}: {
  assetUrl?: string;
  tag?: string;
  fitHeight?: number;
}) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.35;
  });
  const isGlb = assetUrl && GLB_RE.test(assetUrl);
  return (
    <group ref={ref} position={[0, -0.18, 0]}>
      {isGlb ? (
        <Suspense fallback={<PropPrimitive tag={tag} />}>
          <ErrorBoundary fallback={<PropPrimitive tag={tag} />}>
            <GlbProp url={assetUrl!} fitHeight={fitHeight} />
          </ErrorBoundary>
        </Suspense>
      ) : (
        <PropPrimitive tag={tag} />
      )}
    </group>
  );
}

/** Compact 3D turntable for 戲坊 curio cards — object only, no plinth. */
export function CurioPreview({
  assetUrl,
  tag,
  fitHeight,
  className,
}: {
  assetUrl?: string;
  tag?: string;
  fitHeight?: number;
  className?: string;
}) {
  return (
    <div className={className ?? 'relative h-full w-full'}>
      <Canvas
        className="!absolute inset-0"
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.2, 1.35], fov: 38, near: 0.1, far: 20 }}
        gl={{ alpha: true, antialias: true }}
      >
        <color attach="background" args={['#0c0b10']} />
        <ambientLight intensity={0.55} color="#dfe6df" />
        <directionalLight position={[2.5, 4, 2]} intensity={0.85} castShadow />
        <pointLight position={[-1.2, 1.5, 0.8]} intensity={0.35} color="#caa64a" />
        <CurioMesh assetUrl={assetUrl} tag={tag} fitHeight={fitHeight} />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={1.4}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
    </div>
  );
}
