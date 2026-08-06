// Saga = a troupe/organization. The storyteller holds the cap and has a fiduciary
// duty to its characters. Saga owns scenes / rules / revenue policy / chapter IP;
// character IP (CharacterOwnerNFT) is held by the minting user.
export interface Saga {
  id: string;
  name: string;
  description: string;
  currentDay: number;
  // Set only when an arc has a planned end day; otherwise UI shows "ongoing".
  totalDays?: number;
  castIds: string[];
  premise: string;
  coveredLocationIds?: string[];
  sagaPrompts?: SagaPersistentPrompts;
  revenueConfig?: RevenueConfig;
  metrics?: SagaMetrics;
  worldTime?: SagaWorldTime;
}

// LLM-facing troupe temperament, read during chapter generation.
export interface SagaPersistentPrompts {
  // naturePrompt / rhythmHints are not on-chain; supplied by the storyteller LLM domain.
  naturePrompt?: string;
  rhythmHints?: string;
  // From on-chain Saga.departure_policy.
  departurePolicy: string;
  // Per-saga portrait art direction (on-chain Saga.portrait_tone); falls back to a
  // default ink-wash tone when unset.
  portraitTone?: string;
}

export type DayPart = 'morning' | 'noon' | 'dusk' | 'night';

export interface SagaWorldTime {
  day: number;
  partOfDay: DayPart;
  label?: string;
  weather?: 'clear' | 'rain' | 'snow' | 'wind';
  /** 鏡像時間世界的敘事日期（lib/world-clock 的 StoryDate 投影）；tick 世界缺省。 */
  date?: {
    year: number;
    rocYear: number;
    month: number;
    day: number;
    weekday: number;
  };
}

// Revenue split in basis points; must total 10000.
export interface RevenueConfig {
  ownerBps: number;
  storytellerBps: number;
  treasuryBps: number;
}

export interface SagaMetrics {
  totalChapters: number;
  totalSubscribers: number;
  avgSubsPerCharacter: number;
  treasuryFunds: number;
}

export type RelationshipTone =
  | 'affection'
  | 'romance'
  | 'mentorship'
  | 'rivalry'
  | 'wary'
  | 'tension'
  | 'estrangement'
  | 'acquaintance' // knew each other before the story; current tone undecided
  | 'neutral';

export interface RelationshipEdge {
  fromId: string;
  toId: string;
  weight: number; // 0-10, accumulated strength
  label: string; // short pair-specific label
  lastUpdatedDay: number;
  tone?: RelationshipTone;
  firstSeenDay?: number;
  confidence?: number; // 0-1
  summary?: string; // falls back to label when empty
  /** 'felt' = projected from the character's own wants (inner ground truth);
   *  'lived' / undefined = judged from enacted scenes (chain seeds). */
  origin?: 'felt' | 'lived';
}
