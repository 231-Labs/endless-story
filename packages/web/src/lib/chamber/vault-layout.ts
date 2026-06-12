/**
 * Vault layout blob — JSON shape stored on Walrus and anchored via
 * `chamber::save_layout`. Mirrors the client-side ArrangementsState in
 * ChamberView so layouts can round-trip between localStorage and chain.
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
  note?: string;
  props?: VaultLayoutProp[];
}

export interface VaultLayoutBlob {
  version: 1;
  activeId: string;
  rooms: VaultLayoutRoom[];
  savedAt: string;
}

export function serializeVaultLayout(state: {
  activeId: string;
  rooms: VaultLayoutRoom[];
}): VaultLayoutBlob {
  return {
    version: 1,
    activeId: state.activeId,
    rooms: state.rooms,
    savedAt: new Date().toISOString(),
  };
}

export function parseVaultLayout(json: unknown): VaultLayoutBlob | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (o.version !== 1 || typeof o.activeId !== 'string' || !Array.isArray(o.rooms)) return null;
  return o as unknown as VaultLayoutBlob;
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
