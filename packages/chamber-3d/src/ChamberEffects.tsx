'use client';

import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

/**
 * Post-processing — the "professional finish": Bloom makes the lanterns / lamp /
 * moon bloom, Vignette focuses the eye, AgX tone-mapping gives a filmic,
 * non-clipping colour response. This is the single biggest amateur→pro lever
 * for an R3F scene.
 */
export function ChamberEffects() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        intensity={0.85}
        luminanceThreshold={0.55}
        luminanceSmoothing={0.25}
        mipmapBlur
      />
      <Vignette offset={0.28} darkness={0.62} eskil={false} />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  );
}
