import type { Scene, SceneClip } from '@endless-story/shared';
import {
  getSceneById,
  listScenesBySaga,
  listTodaySceneClips,
  sceneClips,
} from '@/mocks/scenes';

// ── Scene 派生視覺片段（video clip）─────────────────────────────────

export async function listTodayClips(currentDay: number, count = 4): Promise<SceneClip[]> {
  return listTodaySceneClips(currentDay, count);
}

export async function listAllClips(sagaId: string): Promise<SceneClip[]> {
  return sceneClips.filter((c) => c.sagaId === sagaId);
}

// ── Scene 實體場所 ─────────────────────────────────────────────────

export async function listScenes(sagaId: string): Promise<Scene[]> {
  return listScenesBySaga(sagaId);
}

export async function getScene(id: string): Promise<Scene | null> {
  return getSceneById(id) ?? null;
}
