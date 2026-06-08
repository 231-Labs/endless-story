/**
 * Floor-plan coordinates for the demo saga's scenes — theater (y < 50) /
 * courtyard (y > 50). Shared by SagaTroupeCanvas and CastConstellation.
 * Values are percentages (0-100) so any viewBox can re-project them.
 */
export interface ScenePlanPosition {
  x: number; // 0-100 (%)
  y: number; // 0-100 (%)
}

export const SCENE_POSITIONS: Record<string, ScenePlanPosition> = {
  // theater zone (top half)
  scene_main_stage: { x: 50, y: 25 },
  scene_music_shed: { x: 30, y: 35 },
  scene_backstage: { x: 70, y: 35 },
  scene_trunk_room: { x: 75, y: 48 },
  // courtyard zone (bottom half)
  scene_east_hall: { x: 25, y: 65 },
  scene_courtyard: { x: 50, y: 72 },
  scene_bunk_room: { x: 75, y: 65 },
  scene_accounting: { x: 68, y: 82 },
};
