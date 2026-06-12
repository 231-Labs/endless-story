/**
 * Character inspection reads for the Director agent (Showrunner + chat).
 *
 * Read-only aggregation: public profile, persona, relationship graph,
 * survival shadow, and ControlCap-recalled memory snippets. This is what
 * the Showrunner needs to plan without going OOC — distinct from
 * `reconcile_character`, which only backfills missing enrichments.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { fetchOnChainCharacter } from '@/lib/chain/character-read';
import { fetchOnChainPersona } from '@/lib/chain/persona-read';
import {
  fetchOnChainEdgesFrom,
  fetchRelationshipHints,
} from '@/lib/chain/relationships';
import { recallStructuredForCharacter } from '@/lib/chain/memory';
import { getMemoryCount } from '@/lib/chain/memory-counter';
import { buildSagaRoster, type SagaRosterEntry } from '@/lib/chain/roster';
import { fetchOnChainScenesForSaga } from '@/lib/chain/scene-read';
import { getLatestSceneLine } from '@/lib/chain/scene-lines';
import { getWorldTimeSnapshot } from '@/lib/actions/world-time';
import { resolveNetwork } from '@/lib/chain/network';

const SUI_ID_RE = /^0x[0-9a-fA-F]{64}$/;

export interface CharacterRelationshipView {
  otherId: string;
  otherName: string;
  tone: string;
  toneLabel: string;
}

export interface CharacterMemorySnippet {
  kind: string;
  text: string;
}

export interface CharacterDetailSnapshot {
  characterId: string;
  name: string;
  role: string;
  gender: string;
  age: number;
  description: string;
  attributes: {
    constitution: number;
    disposition: number;
    acuity: number;
    appearance: number;
  };
  publicTags: string[];
  currentScene?: { id: string; name: string };
  survival?: {
    funds: number;
    dailyCost: number;
    salary: number;
    daysLeft: number | null;
    level: string;
    vitalityState: string;
  };
  persona?: {
    axes: string[];
    mannerisms: string[];
    boundaries: string[];
  } | null;
  relationships: CharacterRelationshipView[];
  relationshipHints: string[];
  recentMemories: CharacterMemorySnippet[];
  memoryCount?: number | null;
  latestSceneLine?: { speakerName: string; text: string } | null;
  enrichments: {
    hasPersona: boolean;
    hasMemories: boolean;
    gaps: string[];
  };
}

export interface SagaRosterSnapshot {
  sagaId: string;
  day?: number;
  partOfDay?: string;
  members: Array<SagaRosterEntry & { characterId: string }>;
  byScene: Array<{ sceneName: string; sceneId: string; memberNames: string[] }>;
}

function genderLabel(gender: string): string {
  if (gender === 'female') return '女';
  if (gender === 'male') return '男';
  return '中性';
}

/** Resolve character id from object id or a display name (exact, then partial). */
export async function resolveCharacterId(input: {
  characterId?: string;
  name?: string;
}): Promise<{ id: string | null; hint?: string }> {
  const rawId = typeof input.characterId === 'string' ? input.characterId.trim() : '';
  if (SUI_ID_RE.test(rawId)) return { id: rawId };

  const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
  const needle = typeof input.name === 'string' ? input.name.trim() : '';
  if (!sagaId || !needle) {
    return { id: null, hint: '請提供 characterId（0x…）或 name（角色名）' };
  }

  const roster = await buildSagaRoster(sagaId).catch(() => []);
  const exact = roster.find((r) => r.name === needle);
  if (exact) return { id: exact.id };

  const partial = roster.filter(
    (r) => r.name.includes(needle) || needle.includes(r.name),
  );
  if (partial.length === 1) return { id: partial[0]!.id };
  if (partial.length > 1) {
    return {
      id: null,
      hint: `名稱「${needle}」對到多位：${partial.map((r) => r.name).join('、')}，請改用 characterId。`,
    };
  }
  return { id: null, hint: `找不到名為「${needle}」的角色。` };
}

