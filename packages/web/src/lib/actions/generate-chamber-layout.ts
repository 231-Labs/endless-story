'use server';

/**
 * Server action — the 廂房 room-generation agent + scene context.
 *
 * 1. Resolves the subject character (real portrait, role, saga). For the
 *    `demo` id, falls back to the first real saga character so the standee /
 *    chapters are real assets, not placeholders.
 * 2. Reads the home Scene (current_character_ids → avatars with real portraits,
 *    params → parametric environment) and recent chapters.
 * 3. GLM (Poe, default GLM-4.6) chooses / places props on the catalog → a Scene
 *    Spec, self-critiques, revises. Falls back to a deterministic layout with no
 *    LLM key.
 * 4. Maps Scene Spec → `ChamberPlacement[]`.
 */

import type { Character } from '@endless-story/shared';
import type { ChamberAvatar, ChamberLayout, ChamberParams } from '@endless-story/chamber-3d';
import { deriveEnvironment } from '@endless-story/chamber-3d';
import type { SceneSpec } from '@endless-story/llm/prompts';
import { text as llmText, prompts as llmPrompts } from '@endless-story/llm';
import { charactersApi, chaptersApi } from '@/lib/api/index';
import { fetchOnChainScene } from '@/lib/chain/scene-read';
import { catalogForPrompt } from '@/lib/chamber/prop-catalog';
import { deterministicSpec, specToPlacements } from '@/lib/chamber/scene-spec';

export interface GenStep {
  phase: 'sceneSpec' | 'revise' | 'critique' | 'fallback' | 'error';
  note: string;
  model?: string;
}

export interface ChamberGeneration {
  layout: ChamberLayout;
  log: GenStep[];
  usedModel?: string;
  roomStyle?: string;
  /** epoch ms when this layout was generated. */
  generatedAt?: number;
  /** true when served from the process cache (no fresh GLM call). */
  cached?: boolean;
}

const MAX_ITERS = 2;
const STILL_LABELS = ['同台舊照', '章回 key-art', '人物誌設定圖'];

/**
 * Process-local generation cache. Room generation is slow (real GLM + the demo
 * character scan can take >1 min), and the layout is stable until the owner
 * regenerates — so cache it and only re-run on `force`. Mirrors the repo's
 * short-TTL chain-read cache pattern; survives within a server process.
 */
interface CacheEntry {
  value: ChamberGeneration;
  expires: number;
}
const genCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = Number(process.env.CHAMBER_GEN_CACHE_TTL_MS ?? 30 * 60 * 1000);

function portraitOf(c: Character | null | undefined): string | undefined {
  const url = c?.gallery?.anchor?.imageUrl;
  return url && url.length > 0 ? url : undefined;
}

export async function generateChamberLayout(
  characterId: string,
  force = false,
): Promise<ChamberGeneration> {
  const cacheKey = characterId || 'demo';
  const now = Date.now();
  if (!force) {
    const hit = genCache.get(cacheKey);
    if (hit && hit.expires > now) return { ...hit.value, cached: true };
  }

  let subject: Character | null = null;
  let avatars: ChamberAvatar[] = [];
  let params: ChamberParams | null = null;
  let sceneId: string | null = null;
  let chapters: string[] = [];

  try {
    subject = characterId ? await charactersApi.getCharacter(characterId) : null;
    // demo / unresolved id → borrow the first real character so portraits +
    // chapters are real assets.
    if (!subject || !portraitOf(subject)) {
      const all = await charactersApi.listCharacters().catch(() => []);
      subject = all.find((c) => portraitOf(c)) ?? all[0] ?? subject;
    }

    const subjectId = subject?.id ?? characterId;
    const name = subject?.name ?? '此角色';
    sceneId = subject?.currentSceneId ?? null;

    // saga character map → portrait + name for every avatar in the scene.
    const portraitById = new Map<string, { name?: string; portraitUrl?: string }>();
    if (subject?.sagaId) {
      const [sagaChars, chs] = await Promise.all([
        charactersApi.listSagaCharacters(subject.sagaId).catch(() => []),
        chaptersApi.listLatestChapters(subject.sagaId, 5).catch(() => []),
      ]);
      for (const c of sagaChars) {
        portraitById.set(c.id, { name: c.name, portraitUrl: portraitOf(c) });
      }
      chapters = chs.map((c) => c.title).filter(Boolean);
    }
    portraitById.set(subjectId, { name, portraitUrl: portraitOf(subject) });

    avatars = [{ id: subjectId, isSelf: true, name, portraitUrl: portraitOf(subject) }];

    if (sceneId) {
      const scene = await fetchOnChainScene(sceneId);
      const ids = scene?.currentCharacterIds ?? [];
      const merged: ChamberAvatar[] = ids.map((id) => {
        const meta = portraitById.get(id);
        return { id, isSelf: id === subjectId, name: meta?.name, portraitUrl: meta?.portraitUrl };
      });
      if (!merged.some((a) => a.isSelf)) {
        merged.unshift({ id: subjectId, isSelf: true, name, portraitUrl: portraitOf(subject) });
      }
      avatars = merged;
      const heat = scene?.heatProfile;
      if (heat) params = { atmosphere: heat.mute, danger: heat.cinnabar, prosperity: heat.jade };
    }
  } catch (err) {
    console.warn('[chamber] context read failed:', err);
  }

  if (avatars.length === 0) avatars = [{ id: characterId || 'demo', isSelf: true }];

  const { spec, log, usedModel } = await runAgent({
    name: subject?.name ?? '此角色',
    role: subject?.role ?? '',
    personaLine: `${subject?.role ?? ''}・${(subject?.description ?? '').slice(0, 100)}`,
    chapters,
  });
  const placements = specToPlacements(spec);
  const env = deriveEnvironment(params);

  const result: ChamberGeneration = {
    layout: { characterId, sceneId, avatars, params, env, placements },
    log,
    usedModel,
    roomStyle: spec.room.style,
    generatedAt: now,
    cached: false,
  };
  genCache.set(cacheKey, { value: result, expires: now + CACHE_TTL_MS });
  return result;
}

