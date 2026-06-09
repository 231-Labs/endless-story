'use server';

/**
 * Server action — the 廂房 room-generation agent.
 *
 * Two paths, both → a `ChamberLayout` the renderer consumes:
 *  - text   (`generateChamberLayout`): GLM (glm-5.1-fw) reads scene/chapters →
 *    Scene Spec → critic loop. The default.
 *  - vision (`generateChamberFromReference`): a multimodal model (glm-4.6v)
 *    *looks at a reference image* and lays out the chamber in its 意境.
 *
 * Both share context loading + Scene-Spec → placements mapping, a process cache,
 * and a deterministic fallback when no LLM key is set.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Character } from '@endless-story/shared';
import type { ChamberAvatar, ChamberLayout, ChamberParams } from '@endless-story/chamber-3d';
import { deriveEnvironment } from '@endless-story/chamber-3d';
import type { SceneSpec } from '@endless-story/llm/prompts';
import { text as llmText, prompts as llmPrompts } from '@endless-story/llm';
import { charactersApi, chaptersApi } from '@/lib/api/index';
import { fetchOnChainScene } from '@/lib/chain/scene-read';
import { catalogForPrompt } from '@/lib/chamber/prop-catalog';
import { deterministicSpec, specToPlacements } from '@/lib/chamber/scene-spec';
import { buildDesign } from '@/lib/chamber/scene-design-build';

export interface GenStep {
  phase: 'sceneSpec' | 'revise' | 'critique' | 'fallback' | 'error' | 'vision' | 'code';
  note: string;
  model?: string;
}

export interface ChamberGeneration {
  layout: ChamberLayout;
  log: GenStep[];
  usedModel?: string;
  roomStyle?: string;
  generatedAt?: number;
  cached?: boolean;
}

const MAX_ITERS = 2;
const STILL_LABELS = ['同台舊照', '章回 key-art', '人物誌設定圖'];
/** Creative Scene Spec model (override via CHAMBER_MODEL). */
const CHAMBER_MODEL = process.env.CHAMBER_MODEL || 'glm-5.1-fw';
/** Faster critique model (glm-5.1-fw is slow ~55s/call). */
const CHAMBER_CRITIC_MODEL = process.env.CHAMBER_CRITIC_MODEL || 'glm-4.7-flash';
/** Vision model that reads the reference image. */
const CHAMBER_VISION_MODEL = process.env.CHAMBER_VISION_MODEL || 'glm-4.6v';
const REF_IMAGE = 'public/chamber/ref/green.jpg';

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

// ── shared context ───────────────────────────────────────────────────

interface ChamberContext {
  subject: Character | null;
  avatars: ChamberAvatar[];
  params: ChamberParams | null;
  sceneId: string | null;
  chapters: string[];
}

async function loadContext(characterId: string): Promise<ChamberContext> {
  let subject: Character | null = null;
  let avatars: ChamberAvatar[] = [];
  let params: ChamberParams | null = null;
  let sceneId: string | null = null;
  let chapters: string[] = [];

  try {
    subject = characterId ? await charactersApi.getCharacter(characterId) : null;
    if (!subject || !portraitOf(subject)) {
      const all = await charactersApi.listCharacters().catch(() => []);
      subject = all.find((c) => portraitOf(c)) ?? all[0] ?? subject;
    }

    const subjectId = subject?.id ?? characterId;
    const name = subject?.name ?? '此角色';
    sceneId = subject?.currentSceneId ?? null;

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
  return { subject, avatars, params, sceneId, chapters };
}

function assemble(
  characterId: string,
  ctx: ChamberContext,
  spec: SceneSpec,
  log: GenStep[],
  usedModel: string | undefined,
  now: number,
): ChamberGeneration {
  const placements = specToPlacements(spec);
  const design = buildDesign(placements, ctx.avatars.length, ctx.params);
  return {
    layout: {
      characterId,
      sceneId: ctx.sceneId,
      avatars: ctx.avatars,
      params: ctx.params,
      env: deriveEnvironment(ctx.params),
      design,
      placements,
    },
    log,
    usedModel,
    roomStyle: spec.room.style,
    generatedAt: now,
    cached: false,
  };
}

// ── text path (default) ──────────────────────────────────────────────

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

  const ctx = await loadContext(characterId);
  const { spec, log, usedModel } = await runAgent({
    name: ctx.subject?.name ?? '此角色',
    role: ctx.subject?.role ?? '',
    personaLine: `${ctx.subject?.role ?? ''}・${(ctx.subject?.description ?? '').slice(0, 100)}`,
    chapters: ctx.chapters,
  });
  const result = assemble(characterId, ctx, spec, log, usedModel, now);
  genCache.set(cacheKey, { value: result, expires: now + CACHE_TTL_MS });
  return result;
}

// ── vision path (reads the reference image) ──────────────────────────

