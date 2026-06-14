import type { BlobRef, Character, Gender } from '@endless-story/shared';

export type FeaturedKey = string;

const GENDER_LABEL: Record<Gender, string> = { female: '女', male: '男', other: '中性' };

/**
 * Compose a meaningful 形貌 line from the structured facts the mint pipeline
 * actually produces. The on-chain `physical_facts` only carries
 * gender / age / body(enum) + an appearance 0-100 stat — the old 外貌設定 block
 * rendered just the bare body word ("勻稱"), dropping gender + age entirely, so
 * it read as nearly empty. Here we surface ALL of it. Rich hand-written
 * `physicalFacts` (mock fixtures, or a future generated 形貌 description) passes
 * through verbatim as `prose`.
 *
 * Note: the *rich* appearance prose generated at mint lives inside
 * `character.description` (shown as 敘描) — there is no separate stored visual
 * description, and the portrait-curation prompt (≤90 chars) is not persisted.
 */
export function appearanceSummary(c: Character): { facts: string; prose: string | null } {
  const pf = (c.physicalFacts ?? '').trim();
  const isProse = pf.length > 0 && pf !== '—' && /[，。、；]/.test(pf);
  // chain gives "species / body" or just "body" — take the last segment as 體態.
  const bodyWord =
    pf && !isProse ? (pf.split('/').map((s) => s.trim()).filter(Boolean).pop() ?? '') : '';

  const parts: string[] = [];
  const g = GENDER_LABEL[c.gender];
  if (g) parts.push(g);
  if (c.age > 0) parts.push(`${c.age} 歲`);
  if (bodyWord && bodyWord !== '—') parts.push(`體態${bodyWord}`);

  // appearance stat → one descriptor, mirroring the portrait-prompt mapping.
  const look = c.attributes?.appearance ?? 50;
  if (look >= 80) parts.push('眉眼明亮、有記憶點');
  else if (look <= 30) parts.push('眉眼清淡');

  return { facts: parts.join(' · ') || '—', prose: isProse ? pf : null };
}

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
