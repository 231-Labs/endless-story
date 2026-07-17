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

## 藏閣 day / night fairyland

The vault scene (`backdrop.style === '藏閣'`) renders as a floating island in
one of two moods, driven by `mood.timeOfDay` (the web UI exposes a 日/夜
toggle):

- **晝 (day)** — `VaultBackdrop tone="day"`: a 青綠山水 dome (mineral ranges,
  gold sun, cloud bands, a distant pagoda + cranes) over a pale waxed-stone
  mirror floor.
- **夜 (night)** — `VaultBackdrop tone="night"`: full moon with layered halo,
  star field + faint 銀河, ink mountain silhouettes over black lacquer.

`VaultScenery` adds the ambience shell around the exhibit ring (never
selectable, never saved in layouts). Hand-built procedural assets in a
江南水鄉 arrangement: a plastered moon-gate wall (「聽雪」plaque) flanked by
curving cloud walls, plum trees with real branch skeletons and instanced
five-petal blossoms, a swoop-roofed 涼亭, bamboo, craggy 太湖石, stone
lanterns — and the water half: a stone arch bridge (the mirror closes the
arch into a full moon), a bobbing 烏篷船, a willow, lotus pads and slow
ripples. Fireflies + moonlight wash the garden after dark; the domes carry
rooftop skylines with 馬頭牆 gables (lit windows at night). Layout keeps
everything between the exhibit ring (r≈5.1) and the walls (r≈9.3) with
clearances checked so no asset interpenetrates another.

**展區 (zones):** `SceneDesign.platforms` floats extra satellite islands
beside the main one (matte slabs — only the main island pays for the
reflector pass). The web layer distributes the collection across zones and
`VaultScenery` dresses each satellite heart with a story-prop vignette from
`StageProps.tsx` — the troupe's 斷橋 set piece on its stage skid (+ the
遊湖借傘 umbrella), the backstage trunks (「春雪社」plaque) with the airing
water-sleeve robe, and 一桌二椅 — linked by floating 雲步石 hop stones.

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
