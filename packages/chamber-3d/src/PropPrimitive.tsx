'use client';

import { Vector2 } from 'three';

/**
 * Catalog primitives — distinct blocky stand-ins for kind-0 props that don't
 * (yet) have a real GLB. Keyed by a `tag` from the prop catalog so a "desk"
 * reads differently from a "lamp". These are the cheap placeholders the build
 * plan calls "佔位 glb"; real GLBs (static kit + Meshy) slot in via `GlbProp`.
 */
export function PropPrimitive({ tag }: { tag?: string }) {
  switch (tag) {
    case 'desk':
      return (
        <group>
          <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
            <boxGeometry args={[1.1, 0.08, 0.6]} />
            <meshStandardMaterial color="#5a4636" roughness={0.8} />
          </mesh>
          {[-0.46, 0.46].map((x) =>
            [-0.22, 0.22].map((z) => (
              <mesh key={`${x}:${z}`} castShadow position={[x, 0.17, z]}>
                <boxGeometry args={[0.07, 0.34, 0.07]} />
                <meshStandardMaterial color="#3b2f2a" roughness={0.85} />
              </mesh>
            )),
          )}
        </group>
      );
    case 'lamp':
      return (
        <group>
          <mesh castShadow position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.12, 0.16, 0.06, 16]} />
            <meshStandardMaterial color="#8a6a2e" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial color="#ffdf9e" emissive="#ffb347" emissiveIntensity={1.1} />
          </mesh>
          <pointLight position={[0, 0.34, 0]} color="#ffcf86" intensity={4} distance={4} decay={2} />
        </group>
      );
    case 'vase':
      return (
        <mesh castShadow position={[0, 0.18, 0]}>
          <latheGeometry
            args={[
              [
                [0.0, 0.0],
                [0.11, 0.02],
                [0.13, 0.12],
                [0.07, 0.28],
                [0.09, 0.36],
              ].map(([x, y]) => new Vector2(x, y)),
              24,
            ]}
          />
          <meshStandardMaterial color="#e9e4da" roughness={0.5} metalness={0.05} />
        </mesh>
      );
    case 'stool':
      return (
        <mesh castShadow position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.2, 0.22, 0.44, 20]} />
          <meshStandardMaterial color="#473b30" roughness={0.85} />
        </mesh>
      );
    default:
      return (
        <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color="#3a3a4a" roughness={0.8} />
        </mesh>
      );
  }
}
