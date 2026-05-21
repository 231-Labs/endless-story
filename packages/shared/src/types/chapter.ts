import type { Visibility } from './common';

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
  walrusBlobId: string;
  visibility: Visibility;
  createdAt: string;
}

export interface ChapterPOV extends Chapter {
  povCharacterId: string;
}
