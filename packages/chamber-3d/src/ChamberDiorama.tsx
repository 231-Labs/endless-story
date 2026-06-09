'use client';

import { Suspense } from 'react';
import type { ChamberLayout, ChamberPlacement, RoomDims } from './types.js';
import { PLACEMENT_KIND, placementToTransform } from './types.js';
import { PropPrimitive } from './PropPrimitive.js';
import { GlbProp } from './GlbProp.js';
import { ScrollQuad, FallbackQuad } from './ScrollQuad.js';
import { CharacterAvatar } from './CharacterAvatar.js';
import { ErrorBoundary } from './ErrorBoundary.js';

const GLB_RE = /\.(glb|gltf)(\?|#|$)/i;

/** Well-separated standing spots (self front-centre), scaled to the room. */
function figureSpots(dims: RoomDims): [number, number, number][] {
  const fw = dims.width * 0.24;
  const fz = dims.depth * 0.18;
  return [
    [0, 0, fz],
    [-fw, 0, fz * 0.2],
    [fw, 0, fz * 0.2],
    [0, 0, -fz * 1.4],
  ];
}

/** One placement, positioned by its decoded transform, dispatched by kind. */
function PlacedProp({ p }: { p: ChamberPlacement }) {
  const t = placementToTransform(p);
  const content = renderContent(p);
  return (
    <group position={t.position} rotation={[0, t.rotationY, 0]} scale={t.scale}>
      {content}
    </group>
  );
}

function renderContent(p: ChamberPlacement) {
  // kind 1 — 2D 掛軸 / still
  if (p.kind === PLACEMENT_KIND.SCROLL) {
    if (!p.assetUrl) return <FallbackQuad />;
    return (
      <Suspense fallback={<FallbackQuad />}>
        <ErrorBoundary fallback={<FallbackQuad />}>
          <ScrollQuad url={p.assetUrl} />
        </ErrorBoundary>
      </Suspense>
    );
  }
  // kind 0 — glb prop, with primitive fallback
  if (p.assetUrl && GLB_RE.test(p.assetUrl)) {
    return (
      <Suspense fallback={<PropPrimitive tag={p.tag} />}>
        <ErrorBoundary fallback={<PropPrimitive tag={p.tag} />}>
          <GlbProp url={p.assetUrl} fitHeight={p.fitHeight} />
        </ErrorBoundary>
      </Suspense>
    );
  }
  return <PropPrimitive tag={p.tag} />;
}

/**
 * Renders a full chamber from a `ChamberLayout`: the owner at centre, any
 * co-residents around the floor, and every furnishing placement decoded to its
 * world transform. Sits inside the `ChamberRoom` shell.
 */
export function ChamberDiorama({
  layout,
  dims,
}: {
  layout: ChamberLayout;
  dims: RoomDims;
}) {
  const self = layout.avatars.find((a) => a.isSelf);
  const others = layout.avatars.filter((a) => !a.isSelf);
  // self first, then co-residents; capped + placed in well-separated spots so
  // the billboards don't overlap and the furniture behind them stays visible.
  const figures = [self, ...others].filter(Boolean).slice(0, 4) as typeof layout.avatars;
  const spots = figureSpots(dims);

  return (
    <group>
      {figures.map((a, i) => (
        <group key={a.id} position={spots[i] ?? [0, 0, 0]}>
          <CharacterAvatar isSelf={a.isSelf} portraitUrl={a.portraitUrl} />
        </group>
      ))}

      {layout.placements.map((p, i) => (
        <PlacedProp key={`${p.tag ?? p.kind}:${i}`} p={p} />
      ))}
    </group>
  );
}