async function runAgent(ctx: {
  name: string;
  role: string;
  personaLine: string;
  chapters: string[];
}): Promise<{ spec: SceneSpec; log: GenStep[]; usedModel?: string }> {
  const log: GenStep[] = [];
  const hasKey = !!(process.env.POE_API_KEY || process.env.ANTHROPIC_API_KEY);
  if (!hasKey) {
    log.push({ phase: 'fallback', note: '未設定 LLM API key（POE_API_KEY），使用 deterministic 佈局' });
    return { spec: deterministicSpec(), log };
  }

  try {
    const llm = llmText.createTextClient({ kind: 'primary' });
    const catalog = catalogForPrompt();
    let spec: SceneSpec | null = null;
    let issues: string[] | undefined;

    for (let i = 0; i < MAX_ITERS; i++) {
      const prompt = llmPrompts.buildSceneSpecPrompt({
        name: ctx.name,
        role: ctx.role,
        personaLine: ctx.personaLine,
        chapters: ctx.chapters,
        catalog,
        stills: STILL_LABELS,
        issues,
      });
      const res = await llm.chat({
        model: llm.defaultModel,
        system: prompt.system,
        messages: prompt.messages,
        maxTokens: prompt.maxTokens,
        temperature: 0.8,
      });
      const parsed = llmPrompts.parseSceneSpecResponse(res.text);
      log.push({
        phase: i === 0 ? 'sceneSpec' : 'revise',
        note: parsed ? `生成 ${parsed.objects.length} 件物件` : '解析失敗',
        model: res.model,
      });
      if (!parsed) break;
      spec = parsed;

      const cp = llmPrompts.buildCritiquePrompt({ spec, chapters: ctx.chapters, catalog });
      const cres = await llm.chat({
        model: llm.defaultModel,
        system: cp.system,
        messages: cp.messages,
        maxTokens: cp.maxTokens,
        temperature: 0.3,
      });
      const crit = llmPrompts.parseCritiqueResponse(cres.text);
      log.push({
        phase: 'critique',
        note: crit ? (crit.ok ? '自檢通過' : `需修正：${crit.issues.join('；')}`) : '解析失敗',
      });
      if (!crit || crit.ok) break;
      issues = crit.issues;
    }

    if (!spec) {
      log.push({ phase: 'fallback', note: 'GLM 輸出不可用，改用 deterministic 佈局' });
      return { spec: deterministicSpec(), log };
    }
    return { spec, log, usedModel: llm.defaultModel };
  } catch (err) {
    log.push({
      phase: 'error',
      note: `LLM 失敗：${err instanceof Error ? err.message : String(err)}，改用 deterministic 佈局`,
    });
    return { spec: deterministicSpec(), log };
  }
}
