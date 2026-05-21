export interface Saga {
  id: string;
  name: string;
  description: string;
  currentDay: number;
  totalDays: number;
  castIds: string[];
  premise: string;
}

/**
 * 主觀關係邊 — 對應舊版 runner subjective-llm 蒸出的「我對她」累積情感。
 * 一條邊是有方向的：fromId 對 toId 的看法 — 反向是另一條 edge。
 *
 * 由 sleep cycle 每日蒸餾累積；UI 在 ProfileTab 關係 sidebar 顯示。
 */
export type RelationshipTone =
  | 'affection' // 親近
  | 'romance' // 戀慕
  | 'mentorship' // 師徒
  | 'rivalry' // 競爭
  | 'wary' // 戒備
  | 'tension' // 緊張
  | 'estrangement' // 隔閡
  | 'neutral'; // 平淡

export interface RelationshipEdge {
  fromId: string;
  toId: string;
  /** 0-10；累積強度 */
  weight: number;
  /** 2-6 字 pair-specific label（如「鎮魂鐵腕」「越界暖意」） */
  label: string;
  /** 上次蒸餾的世界日 */
  lastUpdatedDay: number;
  /** 主觀情感類型 — UI 用 tone dot 視覺區分 */
  tone?: RelationshipTone;
  /** 首次被觀察到的世界日；配合 lastUpdatedDay 顯示「日 X — 日 Y」累積範圍 */
  firstSeenDay?: number;
  /** 0-1；當前累積信度 */
  confidence?: number;
  /** 主觀感受敘述（比 label 長、可換行）；空時 fallback 用 label */
  summary?: string;
}
