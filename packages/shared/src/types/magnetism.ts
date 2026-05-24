/**
 * 角色「磁性」— UI 展示用的派生屬性，由 backend 算 / 查。
 *
 * 跟 Character 本體（NFT 上鏈資料）區隔：
 *   - Character    = 永久身份（mint 時寫入，幾乎不變）
 *   - Magnetism    = 展示派生（訂閱人數、下次 POV、招牌引文等隨敘事而動）
 *
 * UI 渲染 SubscribeCard / DossierHeader 用。
 */
export interface CharacterMagnetism {
  characterId: string;
  /** 招牌引文 — 一句最能代表她聲音的話，多半引自某章回 */
  signatureQuote?: { text: string; chapterId?: string };
  /** 累積訂閱者數量 */
  subscriberCount: number;
  /** 距下一份 POV 章回約多久（給看客倒數感）— 例：「6 小時內」 */
  nextPovHint?: string;
}
