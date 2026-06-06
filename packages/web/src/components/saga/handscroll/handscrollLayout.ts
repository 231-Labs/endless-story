import type { SagaLocation, Scene } from '@endless-story/shared';

/**
 * 手卷橫軸佈局 — 資料驅動，跟著本 saga 的 location & scene 走。
 *
 * 舊版寫死三段（戲樓 / 月洞門 / 院落）+ 一張固定手繪，換 saga 就破。改成：
 *   - 每個 covered location 佔等寬一段（左→右照 coveredLocationIds 順序）。
 *   - 每段一個地名橫匾，置於該段正中。
 *   - 該 location 的 scene 鋪在自己那段內（水平在段內均分、垂直沿用 scene.pos_y）。
 *   - 沒有任何 scene 的 location 仍保留空段（空院落），維持「世界比戲多」的呼吸。
 *   - locationId 對不上的零星 scene（理論上不該有）依其 pos_x 落到最接近的段，確保不漏。
 *
 * 座標單位皆為「整卷容器寬 / 高的百分比」(0–100)，與 SceneVignette 的 left/top% 對齊。
 */

export interface ScenePlacement {
  scene: Scene;
  /** 整卷寬度的百分比（0–100） */
  xPct: number;
  /** 整卷高度的百分比（0–100） */
  yPct: number;
  /** 給 SceneVignette 題款偏移用：段內上半 = 'theater'、下半 = 'compound' */
  zone: 'theater' | 'compound';
}

export interface LocationSegment {
  location: SagaLocation;
  /** 段序（0-based，左→右） */
  index: number;
  /** 段在整卷的水平範圍（百分比） */
  startPct: number;
  endPct: number;
  /** 地名橫匾落點（段中央，百分比） */
  labelXPct: number;
  scenes: ScenePlacement[];
}

export interface HandscrollLayout {
  segments: LocationSegment[];
  /** location 數（= 段數） */
  segmentCount: number;
}

// 段內水平可用區（避免 scene 貼著段邊與隔牆）
const INNER_START = 0.16;
const INNER_END = 0.84;
// scene 垂直落點夾在這個帶狀區 — 壓低貼著院落／地面，避免錨點飄在半空。
// （院落剪影在 viewBox 約 45–70% 高，故場景點落在 56–70% 才「站」在卷面上。）
const Y_MIN = 56;
const Y_MAX = 70;

function sceneSortKey(s: Scene): number {
  return s.posX ?? 50;
}

/**
 * 把 scene 在段內水平攤開：1 個置中，多個在 [INNER_START, INNER_END] 均分。
 */
function spreadFraction(idx: number, count: number): number {
  if (count <= 1) return 0.5;
  return INNER_START + (INNER_END - INNER_START) * (idx / (count - 1));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeHandscrollLayout(
  locations: SagaLocation[],
  scenes: Scene[],
): HandscrollLayout {
  // 只收「location 在本 saga 覆蓋集合裡」的 scene。location 不在覆蓋集合的（外部點，
  // 如堂子/會館——它們也 anchor 在 saga 上、會被一起讀進來）不畫在橫軸，留給「外部面板」；
  // locationId 缺失的（資料異常）同樣略過，不再用 pos_x 硬塞進某段。
  const locIdSet = new Set(locations.map((l) => l.id));
  const scenesByLocId = new Map<string, Scene[]>();
  for (const sc of scenes) {
    if (sc.locationId && locIdSet.has(sc.locationId)) {
      const list = scenesByLocId.get(sc.locationId) ?? [];
      list.push(sc);
      scenesByLocId.set(sc.locationId, list);
    }
  }

  // 忠實顯示本 saga 的「敘事權集合」= `coveredLocationIds`（caller 已只傳這些進來）。
  // 不依「有沒有場景」過濾：有敘事權但還沒安排戲的 location 也畫成空院落。世界裡 saga
  // 未認領的 location（無主 / 屬於別的 saga）根本不在 coveredLocationIds 裡，自然不畫。
  const shown = locations;
  const segmentCount = Math.max(1, shown.length);
  const segWidth = 100 / segmentCount;

  // 每段的 scene = 歸到該 location 的
  const byLocation: Scene[][] = shown.map((loc) => [...(scenesByLocId.get(loc.id) ?? [])]);

  const segments: LocationSegment[] = shown.map((location, index) => {
    const startPct = index * segWidth;
    const endPct = (index + 1) * segWidth;
    const labelXPct = startPct + segWidth / 2;

    const sorted = [...byLocation[index]].sort((a, b) => sceneSortKey(a) - sceneSortKey(b));
    const scenePlacements: ScenePlacement[] = sorted.map((scene, j) => {
      const frac = spreadFraction(j, sorted.length);
      const xPct = startPct + segWidth * frac;
      const baseY = scene.posY != null ? scene.posY : 50 + (j % 2 === 0 ? -6 : 6);
      const yPct = clamp(baseY, Y_MIN, Y_MAX);
      return { scene, xPct, yPct, zone: yPct < 54 ? 'theater' : 'compound' };
    });

    return { location, index, startPct, endPct, labelXPct, scenes: scenePlacements };
  });

  return { segments, segmentCount };
}
