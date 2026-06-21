import type { Visibility } from './common';

/**
 * Verifiable provenance for a POV chapter: which on-chain event it narrates.
 * Embedded in the anchored Walrus blob (so it's immutable + chain-anchored),
 * letting any article OR derived video prove the event really happened on-chain,
 * and group every character's angle on the SAME event.
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

/**
 * Two-tier chapter model (see docs/narrative/CONTENT_PIPELINE.md §2).
 *   - `pov`: raw material — one character's first-person angle on one event.
 *     The "follow my character" feed + future character-PV source. NOT the
 *     canonical chapter surfaced as a "回".
 *   - `event_cut`: the product — all POVs of the SAME event woven into one
 *     multi-perspective chapter. This IS the canonical "章回".
 */
export type ChapterKind = 'pov' | 'event_cut';

export interface Chapter {
  id: string;
  sagaId: string;
  day: number;
  title: string;
  body: string;
  /** Which tier this chapter is (defaults to 'pov' for legacy data). */
  kind?: ChapterKind;
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
  kind?: 'pov';
  povCharacterId: string;
}

/**
 * Event-cut chapter — the commercial unit. Woven from every POV that shares
 * one on-chain event (`provenance.eventTx`). Keyed by the event, not a single
 * character, so it can be navigated to from the gazette headline and links out
 * to each contributing character's POV.
 */
export interface EventCutChapter extends Chapter {
  kind: 'event_cut';
  /** The on-chain event this cut narrates (commitment subject_id). */
  eventId: string;
  /** Source POV chapters woven into this cut (their Walrus blob ids). */
  sourcePovBlobIds: string[];
  /** Cover still for the cut — the peak-tension beat (see §5). */
  coverStillBlobId?: string;
}
