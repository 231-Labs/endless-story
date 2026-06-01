export type Wallet = string;

export type CharacterRole =
  | '班主'
  | '青衣'
  | '花旦'
  | '小生'
  | '武旦'
  | '老旦'
  | '丑'
  | '樂師'
  | '箱管'
  | '學徒'
  | '看客';

export type Visibility = 'public_chapter' | 'saga_internal' | 'private';

export interface BlobRef {
  walrusBlobId: string;
  imageUrl: string;
  kind:
    | 'anchor'
    | 'setting_sheet'
    | 'portrait_variant'
    | 'costume'
    | 'makeup'
    | 'event_moment'
    | 'scene_clip';
  /** Index in character.media_assets, when this image comes from the on-chain gallery. */
  mediaIndex?: number;
  label?: string;
  sourceEventId?: string;
  sourceChapterId?: string;
  createdAt: string;
}
