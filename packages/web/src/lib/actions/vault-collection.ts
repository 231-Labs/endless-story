'use server';

/**
 * Server action — the collector's 展品庫 (exhibit inventory).
 *
 * Returns the raw inventory only; the CLIENT curates: rooms, checkbox
 * selection, AI arrangement and manual transforms all happen client-side over
 * this list (multi-room is a local concept until the on-chain room objects
 * land). Sources today: AI-painted 柳蘇 stage stills (local seeds) + the
 * casts' real Walrus event moments + kit curio stand-ins. Post-deploy this
 * becomes "Stills/curios owned by the wallet" — same shape, real provenance.
 */

import type { Character } from '@endless-story/shared';
import { makeSuiClient, read, isDeployed } from '@endless-story/sdk';
import { charactersApi } from '@/lib/api/index';
import type { VaultCurioItem, VaultStillItem } from '@/lib/chamber/vault-design-build';

export interface VaultInventory {
  stills: VaultStillItem[];
  curios: VaultCurioItem[];
}

interface CacheEntry {
  value: VaultInventory;
  expires: number;
}
const cache = new Map<string, CacheEntry>();
const TTL = 10 * 60 * 1000;

function portraitOf(c: Character | null | undefined): string | undefined {
  const url = c?.gallery?.anchor?.imageUrl;
  return url && url.length > 0 ? url : undefined;
}

async function chainStillsForOwner(owner: string): Promise<VaultStillItem[]> {
  if (!owner.startsWith('0x') || !isDeployed()) return [];
  try {
    const client = makeSuiClient();
    const owned = await read.still.listStillsForOwner(client, owner);
    return owned.map((s) => ({
      key: `chain:${s.stillId}`,
      url: s.imageUrl,
      title: s.title,
      subtitle: `劇照 · 第 ${s.edition} 版`,
    }));
  } catch (err) {
    console.warn('[vault] chain stills read failed:', err);
    return [];
  }
}

export async function getVaultInventory(
  characterId: string,
  force = false,
): Promise<VaultInventory> {
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
    console.warn('[vault] inventory read failed:', err);
  }

  // AI-painted 柳蘇 on-stage stills first (local seeds until minted as Stills)
  const stills: VaultStillItem[] = [
    { key: 'seed:liu_xiaosheng', url: '/chamber/demo-stills/liu_xiaosheng.png', title: '柳生春·許仙扮相', subtitle: '戲妝油彩 · 第 1 版' },
    { key: 'seed:duishi', url: '/chamber/demo-stills/duishi.png', title: '台上眼神戲', subtitle: '劇照 · 第 1 版' },
    { key: 'seed:youhu', url: '/chamber/demo-stills/youhu.png', title: '白蛇傳·遊湖借傘', subtitle: '劇照 · 第 1 版' },
    { key: 'seed:duanqiao', url: '/chamber/demo-stills/duanqiao.png', title: '白蛇傳·斷橋', subtitle: '劇照 · 第 1 版' },
  ];

  const pushMoments = (c: Character) => {
    for (const m of c.gallery?.eventMoments ?? []) {
      if (!m.imageUrl) continue;
      stills.push({
        key: `moment:${m.walrusBlobId || m.imageUrl}`,
        url: m.imageUrl,
        title: `${c.name}之一瞬`,
        subtitle: '劇照 · 第 1 版',
      });
      if (stills.length >= 12) return;
    }
  };
  if (subject) pushMoments(subject);
  for (const c of sagaChars) {
    if (stills.length >= 12) break;
    if (c.id === subject?.id) continue;
    pushMoments(c);
  }
  if (stills.length < 8) {
    for (const c of sagaChars) {
      const url = portraitOf(c);
      if (!url) continue;
      stills.push({ key: `portrait:${c.id}`, url, title: `${c.name}小像`, subtitle: '人物誌 · 設定圖' });
      if (stills.length >= 10) break;
    }
  }

  const curios: VaultCurioItem[] = [
    { key: 'curio:chest', assetUrl: '/chamber/kit/wooden_chest.glb', fitHeight: 0.42, tag: 'chest', title: '檀木匣', subtitle: '珍玩 · 示意' },
    { key: 'curio:vase', assetUrl: '/chamber/kit/vase_static.glb', fitHeight: 0.34, tag: 'vase', title: '素盞', subtitle: '珍玩 · 示意' },
  ];

  // Merge on-chain Stills owned by the collector wallet (when id = address).
  if (characterId.startsWith('0x')) {
    const chainStills = await chainStillsForOwner(characterId);
    const seen = new Set(stills.map((s) => s.key));
    for (const s of chainStills) {
      if (seen.has(s.key)) continue;
      stills.unshift(s);
      seen.add(s.key);
    }
  }

  const value: VaultInventory = { stills, curios };
  cache.set(key, { value, expires: now + TTL });
  return value;
}
