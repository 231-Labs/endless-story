import type { Visibility } from './common';

/**
 * Verifiable provenance for a POV chapter: which on-chain event it narrates.
 * Embedded in the anchored Walrus blob (so it's immutable + chain-anchored),
 * letting any article OR derived video prove「這件事真的在鏈上發生過」and group
 * every character's angle on the SAME event.
 */
export interface ChapterProvenance {
  /** schema version. */
  v: 1;
  /** narrative day. */
  day?: number;
  sceneId?: string;
  sceneName?: string;
  /** kind of on-chain event this chapter narrates, e.g. 'storylet'. */
  eventKind?: string;
  /** event template/key, e.g. 'contention:recording'. */
  eventTemplate?: string;
  /** human-readable incident label. */
  eventLabel?: string;
  /** tx digest of the on-chain event emission (e.g. StoryletOpened) — the proof. */
  eventTx?: string;
  /** POV character id. */
  povCharacterId?: string;
  /** all character ids present in the event / scene this tick. */
  involvedIds?: string[];
}

export interface Chapter {
  id: string;
  sagaId: string;
  day: number;
  title: string;
  body: string;
  mediaType?: 'text' | 'video' | 'gallery';
  videoUrl?: string;
  coverUrl?: string;
  povCharacterId?: string;
  involvedCharacterIds: string[];
  sourceEventId?: string;
  /** Verifiable on-chain event provenance (when the chapter narrates one). */
  provenance?: ChapterProvenance;
  walrusBlobId: string;
  visibility: Visibility;
  createdAt: string;
}

export interface ChapterPOV extends Chapter {
  povCharacterId: string;
}
