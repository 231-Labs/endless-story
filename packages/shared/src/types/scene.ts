// Scene = a saga's detailed place inside a location (privacy level, who's there,
// link to recent chapter). SceneClip = a derived visual clip of a scene in a chapter.

// Mirrors on-chain Scene.privacy_level: 0 public ... 5 fully private.
export type ScenePrivacyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface ScenePastEvent {
  chapterId: string;
  day: number;
  brief: string;
}

// Emotional heat fingerprint distilled from related memories; axes are relative
// weights, not normalized. cinnabar = inner conflict/desire, jade = observation
// of others, mute = mundane/public.
export interface SceneHeatProfile {
  cinnabar: number;
  jade: number;
  mute: number;
}

export interface SceneDerivativeCounts {
  chapters: number;
  memories: number;
  soulSongs: number;
}

export interface SceneGhostQuote {
  characterId: string;
  text: string;
}

// Persistent visual model mirroring Character.gallery: a permanent Walrus anchor
// is generated once, and every variation (lighting/weather/performance/moment) is
// img2img off that anchor to keep IP consistent.
export interface SceneGallery {
  anchor: import('./common').BlobRef;
  performances?: import('./common').BlobRef[];
  moments?: import('./common').BlobRef[];
}

export interface ScenePerformanceState {
  title: string;
  chapterId?: string;
  startedAt: string;
}

export interface Scene {
  id: string;
  sagaId: string;
  locationId?: string;
  name: string;
  description: string;
  // Handscroll UI coords (% of canvas, 0–100), from on-chain Scene.placement.
  // Mock scenes omit these; chain scenes always have them.
  posX?: number;
  posY?: number;
  privacyLevel: ScenePrivacyLevel;
  currentCharacterIds: string[];
  recentEventChapterId?: string;
  imageUrl?: string;
  pastEvents?: ScenePastEvent[];
  heatProfile?: SceneHeatProfile;
  derivativeCounts?: SceneDerivativeCounts;
  ghostQuotes?: SceneGhostQuote[];
  gallery?: SceneGallery;
  performance?: ScenePerformanceState;
}

export interface SagaLocation {
  id: string;
  name: string;
  description: string;
  // On-chain Location.info.terrain (wharf / compound / ...); may be undefined on
  // mock or legacy data, so renderers must tolerate it.
  terrain?: string;
}

export type ClipAspect = '16/9' | '9/16' | '1/1' | '4/3' | '3/4';

export interface SceneClip {
  id: string;
  sagaId: string;
  sceneId?: string;
  chapterId?: string;
  day: number;
  title: string;
  caption?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  aspect?: ClipAspect;
  createdAt: string;
}
