import type { Character } from '@endless-story/shared';
import type { VaultCurioItem, VaultStillItem } from './vault-design-build';

/**
 * 戲坊 — each character IP's merch stall on their dossier page.
 *
 * Wares come in two kinds: 劇照 (stage stills from the character's event
 * moments) and 珍玩 (3D mementos — the signature object of their craft:
 * a 小生's folding fan, a 琴師's huqin). Editions follow the still.move
 * ledger model: `set_edition_limit(1)` = 首演原件 (one and only), no limit
 * = 量產版 (open mint). Until redeploy, purchase is demo-local: acquired
 * wares persist in localStorage and surface in the 藏閣 inventory.
 */

export interface ShopWare {
  key: string;
  kind: 'still' | 'curio';
  title: string;
  subtitle: string;
  /** edition limit; null = open edition (量產). */
  limit: number | null;
  priceSui: number;
  /** still preview / texture */
  url?: string;
  /** Walrus moment key for still.move mint (same as url blob when available). */
  walrusBlobId?: string;
  /** Aggregator URL written into Still.image_url on mint. */
  imageUrl?: string;
  /** curio 3D source */
  assetUrl?: string;
  tag?: string;
  fitHeight?: number;
  blurb: string;
}

interface SignatureCraft {
  tag: string;
  name: string;
  blurb: string;
}

/** the signature memento of the character's craft, from role/name keywords. */
function signatureCraft(c: Character): SignatureCraft {
  const hay = `${c.role ?? ''} ${c.name} ${c.description ?? ''}`;
  if (/[琴樂胡笛簫鼓]/.test(hay)) {
    return { tag: 'huqin', name: '胡琴', blurb: '琴筒蒙皮、馬尾弓毛——台下千迴百轉，都從這兩根弦上來。' };
  }
  if (/[生旦伶戲角優]/.test(hay)) {
    return { tag: 'fan', name: '摺扇', blurb: '台上開合之間，一柄扇便是千軍萬馬、半生風月。' };
  }
  return { tag: 'vase', name: '素盞', blurb: '案頭一盞，無紋無款——戲散人歸時，盛一點未涼的月色。' };
}

const CURIO_ASSET: Record<string, { assetUrl?: string; fitHeight?: number }> = {
  vase: { assetUrl: '/chamber/kit/vase_static.glb', fitHeight: 0.34 },
  // fan / huqin render as chamber-3d procedural primitives (no GLB yet)
  fan: { fitHeight: 0.45 },
  huqin: { fitHeight: 0.6 },
};

export function shopWaresFor(character: Character): ShopWare[] {
  const craft = signatureCraft(character);
  const asset = CURIO_ASSET[craft.tag] ?? {};

  // 戲坊 sells the craft 珍玩 only. 劇照 are NOT re-listed here — they are the
  // same event-moment images already shown in 設定集·事件瞬間, so the collect
  // affordance lives on the moment itself (see `stillWareFromBlob`). This
  // keeps each moment in ONE place and avoids the view-here / buy-there dup.
  return [
    // 首演原件 — one and only (edition limit 1 on-chain)
    {
      key: `ware:${character.id}:${craft.tag}:premiere`,
      kind: 'curio',
      title: `${character.name}·首演${craft.name}`,
      subtitle: '首演原件 · 僅此一件',
      limit: 1,
      priceSui: 12,
      tag: craft.tag,
      ...asset,
      blurb: `${craft.blurb} 首演當晚用過的那一件，僅此一件。`,
    },
    // 量產版 — open edition
    {
      key: `ware:${character.id}:${craft.tag}:open`,
      kind: 'curio',
      title: `${character.name}·${craft.name}`,
      subtitle: '量產版 · 不限量',
      limit: null,
      priceSui: 0.8,
      tag: craft.tag,
      ...asset,
      blurb: craft.blurb,
    },
  ];
}

