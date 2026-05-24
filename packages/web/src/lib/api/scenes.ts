import type { Scene, SceneClip } from '@endless-story/shared';
import {
  getSceneById,
  listScenesBySaga,
  listTodaySceneClips,
  sceneClips,
} from '@/mocks/scenes';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Scenes API（場所 + 派生視覺片段）
 *
 * 後端對應 endpoints：
 *   GET  /scenes?sagaId={id}                                → Scene[]
 *   GET  /scenes/{id}                                       → Scene | 404
 *   GET  /scene-clips?sagaId={id}                           → SceneClip[]
 *   GET  /scene-clips?sagaId={id}&latest={n}&day={current}  → SceneClip[]
 *
 * 後端應該：
 *   - Scene 物件對應鏈上 Scene（saga 內細節空間）
 *   - Scene.gallery.anchor blob id 對應 Walrus 寫入
 *   - performance 由 saga server 推送（戲台有 OPEN event 時）
 *   - heatProfile / pastEvents / ghostQuotes / derivativeCounts 由 backend 從 memory store 蒸出
 */

// ── Scene 派生視覺片段（video clip）──

export async function listTodayClips(currentDay: number, count = 4): Promise<SceneClip[]> {
  if (USE_MOCK) return listTodaySceneClips(currentDay, count);
  return httpGet<SceneClip[]>('/scene-clips', { query: { day: currentDay, latest: count } });
}

export async function listAllClips(sagaId: string): Promise<SceneClip[]> {
  if (USE_MOCK) return sceneClips.filter((c) => c.sagaId === sagaId);
  return httpGet<SceneClip[]>('/scene-clips', { query: { sagaId } });
}

// ── Scene 實體場所 ──

export async function listScenes(sagaId: string): Promise<Scene[]> {
  if (USE_MOCK) return listScenesBySaga(sagaId);
  return httpGet<Scene[]>('/scenes', { query: { sagaId } });
}

export async function getScene(id: string): Promise<Scene | null> {
  if (USE_MOCK) return getSceneById(id) ?? null;
  try {
    return await httpGet<Scene>(`/scenes/${id}`);
  } catch {
    return null;
  }
}
