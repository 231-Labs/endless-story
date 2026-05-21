/**
 * 角色本色（半永久人格藍圖）— 在任何章回裡都不會丟掉的部分。
 * 與 SoulSong（情緒詩 / 即時心曲）+ CharacterMemory（事件日誌）三層區隔：
 *   - persona = 結構（她是誰）
 *   - memory  = 事件（她記得什麼）
 *   - song    = 情緒（她現在唱什麼）
 *
 * 三個維度刻意取單字、對齊戲曲語彙：
 *   - 軸（axes）       — immutable axes：在任何處境下她仍維持的核心傾向
 *   - 腔（mannerisms）— speech & body 微表徵：辨識她的方式
 *   - 界（values）     — non-negotiable boundaries：她不肯退的那條線
 */
export interface CharacterPersona {
  characterId: string;
  axes: string[];
  mannerisms: string[];
  boundaries: string[];
  /** 半永久 — 這版本由哪一次 reflection / event 觸發更新（mock 階段純標記） */
  version: number;
  updatedAt: string;
}
