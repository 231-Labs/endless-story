/**
 * Vault layout blob — JSON stored on Walrus and anchored via
 * `chamber::save_layout`. ONE PersonalVault per wallet holds MANY named
 * arrangements (佈置) in a single blob; each 佈置 is a shareable view over the
 * wallet's collection. Mirrors the client state in ChamberView so a vault
 * round-trips between localStorage and chain, and any visitor can reproduce a
 * given 佈置 from a link.
 */

export interface VaultLayoutOverride {
  pos: [number, number, number];
  yawDeg: number;
  scale?: number;
}

export interface VaultLayoutProp {
  kind: string;
  pos: [number, number, number];
  yaw?: number;
  scale?: number;
}

export interface VaultLayoutRoom {
  id: string;
  name: string;
  keys: string[];
  overrides: Record<string, VaultLayoutOverride>;
  lights: Record<string, { color: string; intensity: number }>;
  /** 展區 count (1 = main island only); extra zones float new platforms. */
  zones?: number;
  note?: string;
  props?: VaultLayoutProp[];
}

/** Current shape: one vault = many named 佈置, `activeId` is the default view. */
export interface VaultLayoutBlob {
  version: 3;
  activeId: string;
  rooms: VaultLayoutRoom[];
  savedAt: string;
}

/** v1: same multi-room shape (pre-versioning of the field set). */
interface VaultLayoutBlobV1 {
  version: 1;
  activeId: string;
  rooms: VaultLayoutRoom[];
  savedAt?: string;
}
/** v2: the short-lived single-room-per-vault shape. */
interface VaultLayoutBlobV2 {
  version: 2;
  name: string;
  room: VaultLayoutRoom;
  savedAt?: string;
}

export function serializeVaultLayout(state: {
  activeId: string;
  rooms: VaultLayoutRoom[];
}): VaultLayoutBlob {
  return {
    version: 3,
    activeId: state.activeId,
    rooms: state.rooms,
    savedAt: new Date().toISOString(),
  };
}

export function parseVaultLayout(json: unknown): VaultLayoutBlob | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;

  if (o.version === 3 && typeof o.activeId === 'string' && Array.isArray(o.rooms)) {
    return o as unknown as VaultLayoutBlob;
  }

  // v1 → v3: identical multi-room shape, just stamp the version.
  if (o.version === 1 && Array.isArray(o.rooms)) {
    const v1 = o as unknown as VaultLayoutBlobV1;
    return {
      version: 3,
      activeId: v1.activeId || v1.rooms[0]?.id || '',
      rooms: v1.rooms,
      savedAt: v1.savedAt ?? new Date().toISOString(),
    };
  }

  // v2 → v3: wrap the single room into a one-element list.
  if (o.version === 2 && o.room) {
    const v2 = o as unknown as VaultLayoutBlobV2;
    const room = { ...v2.room, name: v2.room.name || v2.name || '佈置一' };
    return {
      version: 3,
      activeId: room.id,
      rooms: [room],
      savedAt: v2.savedAt ?? new Date().toISOString(),
    };
  }

  return null;
}

/** Walrus aggregator URL for a layout blob id (client-safe). */
export function layoutBlobUrl(blobId: string): string {
  const base =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR?.trim()) ||
    'https://aggregator.walrus-testnet.walrus.space';
  return `${base.replace(/\/$/, '')}/v1/blobs/${blobId}`;
}

export async function fetchVaultLayout(blobId: string): Promise<VaultLayoutBlob | null> {
  try {
    const res = await fetch(layoutBlobUrl(blobId));
    if (!res.ok) return null;
    return parseVaultLayout(await res.json());
  } catch {
    return null;
  }
}
