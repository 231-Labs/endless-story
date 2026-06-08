import type { CharacterMemory, CharacterMemoryKind } from '@endless-story/shared';
import { listMemoriesByCharacter } from '@/mocks/memories';
import { getCharacter } from './characters';
import { USE_MOCK } from './config';
import { httpGet } from './http';
import {
  isMemoryConfigured,
  recallStructuredForCharacter,
  type RecalledMemory,
} from '@/lib/chain/memory';

/**
 * Memories API（owner-only journal）
 *
 * Chain-first: when MemWal is configured, surface the character's REAL
 * encrypted memories (recalled + importance re-ranked) so the dossier
 * MemoriesTab shows what she actually remembers — not mock data. Falls
 * back to mock / http when MemWal isn't configured.
 *
 * Owner gate kept: non-owner viewers get []. (Recall itself uses the
 * saga ControlCap server-side; the result is only handed to the owner.)
 */

/** Map a MemWal memory kind → the UI CharacterMemory kind. */
const KIND_MAP: Record<string, CharacterMemoryKind> = {
  dream: 'dream',
  reflection: 'reflection',
  chapter: 'event',
  observation: 'observation',
  relationship: 'relationship',
  genesis: 'claimed_backstory',
  unknown: 'observation',
};

function toCharacterMemory(
  m: RecalledMemory,
  characterId: string,
  i: number,
): CharacterMemory {
  const kind = KIND_MAP[m.kind] ?? 'observation';
  const summary = m.text.length > 42 ? m.text.slice(0, 42) + '…' : m.text;
  const source = m.kind === 'dream' ? 'owner' : 'self';
  return {
    id: `memwal-${characterId.slice(0, 8)}-${i}`,
    characterId,
    kind,
    // MemWal recall carries no per-memory timestamp; approximate as now so
    // the UI renders. A future indexer can attach real occurredAt.
    occurredAt: new Date().toISOString(),
    summary,
    body: m.text,
    importance: m.importance,
    provenance: {
      source,
      claimStatus: m.kind === 'genesis' ? 'canonical' : 'unverified',
    },
  };
}

export async function listMemories(
  characterId: string,
  viewerWallet: string | null,
): Promise<CharacterMemory[]> {
  if (!viewerWallet) return [];

  // Chain-first: real MemWal memories for the owner.
  if (isMemoryConfigured()) {
    const character = await getCharacter(characterId).catch(() => null);
    if (!character) return [];
    if (character.nftOwner !== viewerWallet) return [];
    try {
      // Broad evocative query to surface a representative spread; recall
      // re-ranks by importance so dreams / relationships float up.
      const recalled = await recallStructuredForCharacter(
        characterId,
        '記憶 心事 經歷 關係 夢 此刻最在意的事',
        24,
      );
      if (recalled.length > 0) {
        return recalled.map((m, i) => toCharacterMemory(m, characterId, i));
      }
      // Configured but nothing recalled (new character) → empty, not mock.
      return [];
    } catch {
      return [];
    }
  }

  if (USE_MOCK) {
    const character = await getCharacter(characterId);
    if (!character) return [];
    if (character.nftOwner !== viewerWallet) return [];
    return listMemoriesByCharacter(characterId);
  }

  return httpGet<CharacterMemory[]>('/memories', {
    query: { characterId, viewer: viewerWallet },
  });
}
