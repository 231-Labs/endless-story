import type { SceneSpec, SceneSpecObject } from '@endless-story/llm/prompts';
import type { ChamberPlacement } from '@endless-story/chamber-3d';
import { ORIGIN_MM, PLACEMENT_KIND } from '@endless-story/chamber-3d';
import { catalogById, resolveStill } from './prop-catalog';

/** metres (origin = room centre) → offset-encoded millimetres (chain convention). */
const enc = (meters: number): number => Math.round(ORIGIN_MM + meters * 1000);

/** Clamp model-supplied coords to a sane room volume (some models drift). */
const clampXZ = (v: number): number => Math.max(-2.6, Math.min(2.6, v));
const clampY = (v: number): number => Math.max(0, Math.min(3, v));

const TAG_LABEL: Record<string, string> = {
  desk: '書案',
  lamp: '燈架',
  stool: '杌凳',
  chest: '抽屜櫃',
  shelf: '書架',
  vase: '瓶',
  scroll: '掛軸',
};

function propLabel(tag: string): string {
  return TAG_LABEL[tag] ?? tag;
}

function stillLabel(o: SceneSpecObject): string {
  return o.stillRef?.moment ? `掛軸・${o.stillRef.moment}` : '掛軸';
}

/**
 * Resolve a parsed Scene Spec against the catalog into the renderer's
 * `ChamberPlacement[]`. Kind-0 items carry their kit GLB url + fitHeight (the
 * renderer auto-normalises scale); items without a GLB fall back to a primitive.
 */
export function specToPlacements(spec: SceneSpec): ChamberPlacement[] {
  const out: ChamberPlacement[] = [];
  let stillIdx = 0;
  for (const o of spec.objects) {
    const item = catalogById(o.catalogId);
    if (!item) continue;
    const [x, y, z] = o.pos;
    const base = {
      assetBlobId: '',
      sourceObject: null,
      xMm: enc(clampXZ(x)),
      yMm: enc(clampY(y)),
      zMm: enc(clampXZ(z)),
      yawDeg: o.yaw,
      scalePct: o.scale,
    } as const;

    if (item.kind === PLACEMENT_KIND.SCROLL) {
      out.push({
        ...base,
        kind: PLACEMENT_KIND.SCROLL,
        assetUrl: item.assetUrl ?? resolveStill(stillIdx++),
        tag: item.tag,
        label: stillLabel(o),
      });
    } else {
      out.push({
        ...base,
        kind: PLACEMENT_KIND.GLB,
        assetUrl: item.assetUrl, // undefined → primitive fallback
        fitHeight: item.fitHeight,
        tag: item.tag,
        label: propLabel(item.tag),
      });
    }
  }
  return out;
}

/**
 * Deterministic fallback layout (no LLM) — a 書齋 vignette built from the kit,
 * expressed as a Scene Spec so it flows through the same mapper as GLM output.
 * Centre is left clear for the character standee.
 */
export function deterministicSpec(): SceneSpec {
  return {
    room: { style: '民初書齋', palette: ['暗木', '靛藍'], lighting: '昏暗單盞燈' },
    objects: [
      { catalogId: 'writing_desk', pos: [1.35, 0, -0.4], yaw: 200, scale: 100, reason: '案上的茶涼了' },
      { catalogId: 'stool', pos: [1.2, 0, 0.5], yaw: 20, scale: 100, reason: '案前的杌凳' },
      { catalogId: 'oil_lamp', pos: [2.0, 0, -1.1], yaw: 0, scale: 100, reason: '唯餘一盞燈' },
      { catalogId: 'wooden_chest', pos: [-1.7, 0, -0.7], yaw: 35, scale: 100, reason: '舊物收在抽屜櫃' },
      { catalogId: 'vase', pos: [-1.7, 0.9, -0.7], yaw: 0, scale: 100, reason: '櫃上一只素瓶' },
      { catalogId: 'shelf', pos: [-0.3, 0, -2.0], yaw: 0, scale: 100, reason: '靠牆的書架' },
      {
        catalogId: 'scroll_still',
        stillRef: { characters: ['沈月如'], moment: '同台舊照' },
        pos: [-2.0, 1.3, 0.3],
        yaw: 90,
        scale: 100,
        reason: '重新掛回與沈月如同台的舊劇照',
      },
    ],
  };
}
