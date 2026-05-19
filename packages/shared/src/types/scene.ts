export type ClipAspect = '16/9' | '9/16' | '1/1' | '4/3' | '3/4';

export interface SceneClip {
  id: string;
  sagaId: string;
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
