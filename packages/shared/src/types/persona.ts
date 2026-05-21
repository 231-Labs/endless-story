/**
 * 角色本色（半永久人格藍圖）— 在任何章回裡都不會丟掉的部分。
 *
 * 三層深度區隔：
 *   - persona = 結構（她是誰）        ← 此檔
 *   - memory  = 事件（她記得什麼）
 *   - song    = 情緒（她現在唱什麼）
 *
 * 三個維度刻意取單字、對齊戲曲語彙：
 *   - 軸（axes）       — immutable axes：在任何處境下她仍維持的核心傾向
 *   - 腔（mannerisms）— speech & body 微表徵：辨識她的方式
 *   - 界（boundaries）— non-negotiable boundaries：她不肯退的那條線
 *
 * 半永久 — 不每天動，但會在重大事件後重蒸（saga arc 結束 / 首次成卷 / 手動）。
 * lastRegen* 給 UI 顯示「上次更新於哪一場戲」這個 evolving signal。
 */
export type PersonaRegenTrigger = 'first_run' | 'saga_arc' | 'manual';

export interface CharacterPersona {
  characterId: string;
  axes: string[];
  mannerisms: string[];
  boundaries: string[];
  /** 半永久版本號 — 每次重蒸 +1 */
  version: number;
  updatedAt: string;
  /** 觸發此版重蒸的原因 */
  lastRegenTrigger?: PersonaRegenTrigger;
  /** 觸發此版重蒸的章回 id — UI 顯示「@《章回名》落幕後重蒸」 */
  lastRegenChapterId?: string;
}
