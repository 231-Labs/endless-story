// Walrus asset service — types.
//
// This service is independent of the MemWAL relayer (see docs/WALRUS_ASSETS.md
// decision ⑦). It manages human-curated, long-lived Walrus blobs — hero video /
// portraits / scene anchors / chapters — covering upload, publish state, expiry
// tracking, and renewal. MemWAL "memory blobs" are not in scope (runner/MemWal owns those).
//
// The registry stores a minimal mapping; expiry = our own endEpoch (authoritative,
// updated after store/extend, never stale since only this service touches these blobs)
// plus the currentEpoch fetched at list time.

export type AssetCategory = "hero-clip" | "character-image" | "scene-anchor" | "chapter-text";

export type AssetStatus = "live" | "unpublished";

export interface WalrusAsset {
  // Our stable id (for the manifest / frontend refs); not the blobId.
  id: string;
  category: AssetCategory;
  label: string;
  // Content hash — read at `<aggregator>/v1/blobs/:blobId`.
  blobId: string;
  // On-chain Blob object — the handle for extend / delete (owner only).
  suiObjectId: string;
  contentType: string;
  sizeBytes: number;
  // Set at upload; must be true to delete the blob and reclaim storage.
  deletable: boolean;
  // Publish state: whether it appears in the public manifest (blob may stay or go).
  status: AssetStatus;
  // Hybrid renewal: per-asset override; defaults to the category default.
  autoRenew: boolean;
  // Epoch the lease currently runs to (updated after store / extend).
  endEpoch: number;
  // Per-category shape in docs/WALRUS_ASSETS.md §3; hero-clip = one demo-clips.json entry.
  meta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// List response: registry rows plus derived expiry info.
export interface WalrusAssetView extends WalrusAsset {
  currentEpoch: number | null;
  // endEpoch − currentEpoch; null when currentEpoch is unavailable.
  epochsRemaining: number | null;
  // ISO; null when undeterminable (epoch duration unknown).
  expiresAt: string | null;
  expiringSoon: boolean;
}

export interface CategoryDefault {
  // Default lease (epoch count); real duration varies by network: testnet ≈ 1 day/epoch,
  // mainnet ≈ 14 days/epoch.
  epochs: number;
  autoRenew: boolean;
  deletable: boolean;
}

export const CATEGORY_DEFAULTS: Record<AssetCategory, CategoryDefault> = {
  "hero-clip": { epochs: 30, autoRenew: false, deletable: true },
  "character-image": { epochs: 53, autoRenew: true, deletable: false },
  "scene-anchor": { epochs: 53, autoRenew: true, deletable: false },
  "chapter-text": { epochs: 53, autoRenew: true, deletable: false },
};

export const ASSET_CATEGORIES: AssetCategory[] = [
  "hero-clip",
  "character-image",
  "scene-anchor",
  "chapter-text",
];

export function isAssetCategory(v: unknown): v is AssetCategory {
  return typeof v === "string" && (ASSET_CATEGORIES as string[]).includes(v);
}
