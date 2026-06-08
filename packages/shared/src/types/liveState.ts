// Character's current state, projected each tick and shown in the dossier header:
//   intent   ← character LLM's last intent text
//   location ← chain Character.state.current_scene_id + world time
//   nextPlan ← character LLM's daily_plan_hint or next open subgoal
export interface CharacterLiveState {
  intent: string;
  location: string;
  nextPlan: string;
}