/** Full read snapshot for one character — persona, ties, memories, scene. */
export async function fetchCharacterDetail(
  characterId: string,
  opts: { memoryLimit?: number } = {},
): Promise<CharacterDetailSnapshot | null> {
  const character = await fetchOnChainCharacter(characterId);
  if (!character) return null;

  const sagaId = character.sagaId ?? ENDLESS_STORY_DEPLOYMENT.sagaId ?? '';
  const memoryLimit = Math.max(1, Math.min(opts.memoryLimit ?? 8, 12));

  const [persona, edges, roster, memCount, relationshipHints] = await Promise.all([
    fetchOnChainPersona(characterId),
    fetchOnChainEdgesFrom(characterId),
    sagaId ? buildSagaRoster(sagaId).catch(() => []) : Promise.resolve([]),
    getMemoryCount(characterId).catch(() => null),
    fetchRelationshipHints(characterId, 8).catch(() => []),
  ]);

  const nameById = new Map(roster.map((r) => [r.id, r.name]));
  for (const e of edges) {
    if (!nameById.has(e.toId)) {
      nameById.set(e.toId, await lookupCharacterName(e.toId).catch(() => e.toId.slice(0, 8) + '…'));
    }
  }

  const rosterEntry = roster.find((r) => r.id === characterId);
  const role = rosterEntry?.role && rosterEntry.role !== '—' ? rosterEntry.role : character.role;

  const sceneId = character.currentSceneId ?? rosterEntry?.currentSceneId ?? undefined;
  let sceneName = rosterEntry?.currentSceneName;
  if (sceneId && !sceneName && sagaId) {
    const scenes = await fetchOnChainScenesForSaga(sagaId).catch(() => []);
    sceneName = scenes.find((s) => s.id === sceneId)?.name;
  }

  const [relationshipMemories, recentMemories] = await Promise.all([
    recallStructuredForCharacter(
      characterId,
      '人物印象 關係 牽掛 競爭 戒備 搭檔',
      Math.min(4, memoryLimit),
    ).catch(() => []),
    recallStructuredForCharacter(
      characterId,
      '近期 同場 見聞 對話 張力 受贈 聽見',
      memoryLimit,
    ).catch(() => []),
  ]);

  const seen = new Set<string>();
  const recentMemoriesOut: CharacterMemorySnippet[] = [];
  for (const m of [...relationshipMemories, ...recentMemories]) {
    const key = m.text.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    recentMemoriesOut.push({ kind: m.kind, text: m.text.slice(0, 220) });
    if (recentMemoriesOut.length >= memoryLimit) break;
  }

  let latestSceneLine: CharacterDetailSnapshot['latestSceneLine'] = null;
  if (sceneId) {
    const line = getLatestSceneLine(sceneId);
    if (line) {
      latestSceneLine = {
        speakerName: nameById.get(line.characterId) ?? (await lookupCharacterName(line.characterId)),
        text: line.text,
      };
    }
  }

  const gaps: string[] = [];
  if (!persona) gaps.push('persona');
  if (memCount === 0) gaps.push('memory');
  if (!character.gallery?.anchor?.imageUrl) gaps.push('portrait');

  return {
    characterId,
    name: character.name,
    role,
    gender: genderLabel(character.gender),
    age: character.age,
    description: character.description,
    attributes: character.attributes,
    publicTags: (character.publicTags ?? []).map((t) => t.label),
    currentScene:
      sceneId && sceneName ? { id: sceneId, name: sceneName } : sceneId ? { id: sceneId, name: sceneId.slice(0, 8) + '…' } : undefined,
    survival: character.survival
      ? {
          funds: character.survival.funds,
          dailyCost: character.survival.dailyCost,
          salary: character.survival.salary,
          daysLeft: character.survival.daysLeft,
          level: String(character.survival.level),
          vitalityState: character.survival.vitalityState ?? 'unknown',
        }
      : undefined,
    persona: persona
      ? {
          axes: persona.axes,
          mannerisms: persona.mannerisms,
          boundaries: persona.boundaries,
        }
      : null,
    relationships: edges.map((e) => ({
      otherId: e.toId,
      otherName: nameById.get(e.toId) ?? e.toId.slice(0, 8) + '…',
      tone: e.tone ?? 'neutral',
      toneLabel: e.label,
    })),
    relationshipHints,
    recentMemories: recentMemoriesOut,
    memoryCount: memCount,
    latestSceneLine,
    enrichments: {
      hasPersona: persona != null,
      hasMemories: memCount == null ? false : memCount > 0,
      gaps,
    },
  };
}

/** Roster with scene grouping — answers "全班現在在哪". */
export async function fetchSagaRosterSnapshot(): Promise<SagaRosterSnapshot | null> {
  const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
  if (!sagaId) return null;

  const [members, time] = await Promise.all([
    buildSagaRoster(sagaId).catch(() => []),
    getWorldTimeSnapshot().catch(() => null),
  ]);

  const bySceneMap = new Map<string, { sceneName: string; sceneId: string; memberNames: string[] }>();
  for (const m of members) {
    const sceneName = m.currentSceneName ?? '所在未明';
    const sceneId = m.currentSceneId ?? 'unknown';
    const key = sceneId;
    const bucket = bySceneMap.get(key) ?? { sceneName, sceneId, memberNames: [] };
    bucket.memberNames.push(m.name);
    bySceneMap.set(key, bucket);
  }

  return {
    sagaId,
    day: time?.day,
    partOfDay: time?.partOfDay,
    members: members.map((m) => ({ ...m, characterId: m.id })),
    byScene: [...bySceneMap.values()].sort((a, b) => a.sceneName.localeCompare(b.sceneName, 'zh-Hant')),
  };
}

async function lookupCharacterName(characterId: string): Promise<string> {
  const client = makeSuiClient({ network: resolveNetwork() });
  const res = await read.character.getCharacter(client, characterId);
  return (
    (res.json as { profile?: { name?: string } } | undefined)?.profile?.name ??
    characterId.slice(0, 8) + '…'
  );
}
