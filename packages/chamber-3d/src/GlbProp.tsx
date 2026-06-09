'use client';

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Mesh, Vector3 } from 'three';

/**
 * Loads a `.glb`/`.gltf` prop and normalises it: recenters on X/Z, drops it to
 * the floor (min.y → 0), and scales so its height matches `fitHeight` metres
 * (so kit GLBs with arbitrary native scales all sit correctly). `useGLTF`
 * caches by URL; we clone so each placement is independent.
 */
export function GlbProp({ url, fitHeight }: { url: string; fitHeight?: number }) {
  const { scene } = useGLTF(url);

  const { object, scale } = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    const box = new Box3().setFromObject(clone);
    const center = new Vector3();
    box.getCenter(center);
    const size = new Vector3();
    box.getSize(size);
    // recenter X/Z, sit on floor
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y -= box.min.y;
    const s = fitHeight && size.y > 0 ? fitHeight / size.y : 1;
    return { object: clone, scale: s };
  }, [scene, fitHeight]);

  return (
    <group scale={scale}>
      <primitive object={object} />
    </group>
  );
}
