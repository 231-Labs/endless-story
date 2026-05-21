/**
 * 結構化日誌 entry — 對齊舊版 runner MemoryStore 的「她記得什麼」這條鍊。
 *
 * 三層深度區隔：
 *   - persona  = 結構（她是誰）
 *   - memory   = 事件（她記得什麼）       ← 此檔
 *   - song     = 情緒（她現在唱什麼）
 *
 * 八種 kind 對應角色內在的不同層次，列表頁用 KindDot 視覺區分：
 *   - reflection         · 反思 — sleep tick 蒸出的高密度反思
 *   - observation        · 觀察 — 當下對人 / 事的紀錄
 *   - event              · 事件 — 「我參與了 X」的縮寫（多半連回章回）
 *   - dream              · 夢   — 班主 / storyteller 注入的潛意識素材
 *   - relationship       · 關係 — 對特定他者的長期看法
 *   - heard_memory       · 聽來 — 從別人口中聽來、信度較低
 *   - claimed_backstory  · 自述 — 她聲稱的前史、未經驗證
 *   - artifact           · 創作 — 她寫的日記 / 戲詞 / 身段札記，未來 Walrus anchor
 */
export type CharacterMemoryKind =
  | 'reflection'
  | 'observation'
  | 'event'
  | 'dream'
  | 'relationship'
  | 'heard_memory'
  | 'claimed_backstory'
  | 'artifact';

export type MemoryProvenanceSource =
  | 'self'
  | 'storyteller'
  | 'owner'
  | 'heard_from_character'
  | 'system';

export type MemoryClaimStatus =
  | 'unverified'
  | 'contested'
  | 'corroborated'
  | 'canonical';

export interface MemoryProvenance {
  source: MemoryProvenanceSource;
  /** source = heard_from_character 時填入；對應 Character.id */
  sourceCharacterId?: string;
  /** 0-1；當前角色相信程度 */
  confidence?: number;
  claimStatus?: MemoryClaimStatus;
}

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
  /** 1-10；視覺上用來決定 summary 的字重（強記得 → 粗、模糊 → 淡） */
  importance: number;
  /** 來源追蹤；source=self 時可省略 */
  provenance?: MemoryProvenance;
}
