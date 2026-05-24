/**
 * 春雪社場景的平面圖座標 — 戲樓 (y < 50) / 院落 (y > 50)。
 * 由 SagaTroupeCanvas 提出，CastConstellation 平面圖也共用同一份。
 * 數值是百分比（0-100），讓不同 viewBox 都能重新投影。
 */
export interface ScenePlanPosition {
  x: number; // 0-100 (%)
  y: number; // 0-100 (%)
}

export const SCENE_POSITIONS: Record<string, ScenePlanPosition> = {
  // 戲樓 zone（上半）
  scene_main_stage: { x: 50, y: 25 },
  scene_music_shed: { x: 30, y: 35 },
  scene_backstage: { x: 70, y: 35 },
  scene_trunk_room: { x: 75, y: 48 },
  // 院落 zone（下半）
  scene_east_hall: { x: 25, y: 65 },
  scene_courtyard: { x: 50, y: 72 },
  scene_bunk_room: { x: 75, y: 65 },
  scene_accounting: { x: 68, y: 82 },
};