/** 圖種 → 中文標籤(劇照 / 設定圖 / 造型 …)used in titles + subtitles. */
const BLOB_KIND_TAG: Record<string, string> = {
  event_moment: '劇照',
  setting_sheet: '設定圖',
  portrait_variant: '人物誌',
  costume: '造型',
  makeup: '妝容',
  anchor: '定妝',
  scene_clip: '片段',
};

export function blobKindTag(kind?: string): string {
  return (kind && BLOB_KIND_TAG[kind]) || '劇照';
}

/**
 * A collectible Still built from ANY gallery image of a character — an event
 * moment OR a 設定集 sheet (形貌/造型/妝容…). The collect affordance lives on
 * the image card itself, so an image is never duplicated into the 戲坊. Key is
 * scoped by walrus blob so the 藏閣 inventory dedups identically; subtitle/title
 * reflect the image kind.
 */
export function stillWareFromBlob(
  character: Character,
  blob: { kind?: string; imageUrl?: string; walrusBlobId?: string; label?: string },
  index = 0,
): ShopWare {
  const tag = blobKindTag(blob.kind);
  return {
    key: `ware:${character.id}:still:${blob.walrusBlobId || index}`,
    kind: 'still',
    title: blob.label ?? `${character.name}·${tag}`,
    subtitle: `${tag} · 不限量`,
    limit: null,
    priceSui: 0.5,
    url: blob.imageUrl,
    walrusBlobId: blob.walrusBlobId,
    imageUrl: blob.imageUrl,
    blurb:
      blob.kind === 'event_moment'
        ? '一場戲只此一瞬——收進藏閣，它就不散場。'
        : '設定集裡的一幀——收進藏閣，留作私藏。',
  };
}

// ── 購入紀錄 (demo-local until still.move/curio mint goes live) ────────

export interface AcquiredEntry {
  count: number;
  /** snapshot of the ware so the 藏閣 can render it without re-resolving. */
  item: {
    kind: 'still' | 'curio';
    title: string;
    subtitle: string;
    url?: string;
    assetUrl?: string;
    tag?: string;
    fitHeight?: number;
  };
}

export type AcquiredMap = Record<string, AcquiredEntry>;

const ACQUIRED_KEY = 'vault-acquired:v1';

export function loadAcquired(): AcquiredMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ACQUIRED_KEY);
    return raw ? (JSON.parse(raw) as AcquiredMap) : {};
  } catch {
    return {};
  }
}

export function saveAcquired(map: AcquiredMap): void {
  try {
    localStorage.setItem(ACQUIRED_KEY, JSON.stringify(map));
  } catch {
    // storage blocked — session only
  }
}

export function acquireWare(ware: ShopWare): AcquiredMap {
  const map = loadAcquired();
  const prev = map[ware.key]?.count ?? 0;
  if (ware.limit != null && prev >= ware.limit) return map;
  map[ware.key] = {
    count: prev + 1,
    item: {
      kind: ware.kind,
      title: ware.title,
      subtitle: ware.subtitle,
      url: ware.url,
      assetUrl: ware.assetUrl,
      tag: ware.tag,
      fitHeight: ware.fitHeight,
    },
  };
  saveAcquired(map);
  return map;
}

/** acquired wares → 藏閣 inventory items (keys keep the ware identity). */
export function acquiredVaultItems(map: AcquiredMap): {
  stills: VaultStillItem[];
  curios: VaultCurioItem[];
} {
  const stills: VaultStillItem[] = [];
  const curios: VaultCurioItem[] = [];
  for (const [key, entry] of Object.entries(map)) {
    if (entry.count <= 0) continue;
    if (entry.item.kind === 'still' && entry.item.url) {
      stills.push({ key, url: entry.item.url, title: entry.item.title, subtitle: entry.item.subtitle });
    } else if (entry.item.kind === 'curio') {
      curios.push({
        key,
        assetUrl: entry.item.assetUrl,
        fitHeight: entry.item.fitHeight,
        tag: entry.item.tag,
        title: entry.item.title,
        subtitle: entry.item.subtitle,
      });
    }
  }
  return { stills, curios };
}