export async function generateChamberFromReference(
  characterId: string,
  force = false,
): Promise<ChamberGeneration> {
  const cacheKey = `${characterId || 'demo'}:vision`;
  const now = Date.now();
  if (!force) {
    const hit = genCache.get(cacheKey);
    if (hit && hit.expires > now) return { ...hit.value, cached: true };
  }

  const ctx = await loadContext(characterId);
  const { spec, log, usedModel } = await runVisionAgent({
    name: ctx.subject?.name ?? '此角色',
    role: ctx.subject?.role ?? '',
  });
  const result = assemble(characterId, ctx, spec, log, usedModel, now);
  genCache.set(cacheKey, { value: result, expires: now + CACHE_TTL_MS });
  return result;
}

// ── code path (EXPERIMENT — GLM writes Three.js) ─────────────────────

export async function generateChamberCode(
  characterId: string,
  force = false,
): Promise<ChamberGeneration> {
  const cacheKey = `${characterId || 'demo'}:code`;
  const now = Date.now();
  if (!force) {
    const hit = genCache.get(cacheKey);
    if (hit && hit.expires > now) return { ...hit.value, cached: true };
  }

  const ctx = await loadContext(characterId);
  const log: GenStep[] = [];
  let code: string | undefined;
  let usedModel: string | undefined;

  try {
    if (!process.env.POE_API_KEY) {
      log.push({ phase: 'fallback', note: '未設定 POE_API_KEY，退回 spec 場景' });
    } else {
      const buf = await readFile(path.join(process.cwd(), REF_IMAGE));
      const imageDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
      const llm = llmText.createTextClient({ kind: 'primary' });
      const prompt = llmPrompts.buildCodeScenePrompt({
        name: ctx.subject?.name ?? '此角色',
        role: ctx.subject?.role ?? '',
        imageDataUrl,
      });
      const res = await llm.chat({
        model: CHAMBER_VISION_MODEL,
        system: prompt.system,
        messages: prompt.messages,
        maxTokens: prompt.maxTokens,
        temperature: 0.6,
      });
      const parsed = llmPrompts.parseCodeResponse(res.text);
      log.push({
        phase: 'code',
        note: parsed
          ? `GLM 寫出場景碼（${parsed.length} 字）`
          : '產出不可用/不安全，退回 spec 場景',
        model: res.model,
      });
      if (parsed) {
        code = parsed;
        usedModel = CHAMBER_VISION_MODEL;
      }
    }
  } catch (err) {
    log.push({ phase: 'error', note: `寫碼失敗：${err instanceof Error ? err.message : String(err)}，退回 spec` });
  }

  const result: ChamberGeneration = {
    layout: {
      characterId,
      sceneId: ctx.sceneId,
      avatars: ctx.avatars,
      params: ctx.params,
      env: deriveEnvironment(ctx.params),
      design: buildDesign([], ctx.avatars.length, ctx.params),
      code,
    },
    log,
    usedModel,
    generatedAt: now,
    cached: false,
  };
  genCache.set(cacheKey, { value: result, expires: now + CACHE_TTL_MS });
  return result;
}

async function runVisionAgent(ctx: {
  name: string;
  role: string;
}): Promise<{ spec: SceneSpec; log: GenStep[]; usedModel?: string }> {
  const log: GenStep[] = [];
  if (!process.env.POE_API_KEY) {
    log.push({ phase: 'fallback', note: '未設定 POE_API_KEY，使用 deterministic 佈局' });
    return { spec: deterministicSpec(), log };
  }
  try {
    const buf = await readFile(path.join(process.cwd(), REF_IMAGE));
    const imageDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
    const llm = llmText.createTextClient({ kind: 'primary' });
    const prompt = llmPrompts.buildVisionScenePrompt({
      name: ctx.name,
      role: ctx.role,
      catalog: catalogForPrompt(),
      imageDataUrl,
    });
    const res = await llm.chat({
      model: CHAMBER_VISION_MODEL,
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: prompt.maxTokens,
      temperature: 0.7,
    });
    const parsed = llmPrompts.parseSceneSpecResponse(res.text);
    log.push({
      phase: 'vision',
      note: parsed ? `看參考圖生成 ${parsed.objects.length} 件物件` : '解析失敗',
      model: res.model,
    });
    if (!parsed) {
      log.push({ phase: 'fallback', note: 'vision 輸出不可用，改用 deterministic 佈局' });
      return { spec: deterministicSpec(), log };
    }
    return { spec: parsed, log, usedModel: CHAMBER_VISION_MODEL };
  } catch (err) {
    log.push({
      phase: 'error',
      note: `vision 失敗：${err instanceof Error ? err.message : String(err)}，改用 deterministic`,
    });
    return { spec: deterministicSpec(), log };
  }
}

// ── text agent (Scene Spec + critic loop) ────────────────────────────

async function runAgent(ctx: {
  name: string;
  role: string;
  personaLine: string;
  chapters: string[];
}): Promise<{ spec: SceneSpec; log: GenStep[]; usedModel?: string }> {
  const log: GenStep[] = [];
  if (!process.env.POE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
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
        model: CHAMBER_MODEL,
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
        model: CHAMBER_CRITIC_MODEL,
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
    return { spec, log, usedModel: CHAMBER_MODEL };
  } catch (err) {
    log.push({
      phase: 'error',
      note: `LLM 失敗：${err instanceof Error ? err.message : String(err)}，改用 deterministic 佈局`,
    });
    return { spec: deterministicSpec(), log };
  }
}
