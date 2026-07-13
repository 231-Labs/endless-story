/** How a narrator came to know a claim, kept separate from whether it is true. */
export type EpistemicMode =
  | 'canonical'
  | 'observed'
  | 'heard'
  | 'inferred'
  | 'remembered'
  | 'dreamed'
  | 'fabricated';

/** How a subjective claim relates to the public, canonical account. */
export type ClaimRelation =
  | 'supports'
  | 'contradicts'
  | 'reinterprets'
  | 'unresolved';

/** Reader-facing review state. This is not a replacement for chain validity. */
export type ClaimReview = 'verified' | 'contested' | 'unresolved';

export interface NarrativeEvidence {
  id: string;
  label: string;
  detail: string;
  visibility: 'public' | 'private';
  /** Optional immutable anchor, such as an event tx digest or blob id. */
  anchor?: string;
}

export interface NarrativeClaim {
  id: string;
  text: string;
  epistemicMode: EpistemicMode;
  relation: ClaimRelation;
  review: ClaimReview;
  evidenceRefs: string[];
}

export interface PerspectivePassage {
  id: string;
  text: string;
  claimIds: string[];
}

export interface NarrativePerspective {
  id: string;
  characterId: string;
  characterName: string;
  role: string;
  portrait: string;
  lead: string;
  passages: PerspectivePassage[];
  claims: NarrativeClaim[];
}

/**
 * A presentation-neutral manifest joining one canonical event to subjective
 * accounts. The canonical head can later be replaced by a real commitment id
 * without changing the reader experience.
 */
export interface EpistemicProvenanceManifest {
  v: 1;
  eventId: string;
  canonHead: string;
  eventTx?: string;
  evidence: NarrativeEvidence[];
  perspectives: NarrativePerspective[];
}
