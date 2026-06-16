/**
 * 入科 induction — the step that makes the troupe's SOCIAL WEB autonomous instead
 * of hand-set. Given only the roster (names + 行當 + actor gender), it:
 *   1. DERIVES each member's skills from 行當 (replaces hand-set skill numbers).
 *   2. GENERATES each member's memories + relationships via one LLM call
 *      (replaces hand-authored fixture data) — so "who is moved to create" later
 *      emerges from a web the model invented, not one I pre-wired.
 *
 * Mock (no key): keeps the roster's existing hand-set memories/relationships, but
 * still derives skills — so the structure runs offline. The real autonomy (a
 * generated social web) needs a key. Mirrors the live repo's genesis-memory /
 * 入科 induction step (NARRATIVE_AGENTS §2), just offline.
 */

import { askJson, type Ask } from './llm.ts';
import type { MemoryNote, Mood, Relationship, TroupeMember } from './types.ts';
import type { MemorySource } from './memwal-source.ts';
import { derivedSkills } from './derive-skills.ts';

const MOODS: Mood[] = ['sorrow', 'longing', 'tense', 'joy', 'wrath', 'serene'];

interface WebMember {
  id: string;
  memories?: { text: string; aboutId?: string; mood?: string }[];
  relationships?: { withId: string; kind: string; intensity: number; note?: string }[];
}
interface SocialWeb {
  members: WebMember[];
}

function isSocialWeb(v: unknown): v is SocialWeb {
  return (
    !!v &&
    typeof v === 'object' &&
    Array.isArray((v as SocialWeb).members) &&
    (v as SocialWeb).members.every((m) => m && typeof m.id === 'string')
  );
}

const clampInt = (n: unknown) => Math.max(0, Math.min(100, Math.round(typeof n === 'number' ? n : 0)));
const asMood = (s: unknown): Mood | undefined => (MOODS.includes(s as Mood) ? (s as Mood) : undefined);

export async function induct(
  roster: TroupeMember[],
  premiseHint: string,
  ask: Ask,
  source?: MemorySource,
): Promise<TroupeMember[]> {
  // 1. derive skills from 應工 (primary) — replaces hand-set numbers, on-chain-aligned keys.
  const withSkills = roster.map((m) => ({ ...m, skills: derivedSkills(m.yinggong[0] ?? m.hangdang) }));

  // 2. REAL source first: MemWal accumulated memories/relationships (the truest
  //    source — what the character actually lived). Per-member, graceful. If it
  //    yields anything, it wins; members with none get empty (they truly have
  //    no accumulated memory). If it yields nothing at all (no chainIds/creds),
  //    fall through to generation/fixture.
  if (source) {
    const resolved = await Promise.all(
      withSkills.map(async (m) => {
        try {
          return await source(m);
        } catch {
          return null;
        }
      }),
    );
    if (resolved.some(Boolean)) {
      return withSkills.map((m, i) =>
        resolved[i]
          ? { ...m, memories: resolved[i]!.memories, relationships: resolved[i]!.relationships }
          : { ...m, memories: [], relationships: [] },
      );
    }
  }

  // 3. generate the social web (LLM). Mock → keep the roster's hand-set relations/memories.
  if (ask.mock) return withSkills;

  const ids = new Set(roster.map((m) => m.id));
  const rosterLines = roster
    .map((m) => `${m.id}｜${m.name}（${m.hangdang}/${m.yinggong[0] ?? ''}，${m.actorGender === 'female' ? '坤' : '乾'}伶）`)
    .join('\n');

  const web = await askJson<SocialWeb>(
    ask,
    {
      system:
        `你是春雪社的「入科記」。為以下戲班班底，各自生出 1–2 條成形記憶（有些關於另一位班底）+ 他/她對其他班底的關係` +
        `（kind 例：青梅竹馬／師徒／同台夫妻／暗慕／宿敵／提攜；intensity 0–100）。要有戲、有暗流、彼此呼應，別人人都和睦。` +
        `**只輸出 JSON**：{"members":[{"id":"用下表的 id","memories":[{"text":"…","aboutId":"另一位的 id，可省","mood":"longing|sorrow|tense|joy|wrath|serene"}],` +
        `"relationships":[{"withId":"另一位的 id","kind":"…","intensity":88,"note":"一句"}]}]}。一律繁體中文。班底氣質：${premiseHint}。`,
      user: `班底（id｜名｜行當）：\n${rosterLines}\n\n只輸出 JSON，id/withId/aboutId 一律用上表的 id。`,
      maxTokens: 1800,
      temperature: 0.9,
    },
    () => ({ members: [] }),
    isSocialWeb,
  );

  const byId = new Map(web.members.map((w) => [w.id, w]));
  return withSkills.map((m) => {
    const w = byId.get(m.id);
    if (!w) return m; // no generated entry → keep hand-set (best-effort)
    return {
      ...m,
      memories: (w.memories ?? [])
        .filter((x) => x && typeof x.text === 'string')
        .map((x, i): MemoryNote => ({
          id: `gen_${m.id}_${i}`,
          text: x.text,
          aboutId: x.aboutId && ids.has(x.aboutId) ? x.aboutId : undefined,
          mood: asMood(x.mood),
        })),
      relationships: (w.relationships ?? [])
        .filter((r) => r && ids.has(r.withId) && r.withId !== m.id)
        .map((r): Relationship => ({ withId: r.withId, kind: String(r.kind ?? '相識'), intensity: clampInt(r.intensity), note: r.note })),
    };
  });
}
