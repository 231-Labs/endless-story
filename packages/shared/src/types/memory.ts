// Structured log entry — "what she remembers". One of three depth layers:
// persona (who she is) / memory (what she remembers, here) / song (what she sings now).
//
// kinds: reflection (distilled at sleep tick), observation, event (links to a chapter),
// dream (injected by storyteller), relationship (long-term view of another), heard_memory
// (second-hand, low confidence), claimed_backstory (unverified self-claim),
// artifact (her own writing — future Walrus anchor).
export type CharacterMemoryKind =
  | 'reflection'
  | 'observation'
  | 'event'
  | 'dream'
  | 'relationship'
  | 'heard_memory'
  | 'claimed_backstory'
  | 'artifact';

export type MemoryProvenanceSource =
  | 'self'
  | 'storyteller'
  | 'owner'
  | 'heard_from_character'
  | 'system';

export type MemoryClaimStatus =
  | 'unverified'
  | 'contested'
  | 'corroborated'
  | 'canonical';

export interface MemoryProvenance {
  source: MemoryProvenanceSource;
  // Set when source = heard_from_character; refers to Character.id.
  sourceCharacterId?: string;
  confidence?: number; // 0-1
  claimStatus?: MemoryClaimStatus;
}

export interface CharacterMemory {
  id: string;
  characterId: string;
  kind: CharacterMemoryKind;
  occurredAt: string; // in-story ISO time
  summary: string;
  body: string;
  eventChapterId?: string;
  involvedCharacterIds?: string[];
  importance: number; // 1-10, drives summary font weight
  provenance?: MemoryProvenance; // omit when source = self
}
