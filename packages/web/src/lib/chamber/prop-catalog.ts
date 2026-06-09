import type { CatalogEntryForPrompt } from '@endless-story/llm/prompts';

/**
 * 廂房 prop catalog (doc-07). The GLM agent may only place `id`s from here.
 *
 * Props are a curated CC0 kit — Quaternius "Ultimate House Interior Pack"
 * (CC0 1.0), fetched as GLB and normalised by `GlbProp` (recenter + `fitHeight`
 * auto-scale). See `public/chamber/kit/CREDITS.md`. Items without a GLB fall
 * back to a primitive keyed by `tag`. Object *geometry* is no longer
 * parametric — the parametric layer moved to the environment (lighting / fog /
 * weathering); see `chamber-3d/environment.ts`.
 */
export interface PropCatalogItem {
  id: string;
  /** 0 = glb prop, 1 = 2D 掛軸. */
  kind: 0 | 1;
  type: 'static' | 'still';
  /** renderer primitive hint / styling (fallback when no GLB). */
  tag: string;
  /** kit GLB url (else the renderer uses the primitive). */
  assetUrl?: string;
  /** target height in metres for GLB auto-scale normalisation. */
  fitHeight?: number;
  /** semantic tags for the agent. */
  tags: string[];
}

const KIT = '/chamber/kit';

export const PROP_CATALOG: PropCatalogItem[] = [
  { id: 'writing_desk', kind: 0, type: 'static', tag: 'desk', assetUrl: `${KIT}/writing_desk.glb`, fitHeight: 0.8, tags: ['家具', '書房'] },
  { id: 'oil_lamp', kind: 0, type: 'static', tag: 'lamp', assetUrl: `${KIT}/oil_lamp.glb`, fitHeight: 1.5, tags: ['光源'] },
  { id: 'stool', kind: 0, type: 'static', tag: 'stool', assetUrl: `${KIT}/stool.glb`, fitHeight: 0.5, tags: ['家具'] },
  { id: 'wooden_chest', kind: 0, type: 'static', tag: 'chest', assetUrl: `${KIT}/wooden_chest.glb`, fitHeight: 0.9, tags: ['家具', '收納'] },
  { id: 'shelf', kind: 0, type: 'static', tag: 'shelf', assetUrl: `${KIT}/shelf.glb`, fitHeight: 1.8, tags: ['家具', '收納', '書房'] },
  { id: 'vase', kind: 0, type: 'static', tag: 'vase', assetUrl: `${KIT}/vase_static.glb`, fitHeight: 0.35, tags: ['擺設'] },
  { id: 'scroll_still', kind: 1, type: 'still', tag: 'scroll', assetUrl: '/hero/saga-day.webp', tags: ['掛軸', '劇照'] },
];

/** Image pool for stills until chapter key-art / 人物誌 images are wired. */
export const STILL_POOL = [
  '/hero/saga-night.webp',
  '/hero/saga-day.webp',
  '/ticket-bg/night-2.png',
  '/ticket-bg/day-3.png',
];

export function catalogById(id: string): PropCatalogItem | undefined {
  return PROP_CATALOG.find((c) => c.id === id);
}

/** Flatten the catalog for the LLM prompt (drop urls / kind). */
export function catalogForPrompt(): CatalogEntryForPrompt[] {
  return PROP_CATALOG.map((c) => ({
    id: c.id,
    type: c.type,
    tags: c.tags,
  }));
}

/** Pick a still image deterministically (by index) so reloads are stable. */
export function resolveStill(index: number): string {
  return STILL_POOL[index % STILL_POOL.length];
}
