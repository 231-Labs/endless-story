import type { SceneClip } from '@endless-story/shared';
import { listTodaySceneClips, sceneClips } from '@/mocks/scenes.js';

export async function listTodayClips(currentDay: number, count = 4): Promise<SceneClip[]> {
  return listTodaySceneClips(currentDay, count);
}

export async function listAllClips(sagaId: string): Promise<SceneClip[]> {
  return sceneClips.filter((c) => c.sagaId === sagaId);
}
