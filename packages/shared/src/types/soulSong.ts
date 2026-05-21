export type SoulSongMood =
  | 'longing'
  | 'remembering'
  | 'restless'
  | 'reconciled'
  | 'sorrow'
  | 'defiant';

export interface SoulSong {
  id: string;
  characterId: string;
  composedAt: string;
  verses: string[];
  setting?: string;
  mood?: SoulSongMood;
  initiallyRevealed?: boolean;
}
