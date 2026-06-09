import * as THREE from 'three';
import type { Object3D, Mesh } from 'three';

/**
 * EXPERIMENT (option 3): run GLM-authored Three.js code `(THREE)=>Group` and
 * return the built Object3D. The code is run via `new Function` with ONLY THREE
 * in scope and `"use strict"` — NOT a real sandbox (it can still reach globals),
 * so this is dev/demo-only. Unsafe tokens are rejected upstream
 * (`parseCodeResponse`); any throw here returns null → caller falls back to the
 * spec-driven scene.
 */
export function buildGroupFromCode(code: string): Object3D | null {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('THREE', `"use strict"; return (${code})(THREE);`);
    const obj = fn(THREE) as Object3D | undefined;
    if (obj && (obj as Object3D).isObject3D) {
      obj.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      return obj;
    }
    return null;
  } catch (err) {
    console.warn('[chamber] generated scene code failed:', err);
    return null;
  }
}
