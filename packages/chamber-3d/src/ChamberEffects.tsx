'use client';

import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

/**
 * Post-processing — the "professional finish": Bloom makes the lanterns / lamp /
 * moon bloom, Vignette focuses the eye, AgX tone-mapping gives a filmic,
 * non-clipping colour response. This is the single biggest amateur→pro lever
 * for an R3F scene.
 *
 * `bright` (明閣 day theme): the whole frame sits above a dark-tuned bloom
 * threshold, so bloom must be nearly off or every still washes out like an
 * over-exposed photograph; the vignette lightens too.
 */
export function ChamberEffects({ bright = false }: { bright?: boolean }) {
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        intensity={bright ? 0.18 : 0.5}
        luminanceThreshold={bright ? 0.9 : 0.72}
        luminanceSmoothing={0.25}
        mipmapBlur
      />
      <Vignette offset={0.28} darkness={bright ? 0.32 : 0.55} eskil={false} />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  );
}
