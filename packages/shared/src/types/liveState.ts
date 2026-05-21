/**
 * 角色當下狀態 — 對應舊版 runner perception 投影出的「她現在 / 她在哪 / 她下一步」。
 *
 * UI 在 dossier header sticky banner 顯示。資料源每 tick 重算：
 *   - intent      ← character LLM 的 last intent 文字
 *   - location    ← chain 上 Character.state.current_scene_id + 世界時間
 *   - nextPlan    ← character LLM 的 plan.daily_plan_hint 或 next open_subgoal
 */
export interface CharacterLiveState {
  intent: string;
  location: string;
  nextPlan: string;
}
