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

/** 展區 satellite islands: centre offsets, added in this order. */
const ZONE_ORIGINS: [number, number][] = [
  [16, 1],
  [-16, 1],
  [-12.5, 10],
];
const ZONE_SIZE = { width: 8, depth: 7 };
export const MAX_ZONES = ZONE_ORIGINS.length + 1;

/** per-zone display capacity: the main ring is roomier than a satellite. */
const STILL_CAPS = [10, 6, 6, 6];
const CURIO_CAPS = [4, 2, 2, 2];
const ZONE_STILL_RADIUS = 2.35;
const ZONE_CURIO_RADIUS = 1.9;

/** split items across zones, front-loading evenly but respecting caps. */
function chunkAcrossZones<T>(items: T[], zones: number, caps: number[]): T[][] {
  const out: T[][] = [];
  let idx = 0;
  for (let z = 0; z < zones; z++) {
    const remainingZones = zones - z;
    const take = Math.min(caps[z] ?? 0, Math.ceil((items.length - idx) / remainingZones));
    out.push(items.slice(idx, idx + Math.max(0, take)));
    idx += Math.max(0, take);
  }
  return out;
}

export function buildVaultDesign(
  stills: VaultStillItem[],
  curios: VaultCurioItem[],
  opts?: { bright?: boolean; zones?: number },
): SceneDesign {
  const bright = opts?.bright ?? false;
  const zones = Math.max(1, Math.min(opts?.zones ?? 1, MAX_ZONES));
  const elements: SceneElement[] = [];

  const platforms = ZONE_ORIGINS.slice(0, zones - 1).map(([x, z]) => ({ x, z, ...ZONE_SIZE }));
  const origins: [number, number][] = [[0, 0], ...ZONE_ORIGINS.slice(0, zones - 1)];

  const stillChunks = chunkAcrossZones(stills, zones, STILL_CAPS);
  const curioChunks = chunkAcrossZones(curios, zones, CURIO_CAPS);

  origins.forEach(([ox, oz], zi) => {
    const ring = zi === 0 ? STILL_RADIUS : ZONE_STILL_RADIUS;
    const zoneStills = stillChunks[zi] ?? [];
    const n = zoneStills.length;
    for (let i = 0; i < n; i++) {
      // arc from 36° to 324° (leave the front opening toward the camera)
      const t = n === 1 ? 0.5 : i / (n - 1);
      const theta = ((36 + t * 288) * Math.PI) / 180;
      const x = Math.sin(theta) * ring;
      const z = Math.cos(theta) * ring;
      elements.push({
        kind: 'display_still',
        pos: [ox + x, 0, oz + z],
        yaw: faceCentreYaw(x, z),
        assetUrl: proxyStillUrl(zoneStills[i].url),
        label: zoneStills[i].title,
        params: { key: zoneStills[i].key, subtitle: zoneStills[i].subtitle, phase: zi * 2.3 + i * 0.9 },
      });
    }

    const ringC = zi === 0 ? CURIO_RADIUS : ZONE_CURIO_RADIUS;
    const zoneCurios = curioChunks[zi] ?? [];
    const m = zoneCurios.length;
    for (let i = 0; i < m; i++) {
      const theta = ((120 + i * (360 / Math.max(m, 2))) * Math.PI) / 180;
      const x = Math.sin(theta) * ringC;
      const z = Math.cos(theta) * ringC;
      elements.push({
        kind: 'display_curio',
        pos: [ox + x, 0, oz + z],
        yaw: faceCentreYaw(x, z),
        assetUrl: zoneCurios[i].assetUrl,
        fitHeight: zoneCurios[i].fitHeight,
        tag: zoneCurios[i].tag,
        label: zoneCurios[i].title,
        params: { key: zoneCurios[i].key, subtitle: zoneCurios[i].subtitle, phase: zi * 1.1 + i * 1.7 },
      });
    }
  });

  // user-centric: no character at the heart — only a breath of incense.
  // (The room belongs to the collector's wallet, not to any one character.)
  // Satellite hearts are dressed by VaultScenery's stage-prop vignettes.
  elements.push({ kind: 'incense', pos: [0, 0, 0], scale: 0.9 });

  return {
    backdrop: { style: '藏閣' },
    // 江南水鄉: the mirror floor reads as water — pale celadon shallows by
    // day, deep blue-green night water after dark (not brown lacquer).
    floor: { type: 'lacquer', color: bright ? '#aeb5a4' : '#141a1f' },
    mood: {
      timeOfDay: bright ? 'day' : 'night',
      season: 'spring',
      weather: 'clear',
      atmosphere: bright ? 0.25 : 0.45,
    },
    platforms: platforms.length ? platforms : undefined,
    elements,
  };
}
