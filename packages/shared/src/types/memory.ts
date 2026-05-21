/**
 * Structured journal entry — anchored to a specific moment in saga time.
 * 與心曲（SoulSong，完整內心獨白）區隔：記憶是「事件 + 短反思」，更接近日誌。
 *
 * - reflection  · 反思 — 對自身狀態 / 抉擇的內省
 * - observation · 觀察 — 對他人 / 環境的記錄
 * - event       · 事件 — 一段親歷情節的縮寫（多半連回章回）
 */
export type CharacterMemoryKind = 'reflection' | 'observation' | 'event';

export interface CharacterMemory {
  id: string;
  characterId: string;
  kind: CharacterMemoryKind;
  /** ISO 時間 — 角色「在故事內」記下這段的時點 */
  occurredAt: string;
  /** 一行短摘要 — 列表頁第一眼看到的字 */
  summary: string;
  /** 完整反思內文 — 一兩段，靜下心讀的長度 */
  body: string;
  /** 對應到的章回 id（如可指）— 顯示「@《章回名》」並可跳回 */
  eventChapterId?: string;
  /** 對應到的其他角色 ids — 給 NameLink 過濾出來、補連結 */
  involvedCharacterIds?: string[];
}
