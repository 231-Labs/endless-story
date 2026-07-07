import type { SceneDesign, SceneElement } from '@endless-story/chamber-3d';

/**
 * 藏閣 layout — orbit slots around the collector: 劇照 on the outer ring
 * (glass plates facing the centre), 珍玩 on the inner ring, the collector's
 * standee at the heart. Slot-based curation keeps the room gallery-grade with
 * zero effort; 自由布局 (transform editing) comes in slice 2.
 */

export interface VaultStillItem {
  /** stable identity (url for now; Still object id post-deploy). */
  key: string;
  url: string;
  title: string;
  subtitle: string;
}

export interface VaultCurioItem {
  key: string;
  assetUrl?: string;
  fitHeight?: number;
  tag?: string;
  title: string;
  subtitle: string;
}

const STILL_RADIUS = 5.1;
const CURIO_RADIUS = 2.5;

/**
 * Route a Walrus still through the same-origin `/api/blob` proxy. The 3D plate
 * uploads the image into a WebGL texture, which (unlike a plain `<img>`) is
 * subject to cross-origin rules — a cross-origin aggregator URL fails to load
 * even when it renders fine in the dossier. The dossier dodges this via
 * next/image (server-side re-serve); the proxy is the same trick for the canvas.
 * Local / seed urls (no `/v1/blobs/`) pass through untouched.
 */
function proxyStillUrl(url?: string): string | undefined {
  if (!url) return url;
  const m = url.match(/\/v1\/blobs\/([^/?#]+)/);
  return m ? `/api/blob/${m[1]}?ct=image/png` : url;
}

/** yaw (deg) so the element's local +z faces the centre from position (x,z). */
function faceCentreYaw(x: number, z: number): number {
  return (Math.atan2(-x, -z) * 180) / Math.PI;
}

export function buildVaultDesign(
  stills: VaultStillItem[],
  curios: VaultCurioItem[],
  opts?: { bright?: boolean },
): SceneDesign {
  const bright = opts?.bright ?? false;
  const elements: SceneElement[] = [];

  // outer ring: 劇照 light shafts, evenly spread, front gap for the camera
  const n = Math.min(stills.length, 10);
  for (let i = 0; i < n; i++) {
    // arc from 36° to 324° (leave the front opening toward the camera)
    const t = n === 1 ? 0.5 : i / (n - 1);
    const theta = ((36 + t * 288) * Math.PI) / 180;
    const x = Math.sin(theta) * STILL_RADIUS;
    const z = Math.cos(theta) * STILL_RADIUS;
    elements.push({
      kind: 'display_still',
      pos: [x, 0, z],
      yaw: faceCentreYaw(x, z),
      assetUrl: proxyStillUrl(stills[i].url),
      label: stills[i].title,
      params: { key: stills[i].key, subtitle: stills[i].subtitle, phase: i * 0.9 },
    });
  }

  // inner ring: 珍玩 plinths flanking the centre
  const m = Math.min(curios.length, 4);
  for (let i = 0; i < m; i++) {
    const theta = ((120 + i * (360 / Math.max(m, 2))) * Math.PI) / 180;
    const x = Math.sin(theta) * CURIO_RADIUS;
    const z = Math.cos(theta) * CURIO_RADIUS;
    elements.push({
      kind: 'display_curio',
      pos: [x, 0, z],
      yaw: faceCentreYaw(x, z),
      assetUrl: curios[i].assetUrl,
      fitHeight: curios[i].fitHeight,
      tag: curios[i].tag,
      label: curios[i].title,
      params: { key: curios[i].key, subtitle: curios[i].subtitle, phase: i * 1.7 },
    });
  }

  // user-centric: no character at the heart — only a breath of incense.
  // (The room belongs to the collector's wallet, not to any one character.)
  elements.push({ kind: 'incense', pos: [0, 0, 0], scale: 0.9 });

  return {
    backdrop: { style: '藏閣' },
    // 明閣 (site day theme): pale waxed stone instead of black lacquer —
    // the reflector material reads it as honed marble under paper light.
    floor: { type: 'lacquer', color: bright ? '#b9b0a0' : undefined },
    mood: {
      timeOfDay: bright ? 'day' : 'night',
      season: 'spring',
      weather: 'clear',
      atmosphere: bright ? 0.25 : 0.45,
    },
    elements,
  };
}
