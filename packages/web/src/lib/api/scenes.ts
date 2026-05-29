import type { Scene, SceneClip } from '@endless-story/shared';
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
  if (USE_MOCK) return listTodaySceneClips(currentDay, count);
  return httpGet<SceneClip[]>('/scene-clips', { query: { day: currentDay, latest: count } });
}

export async function listAllClips(sagaId: string): Promise<SceneClip[]> {
  if (USE_MOCK) return sceneClips.filter((c) => c.sagaId === sagaId);
  return httpGet<SceneClip[]>('/scene-clips', { query: { sagaId } });
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
