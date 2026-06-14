// Character appearance — a distilled, evolving 形貌 description (face / build /
// bearing / distinguishing marks), the prose caption for the character's anchor
// portrait. Generated at mint and stored OFF-CHAIN on the content road (Walrus
// blob + `commitment::commit`, own subject namespace), exactly like persona.
//
// Why off-chain + versioned: appearance MUTATES (aging life-stage, stage makeup,
// portrait evolution), so it doesn't belong in the lean on-chain `physical_facts`
// identity anchor. Re-distilled on portrait evolution (version++ → new commitment;
// read takes the latest), which naturally records an appearance timeline.
export type AppearanceRegenTrigger = 'first_run' | 'portrait_evolve' | 'saga_arc' | 'manual';

export interface CharacterAppearance {
  characterId: string;
  /** Rich 形貌 prose — current look, 2–4 sentences in the saga register. */
  description: string;
  version: number; // +1 per re-distill
  updatedAt: string;
  lastRegenTrigger?: AppearanceRegenTrigger;
  lastRegenChapterId?: string;
}
