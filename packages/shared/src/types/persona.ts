// Character persona — the semi-permanent personality blueprint that survives any
// chapter. One of three depth layers: persona (who she is, here) / memory / song.
//
// Three single-word dimensions borrowed from opera vocabulary:
//   axes        — core tendencies she keeps in any situation
//   mannerisms  — speech & body tells that identify her
//   boundaries  — the line she won't cross
//
// Re-distilled only on major events (arc end / first chapter / manual), not daily.
export type PersonaRegenTrigger = 'first_run' | 'saga_arc' | 'manual';

export interface CharacterPersona {
  characterId: string;
  axes: string[];
  mannerisms: string[];
  boundaries: string[];
  version: number; // +1 per re-distill
  updatedAt: string;
  lastRegenTrigger?: PersonaRegenTrigger;
  lastRegenChapterId?: string;
}
