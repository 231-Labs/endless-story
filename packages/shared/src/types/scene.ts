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
  createdAt: string;
}
