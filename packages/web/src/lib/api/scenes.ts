import type { Scene, SceneClip } from '@endless-story/shared';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getSceneById,
  listScenesBySaga,
  listTodaySceneClips,
  sceneClips,
} from '@/mocks/scenes';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { USE_MOCK } from './config';
import { httpGet } from './http';
import { fetchOnChainScene, fetchOnChainScenesForSaga } from '@/lib/chain/scene-read';

/**
 * Scenes API（場所 + 派生視覺片段）
 *
 * Chain-first for `listScenes(sagaId)` when packageId set: resolves
 * the slug-or-id, reads `Saga.anchor_scene_ids`, batch-fetches each
 * Scene. SceneClip + getScene(id) stay mock until video pipeline lands.
 *
 * Backend HTTP endpoints (legacy, USE_MOCK=false path):
 *   GET  /scenes?sagaId={id}
 *   GET  /scenes/{id}
 *   GET  /scene-clips?sagaId={id}[&latest={n}&day={current}]
 */

function isDeployed(): boolean {
  return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}

// ── Scene 派生視覺片段（video clip）──

export async function listTodayClips(currentDay: number, count = 4): Promise<SceneClip[]> {
  const override = await loadDemoClipOverride();
  if (override.length > 0) return pickTodayClips(override, currentDay, count);
  if (USE_MOCK) return listTodaySceneClips(currentDay, count);
  return httpGet<SceneClip[]>('/scene-clips', { query: { day: currentDay, latest: count } });
}

export async function listAllClips(sagaId: string): Promise<SceneClip[]> {
  const override = await loadDemoClipOverride();
  if (override.length > 0) return override.filter((c) => c.sagaId === sagaId);
  if (USE_MOCK) return sceneClips.filter((c) => c.sagaId === sagaId);
  return httpGet<SceneClip[]>('/scene-clips', { query: { sagaId } });
}

async function loadDemoClipOverride(): Promise<SceneClip[]> {
  const url = process.env.DEMO_CLIPS_URL?.trim();
  if (url) {
    try {
      // 12s, not 5s: the manifest host (Zeabur free tier) cold-starts and can take
      // >5s on the first hit — too tight a timeout drops the real clips and falls
      // back to mock (broken video URLs). Warm requests still return in ~1s.
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (res.ok) return normalizeClips(await res.json());
      console.warn(`[scene-clips] DEMO_CLIPS_URL returned ${res.status} ${res.statusText}`);
    } catch (err) {
      console.warn('[scene-clips] DEMO_CLIPS_URL failed:', err);
    }
  }

  const explicitFile = process.env.DEMO_CLIPS_FILE?.trim();
  const candidates = [
    explicitFile,
    path.join(process.cwd(), 'public', 'demo-clips.json'),
  ].filter((p): p is string => Boolean(p));
  for (const file of candidates) {
    try {
      const raw = await readFile(file, 'utf-8');
      return normalizeClips(JSON.parse(raw));
    } catch (err) {
      if (explicitFile === file) console.warn('[scene-clips] DEMO_CLIPS_FILE failed:', err);
    }
  }
  return [];
}

function normalizeClips(raw: unknown): SceneClip[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { clips?: unknown }).clips)
      ? (raw as { clips: unknown[] }).clips
      : [];
  return rows
    .map((row, index) => normalizeClip(row, index))
    .filter((clip): clip is SceneClip => clip != null);
}

function normalizeClip(row: unknown, index: number): SceneClip | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const videoUrl = text(r.videoUrl);
  const title = text(r.title);
  if (!videoUrl || !title) return null;
  const createdAt = text(r.createdAt) || new Date(0).toISOString();
  return {
    id: text(r.id) || `demo_clip_${index + 1}`,
    sagaId: text(r.sagaId) || ENDLESS_STORY_DEPLOYMENT.sagaId || 'spring-snow',
    sceneId: text(r.sceneId) || undefined,
    chapterId: text(r.chapterId) || undefined,
    day: numberValue(r.day, 1),
    title,
    caption: text(r.caption) || undefined,
    videoUrl,
    thumbnailUrl: text(r.thumbnailUrl) || undefined,
    durationSeconds: numberValue(r.durationSeconds, 15),
    aspect: clipAspect(r.aspect),
    createdAt,
  };
}

function pickTodayClips(clips: SceneClip[], currentDay: number, count: number): SceneClip[] {
  return [...clips]
    .sort((a, b) => Math.abs(a.day - currentDay) - Math.abs(b.day - currentDay) || b.day - a.day)
    .slice(0, count);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clipAspect(value: unknown): SceneClip['aspect'] {
  return value === '16/9' || value === '9/16' || value === '1/1' || value === '4/3' || value === '3/4'
    ? value
    : '16/9';
}

// ── Scene 實體場所 ──

export async function listScenes(sagaId: string): Promise<Scene[]> {
  if (isDeployed()) {
    const onChain = await fetchOnChainScenesForSaga(sagaId);
    if (onChain.length > 0) return onChain;
    // Empty chain result for a deployed saga: still fall through so
    // demo slugs (spring-snow) keep showing the mock troupe until the
    // chain has scenes anchored.
  }
  if (USE_MOCK) return listScenesBySaga(sagaId);
  return httpGet<Scene[]>('/scenes', { query: { sagaId } });
}

export async function getScene(id: string): Promise<Scene | null> {
  // Chain-first when packageId is set + id looks like a Sui object id.
  // Falls through to mock for demo slug ids (`backstage` etc.).
  if (ENDLESS_STORY_DEPLOYMENT.packageId && /^0x[0-9a-fA-F]{64}$/.test(id)) {
    const chain = await fetchOnChainScene(id);
    if (chain) return chain;
  }
  if (USE_MOCK) return getSceneById(id) ?? null;
  try {
    return await httpGet<Scene>(`/scenes/${id}`);
  } catch {
    return null;
  }
}
