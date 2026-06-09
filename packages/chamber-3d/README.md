# @endless-story/chamber-3d

R3F (react-three-fiber) renderer for the **廂房 Chamber** — a floating diorama
of a character's home `Scene`, viewed with an orbit camera. Isolated in its own
package so the heavy Three.js deps don't leak into the rest of the monorepo.

> Reference: 231-Labs [`pavilion`](https://github.com/231-Labs/pavilion). Pavilion
> renders imperatively (a `SceneManager` class); we re-express the parts the
> chamber needs — void background, orbit camera, GLB loading, lighting rig —
> declaratively in R3F. We borrow pavilion's light values + void aesthetic, not
> its class.

## Status

- **Step 1 (scaffold):** `ChamberCanvas` renders a void + `Stars` + lighting
  rig + orbit controls + a **placeholder** diorama (blocky stand-ins). No chain
  reads yet.
- **Step 2:** decode the on-chain `chamber::Furnishing` layout
  (`ChamberPlacement[]`) → place GLB props + 掛軸 quads + character glb.

## Exports

| export | what |
|---|---|
| `ChamberCanvas` | the R3F `<Canvas>` — void, orbit, placeholder diorama |
| `ChamberLights` | declarative lighting rig (ported from pavilion) |
| `ChamberPlacement`, `placementToTransform`, `mmToMeters`, `ORIGIN_MM` | frontend mirror + decode of the on-chain `ObjectPlacement` (offset-encoded mm → metres) |

## Usage (from `@endless-story/web`)

`ChamberCanvas` is a client component (`'use client'`) and needs WebGL, so mount
it via a client-only dynamic import:

```tsx
const ChamberCanvas = dynamic(
  () => import('@endless-story/chamber-3d').then((m) => m.ChamberCanvas),
  { ssr: false },
);
```

The package ships TS source, so `@endless-story/chamber-3d` must be listed in
the web app's `transpilePackages` (next.config.ts).
