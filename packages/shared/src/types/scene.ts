/**
 * Scene 有兩層概念：
 *  - `Scene`     = saga 在 location 內的細節場所（戲樓主台 / 後台 / 通鋪）
 *                   有 privacy level / 當下誰在那 / 連到最近的章回
 *  - `SceneClip` = scene 在某章回裡的派生視覺片段（demo 階段是 video clip）
 *
 * 對齊舊版 L1_DESIGN.md：
 *   - Location 是世界級地理（蘇州 / 上海 / 杭州），可跨 saga
 *   - Scene 是 saga 內細節空間，由 storyteller 建立 / 命名
 */

/** Scene 隱私度 — 對應舊版 chain 上 Scene.privacy_level */
export type ScenePrivacyLevel =
  | 0 // 公開大庭廣眾
  | 1 // 工作場所
  | 2 // 半私密
  | 3 // 幽僻
  | 4 // 夜宿共寢
  | 5; // 獨處私房

/**
 * Scene 累積的歷史事件 — 某章回在此處發生過。
 * UI 用 timeline dots 視覺化「這個場所過往承載過幾段戲」。
 */
export interface ScenePastEvent {
  chapterId: string;
  day: number;
  /** 一句話摘要 — 給 timeline hover 浮卡用 */
  brief: string;
}

/**
 * Scene 的情感熱度指紋 — 從相關 memories 蒸出的氣場。
 * 三軸合計不必為 1，用相對比重表達主導性。
 *
 *   cinnabar 朱 = 內在情緒衝突 / 戀慕 / 競爭
 *   jade     青 = 橫向觀察 / 師承 / 對人
 *   mute     灰 = 事務 / 平靜 / 公共活動
 */
export interface SceneHeatProfile {
  cinnabar: number; // 0-1
  jade: number; // 0-1
  mute: number; // 0-1
}

/** Scene 累積的派生 IP 計數 — 一目了然這個場所長出過什麼 */
export interface SceneDerivativeCounts {
  chapters: number;
  memories: number;
  soulSongs: number;
}

/**
 * Scene 的「記憶幽靈」引文 — 不同角色 POV 對此處留下的文字痕跡。
 *
 * 在魂房 modal 裡浮動淡入淡出；切換 POV 角色時 filter 出該角色的引文，
 * 視覺上實現「同一個 scene 從不同人眼裡看是不同世界」的 layer 4 願景。
 *
 * 未來接 LLM 後，這些引文可以從該角色累積的 memory.body 即時生成 / 萃取。
 */
export interface SceneGhostQuote {
  characterId: string;
  text: string;
}

/**
 * Scene 視覺持久化模型 — 對應 Character.gallery 的設計理念。
 *
 * 為什麼需要 anchor：AI 生成圖每次跑都會跑樣，缺乏 IP 一致性。
 * 因此 scene 像角色一樣需要一張 anchor 永久寫進 Walrus、
 * 所有後續變化（晨/暮/雨/演出）走 img2img 以 anchor 為基底。
 *
 * 觸發 server 重生的條件（mock 階段先列出，未來接 backend）：
 *   - anchor      : saga 起手 / scene mint 時一次
 *   - lighting    : 世界時辰跨閾值（朝/午/暮/夜）
 *   - weather     : saga storyteller 寫天氣變化
 *   - performance : 戲台特有 — 此 scene 有 OPEN event 時
 *   - moment      : 章回 finalize 時、若該章引用此 scene
 */
export interface SceneGallery {
  /** 永久 anchor — saga 起手生成、寫入 Walrus、所有 variation 的基底 */
  anchor: import('./common').BlobRef;
  /** 戲台特有：歷次演出留下的視覺（每場戲一張） */
  performances?: import('./common').BlobRef[];
  /** 章回派生 moment 圖（與 chapter id 綁定） */
  moments?: import('./common').BlobRef[];
}

/**
 * Scene 在 saga 中的當下狀態 — 由 saga server 推送，driver UI 即時感受「世界在動」。
 *
 * 跟 anchor 區隔：anchor 是身份、liveState 是此刻的動態。
 * UI 表現：戲台有 performance 時 marker 脈動 + 「正在演」徽章。
 */
export interface ScenePerformanceState {
  /** 戲目（白蛇傳·斷橋 等） */
  title: string;
  /** 對應到的章回 id（若已 finalize） */
  chapterId?: string;
  /** 演出開始 ISO 時間 */
  startedAt: string;
}

export interface Scene {
  id: string;
  sagaId: string;
  /** 所在 location id（世界級地理） */
  locationId?: string;
  name: string;
  description: string;
  privacyLevel: ScenePrivacyLevel;
  /** 當下站在此 scene 的角色 ids — UI 用小頭像 stack 顯示 */
  currentCharacterIds: string[];
  /** 最近發生事件的章回 id — UI 顯示「上回 @《章回名》」 */
  recentEventChapterId?: string;
  /** 背景視覺 — 場景縮圖 / 國畫風 */
  imageUrl?: string;
  /** 累積歷史事件 — 按 day 排序，最新在後 */
  pastEvents?: ScenePastEvent[];
  /** 情感熱度指紋 — UI shimmer bar 用 */
  heatProfile?: SceneHeatProfile;
  /** 派生 IP 計數 — 「派生」區塊用 */
  derivativeCounts?: SceneDerivativeCounts;
  /** 記憶幽靈引文 — 魂房 modal 浮文 + POV 切換用 */
  ghostQuotes?: SceneGhostQuote[];
  /** 永久視覺資產（anchor + 派生） — 對齊 Character.gallery 持久化模型 */
  gallery?: SceneGallery;
  /** 當下是否有戲在演（戲台特有） — saga server 推送 */
  performance?: ScenePerformanceState;
}

export interface SagaLocation {
  id: string;
  name: string;
  description: string;
}

export type ClipAspect = '16/9' | '9/16' | '1/1' | '4/3' | '3/4';

/** Scene 派生視覺片段（demo 階段是 video clip）— 不同於 Scene 本身 */
export interface SceneClip {
  id: string;
  sagaId: string;
  sceneId?: string;
  chapterId?: string;
  day: number;
  title: string;
  caption?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  aspect?: ClipAspect;
  createdAt: string;
}
