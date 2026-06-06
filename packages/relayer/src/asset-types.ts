// Walrus 資產服務 — 型別。
//
// 此服務 *獨立* 於 MemWAL relayer(見 docs/WALRUS_ASSETS.md 決策 ⑦)。它管「人工策展、
// 要長存」的 Walrus blob — hero 影片 / 角色圖 / 場景錨 / 章回 — 的上傳·上下架·到期追蹤·續租。
// MemWAL 的「記憶 blob」不在此列(由 runner/MemWal 自管)。
//
// registry 只存最小映射;到期判定 = 我們自己維護的 endEpoch(store/extend 後更新 → 權威值,
// 不會 stale,因為只有本服務會動這些 blob)＋ 列表時即時取的 currentEpoch。

export type AssetCategory = "hero-clip" | "character-image" | "scene-anchor" | "chapter-text";

export type AssetStatus = "live" | "unpublished";

/** registry 一筆。 */
export interface WalrusAsset {
  /** 我們的穩定 id(manifest / 前端引用用,不等於 blobId)。 */
  id: string;
  category: AssetCategory;
  /** 後台顯示名("顧柳爭位 trailer")。 */
  label: string;
  /** content hash — 讀取:`<aggregator>/v1/blobs/:blobId`。 */
  blobId: string;
  /** 鏈上 Blob object — extend / delete 的把手(只有 owner 能動)。 */
  suiObjectId: string;
  contentType: string;
  sizeBytes: number;
  /** 上傳時帶的 flag;true 才能主動刪 blob 回收儲存。 */
  deletable: boolean;
  /** 上/下架:是否出現在對外 manifest(blob 可留可刪)。 */
  status: AssetStatus;
  /** Hybrid 續費:per-asset 覆寫;預設跟 category 預設值走。 */
  autoRenew: boolean;
  /** 目前租到的 epoch(store / extend 後更新)。 */
  endEpoch: number;
  /** 各 category 形狀見 docs/WALRUS_ASSETS.md §3;hero-clip 即 demo-clips.json 一筆的欄位。 */
  meta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** 列表回傳:registry + 即時換算的到期資訊。 */
export interface WalrusAssetView extends WalrusAsset {
  currentEpoch: number | null;
  /** endEpoch − currentEpoch;null = currentEpoch 取不到。 */
  epochsRemaining: number | null;
  /** ISO;null = 無法判定(epoch 時長未知)。 */
  expiresAt: string | null;
  expiringSoon: boolean;
}

export interface CategoryDefault {
  /** 預設租期(epoch 數;實際時長隨網路:testnet ≈ 1 天/epoch,mainnet ≈ 14 天/epoch)。 */
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
