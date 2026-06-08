import type { BlobRef, Character } from '@endless-story/shared';

export type FeaturedKey = string;

/** A flattened gallery entry the lightbox can page through. */
export interface LightboxItem {
  blob: BlobRef;
  label: string;
}

export function buildSettingImages(gallery: Character['gallery']): BlobRef[] {
  const variants = gallery.variants ?? [];
  const fallback = [gallery.anchor, gallery.costume, gallery.makeup].filter(
    (blob): blob is BlobRef => !!blob?.imageUrl,
  );
  const base = variants.length > 0 ? variants : fallback;
  const out = [...base];
  if (
    gallery.anchor.imageUrl &&
    !out.some((blob) => blob.imageUrl === gallery.anchor.imageUrl)
  ) {
    out.unshift(gallery.anchor);
  }
  const seen = new Set<string>();
  return out
    .filter((blob) => blob.kind !== 'event_moment' && blob.kind !== 'scene_clip')
    .filter((blob) => {
      const key = blobKey(blob);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Landscape kinds (the art sheet + event scene moments). gpt-image only emits
 *  1:1 / 3:2 / 2:3, and these are requested landscape → 1536×1024 = 3:2, so they
 *  get a 3:2 frame (exact fit, no matte) and span 2 grid cells. */
export function isWideBlob(blob: BlobRef): boolean {
  return blob.kind === 'setting_sheet' || blob.kind === 'event_moment';
}

export function blobKey(blob: BlobRef): FeaturedKey {
  if (blob.mediaIndex != null) return `media-${blob.mediaIndex}`;
  if (blob.walrusBlobId) return blob.walrusBlobId;
  return blob.imageUrl;
}

export function defaultBlobLabel(blob: BlobRef, index: number): string {
  if (blob.label) return blob.label;
  if (blob.kind === 'anchor') return index === 0 ? '初始形象' : '封面';
  if (blob.kind === 'setting_sheet') return '設定形象';
  if (blob.kind === 'costume') return '服裝設定';
  if (blob.kind === 'makeup') return '戲妝設定';
  if (blob.kind === 'event_moment') return '事件瞬間';
  return `圖像 ${String(index + 1).padStart(2, '0')}`;
}
