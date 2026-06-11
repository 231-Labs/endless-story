'use server';

/**
 * Server action — assemble the 藏閣 (collection vault) for a collector.
 *
 * Slice 1 data source: the saga's real narrative imagery — the subject
 * character's (and co-stars') event-moment 劇照 from their on-chain galleries,
 * plus a couple of kit curios as 珍玩 stand-ins. Once `still.move` is deployed
 * and collect-to-mint lands, this swaps to "Stills owned by the wallet" with
 * real titles/editions — same layout, real provenance.
 *
 * No LLM call — the vault loads in seconds.
 */

import type { Character } from '@endless-story/shared';
import type { ChamberLayout } from '@endless-story/chamber-3d';
import { charactersApi } from '@/lib/api/index';
import {
  buildVaultDesign,
  type VaultCurioItem,
  type VaultStillItem,
} from '@/lib/chamber/vault-design-build';

export interface VaultItemRow {
  type: 'still' | 'curio';
  title: string;
  subtitle: string;
}

export interface VaultData {
  layout: ChamberLayout;
  items: VaultItemRow[];
  collectorName: string;
}

interface CacheEntry {
  value: VaultData;
  expires: number;
}
const cache = new Map<string, CacheEntry>();
const TTL = 10 * 60 * 1000;

function portraitOf(c: Character | null | undefined): string | undefined {
  const url = c?.gallery?.anchor?.imageUrl;
  return url && url.length > 0 ? url : undefined;
}

export async function getVaultData(characterId: string, force = false): Promise<VaultData> {
  const key = characterId || 'demo';
  const now = Date.now();
  if (!force) {
    const hit = cache.get(key);
    if (hit && hit.expires > now) return hit.value;
  }

  let subject: Character | null = null;
  let sagaChars: Character[] = [];
  try {
    subject = characterId ? await charactersApi.getCharacter(characterId) : null;
    if (!subject || !portraitOf(subject)) {
      const all = await charactersApi.listCharacters().catch(() => []);
      subject = all.find((c) => portraitOf(c)) ?? all[0] ?? subject;
    }
    if (subject?.sagaId) {
      sagaChars = await charactersApi.listSagaCharacters(subject.sagaId).catch(() => []);
    }
  } catch (err) {
    console.warn('[vault] collection read failed:', err);
  }

  // 劇照: the subject's own moments first, then co-stars' — real Walrus images.
  const stills: VaultStillItem[] = [];
  const pushMoments = (c: Character) => {
    for (const m of c.gallery?.eventMoments ?? []) {
      if (!m.imageUrl) continue;
      stills.push({
        url: m.imageUrl,
        title: `${c.name}之一瞬`,
        subtitle: `劇照 · 第 1 版`,
      });
      if (stills.length >= 10) return;
    }
  };
  if (subject) pushMoments(subject);
  for (const c of sagaChars) {
    if (stills.length >= 10) break;
    if (c.id === subject?.id) continue;
    pushMoments(c);
  }
  // fall back to portraits as 設定圖 plates when no event moments exist yet
  if (stills.length < 4) {
    for (const c of sagaChars) {
      const url = portraitOf(c);
      if (!url) continue;
      stills.push({ url, title: `${c.name}小像`, subtitle: '人物誌 · 設定圖' });
      if (stills.length >= 8) break;
    }
  }

  // 珍玩 stand-ins from the kit (real Stills/curios replace these post-deploy)
  const curios: VaultCurioItem[] = [
    { assetUrl: '/chamber/kit/wooden_chest.glb', fitHeight: 0.42, tag: 'chest', title: '檀木匣', subtitle: '珍玩 · 示意' },
    { assetUrl: '/chamber/kit/vase_static.glb', fitHeight: 0.34, tag: 'vase', title: '素盞', subtitle: '珍玩 · 示意' },
  ];

  const collectorName = subject?.name ?? '無名';
  const layout: ChamberLayout = {
    characterId,
    sceneId: subject?.currentSceneId ?? null,
    avatars: subject
      ? [{ id: subject.id, isSelf: true, name: collectorName, portraitUrl: portraitOf(subject) }]
      : [],
    params: null,
    design: buildVaultDesign(stills, curios, subject ? 1 : 0),
  };

  const items: VaultItemRow[] = [
    ...stills.map((s) => ({ type: 'still' as const, title: s.title, subtitle: s.subtitle })),
    ...curios.map((c) => ({ type: 'curio' as const, title: c.title, subtitle: c.subtitle })),
  ];

  const value: VaultData = { layout, items, collectorName };
  cache.set(key, { value, expires: now + TTL });
  return value;
}
