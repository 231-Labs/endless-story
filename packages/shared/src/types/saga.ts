/**
 * Saga = 戲班 / 組織。storyteller 持有 cap、對 saga 內角色有 fiduciary duty。
 *
 * 對齊舊版 L1_DESIGN.md 第三節：
 *   - 角色 IP（CharacterOwnerNFT）由 mint 用戶持有
 *   - Saga 擁有 scenes / 班規 / 分潤政策 / 章回 IP 累積
 *   - 兩者構成 IP 經濟的兩端
 */
export interface Saga {
  id: string;
  name: string;
  description: string;
  currentDay: number;
  /** Endless story — saga 沒有固定終點。`totalDays` 只在「特定本回 arc 有計劃結束日」時填，
   *  否則 UI 顯示「連載中」。 */
  totalDays?: number;
  castIds: string[];
  premise: string;
  /** 此 saga 開戲所在的 location id 清單；mock 階段先放一條 */
  coveredLocationIds?: string[];
  /** LLM-facing 班規氣質（character agent 跑章回生成時讀） */
  sagaPrompts?: SagaPersistentPrompts;
  /** 鏈上分潤政策（owner / storyteller / treasury basis points，合計 10000） */
  revenueConfig?: RevenueConfig;
  /** 經營透明度展示用 — 真實值由 backend 算 */
  metrics?: SagaMetrics;
  /** 此刻的世界時間 — 觸發 scene lighting / weather 變化 */
  worldTime?: SagaWorldTime;
}

/**
 * 班規氣質 — 對應舊版 SagaPersistentPrompts。
 *
 * UI 在 /saga 頁面把這三條翻譯成讀者讀得懂的「班規」展示，
 * 跟「角色本色（軸/腔/界）」呼應 — 角色有人格藍圖、戲班有氣質藍圖。
 */
export interface SagaPersistentPrompts {
  /**
   * 事件氣質 — 戲外的戲、衝突類型、敘事節奏。
   * Optional：鏈上沒有此欄位，由 storyteller LLM domain 提供。
   */
  naturePrompt?: string;
  /**
   * 自然節律 — 日出開嗓 / 戌時封箱 / 月不出停戲一日。
   * Optional：同上，鏈上沒有。
   */
  rhythmHints?: string;
  /**
   * 離職政策 — 想走的人怎麼結銀錢、章程怎麼寫。
   * 鏈上 `Saga.departure_policy` 直接帶出。
   */
  departurePolicy: string;
}

/** 一日中的時段 — 影響 scene lighting variation 的觸發 */
export type DayPart = 'morning' | 'noon' | 'dusk' | 'night';

/** Saga 的當下世界時間（敘事日內的時段） — saga server 推送 */
export interface SagaWorldTime {
  /** 敘事日（與 saga.currentDay 同步） */
  day: number;
  /** 此刻在哪個時段 — UI 顯示「朝/午/暮/夜」 */
  partOfDay: DayPart;
  /** 顯示用文字（例：戊時三刻 / 黎明 / 戌時末） */
  label?: string;
  /** 天氣 — saga storyteller 寫；觸發 scene weather variation */
  weather?: 'clear' | 'rain' | 'snow' | 'wind';
}

/** 收入分配 basis points（×0.01%）— 合計必須為 10000 */
export interface RevenueConfig {
  /** 持有 OwnerNFT 的人拿多少 */
  ownerBps: number;
  /** Saga storyteller 拿多少 */
  storytellerBps: number;
  /** Saga 公帳（補貼薪資 / 場租 / 戲服） */
  treasuryBps: number;
}

export interface SagaMetrics {
  totalChapters: number;
  totalSubscribers: number;
  /** 角色平均訂閱數 = totalSubscribers / castIds.length */
  avgSubsPerCharacter: number;
  /** 公帳累積現銀（endless 世界貨幣） */
  treasuryFunds: number;
}

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
  /** 2-6 字 pair-specific label */
  label: string;
  /** 上次蒸餾的世界日 */
  lastUpdatedDay: number;
  /** 主觀情感類型 — UI 用 tone dot 視覺區分 */
  tone?: RelationshipTone;
  /** 首次被觀察到的世界日 */
  firstSeenDay?: number;
  /** 0-1；當前累積信度 */
  confidence?: number;
  /** 主觀感受敘述；空時 fallback 用 label */
  summary?: string;
}
