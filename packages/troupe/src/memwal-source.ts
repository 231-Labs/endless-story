/**
 * MemWal memory source — the real, accumulated relationships/memories, as a
 * pluggable source for `induct()`. Follows the repo's own MemWal idiom (land it
 * gated + graceful, it "lights up the moment creds arrive"; see web's memory.ts).
 *
 * Reuses web's PRODUCTION read path (no reimplementing SEAL/recall/SDK):
 *   - recallStructuredForCharacter — three-factor recall of a char's memories
 *   - fetchOnChainEdgesFrom        — public RelationshipSeeded edges
 *   - isMemoryConfigured / toneLabel
 *
 * Gating (so the offline harness stays zero-dep, runnable under `node`):
 *   - a member with NO `chainId` → returns null immediately, NOTHING imported.
 *   - the heavy server-only readers (which pull @endless-story/memwal + sdk +
 *     SEAL/Walrus) are loaded LAZILY, only when a real chainId is present.
 *
 * To actually read real data you need: `--memwal` mode run under **tsx** (the
 * web readers use `.js` relative imports), `pnpm install`, MemWal creds in env
 * (MEMWAL_PRIVATE_KEY / MEMWAL_ACCOUNT_ID / SUI_ADMIN_PRIVATE_KEY / OPENAI_API_KEY),
 * and roster members carrying their real on-chain Character object id in `chainId`.
 * The harness fixture has no chainId → this source returns null → induct falls back.
 */

import type { MemoryNote, Relationship, TroupeMember } from './types.ts';

export type MemorySource = (
  member: TroupeMember,
) => Promise<{ memories: MemoryNote[]; relationships: Relationship[] } | null>;

const RECALL_QUERY = '人物印象 關係 牽掛 競爭 舊事 心結 情份 提攜';

interface MemoryMod {
  isMemoryConfigured(): boolean;
  recallStructuredForCharacter(
    characterId: string,
    query: string,
    limit?: number,
  ): Promise<{ text: string; kind: string; importance: number; day?: number }[]>;
}
interface RelMod {
  fetchOnChainEdgesFrom(characterId: string): Promise<
    { toId: string; tone?: string; weight: number; label: string; summary?: string }[]
  >;
  toneLabel(tone: string): string;
}

/**
 * Build a MemorySource over a roster. Translates on-chain relationship targets
 * (toId = a Character object id) back to the harness member id via the roster's
 * chainId map, so `withId` lines up with the harness troupe.
 */
export function makeMemwalSource(roster: TroupeMember[]): MemorySource {
  const chainToId = new Map(roster.filter((m) => m.chainId).map((m) => [m.chainId!, m.id]));
  let mem: MemoryMod | null = null;
  let rel: RelMod | null = null;

  return async (member) => {
    if (!member.chainId) return null; // synthetic fixture id → no MemWal; stay offline.

    if (!mem) mem = (await import('../../web/src/lib/chain/memory.ts')) as unknown as MemoryMod;
    if (!mem.isMemoryConfigured()) return null; // creds not set yet → graceful no-op.
    if (!rel) rel = (await import('../../web/src/lib/chain/relationships.ts')) as unknown as RelMod;

    const [recalled, edges] = await Promise.all([
      mem.recallStructuredForCharacter(member.chainId, RECALL_QUERY, 8).catch(() => []),
      rel.fetchOnChainEdgesFrom(member.chainId).catch(() => []),
    ]);

    const memories: MemoryNote[] = recalled.map((r, i) => ({ id: `mw_${member.id}_${i}`, text: r.text }));
    const relationships: Relationship[] = edges.map((e) => ({
      withId: chainToId.get(e.toId) ?? e.toId,
      kind: e.tone ? rel!.toneLabel(e.tone) : e.label || '相識',
      intensity: Math.max(0, Math.min(100, Math.round((e.weight ?? 0) * 10))), // edge weight 0–10 → 0–100
      note: e.summary || e.label,
    }));

    // genuinely no accumulated memory/relationship → null, so induct can fall back.
    if (memories.length === 0 && relationships.length === 0) return null;
    return { memories, relationships };
  };
}
