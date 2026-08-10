/**
 * Poe model registry — hand-curated for Chinese narrative tasks.
 *
 * Why hardcode instead of GET /v1/models?
 * Poe has thousands of bots; full listing causes choice fatigue. We surface
 * only models that have observed acceptable quality on Chinese saga / wuxia
 * narrative + decision tasks, grouped by tier so admin can pick by cost.
 *
 * Source: ported from the old repo (`packages/web/src/components/admin/poe-models.ts`).
 * Update notes:
 * - 2026-05-25 ported with same hand-picked set (Claude Opus/Sonnet, GPT-5,
 *   Gemini 2.5 Pro/Flash, GLM-4.6, DeepSeek V3.2/R1, Qwen3 Max, Haiku, etc.)
 * - 2026-06-12 defaults: primary GLM-5.1-FW, cheap GLM-4.7-N (see config.ts).
 * - 2026-08-10 **retired-bot sweep**. Poe deletes bots outright, with no compat
 *   alias: the id 404s (`GLM-5.1-FW`, `GLM-4.7-FlashX`, `Claude-Opus-4.1`,
 *   `Qwen3-Max`, `DeepSeek-R1`) or, worse, 500s (`GLM-4.7-N`). Every id below is
 *   re-verified against a live `GET /v1/models` (330 bots) plus a real
 *   completion. Surviving bots still resolve case-insensitively (`GLM-4.6` →
 *   `glm-4.6`), so `GLM-4.6` is left in its historical spelling to keep the
 *   cost-discipline default and existing run manifests byte-identical; the
 *   newly added ids use catalog form.
 *
 *   **Keep ids catalog-exact.** A dead id no longer kills a run outright
 *   (`fallback.ts` walks past an unavailable model) but it still costs a hop,
 *   and in the picker it is simply a broken choice.
 */

export type PoeModelTier = 'premium' | 'balanced' | 'cheap';

export interface PoeModel {
  /** Poe bot id (target of `model:` in /v1/chat/completions). */
  id: string;
  label: string;
  notes: string;
  tier: PoeModelTier;
  /** Eligible for cheap-model slot (decisions / moderation / inner monologue). */
  cheapOk?: boolean;
  /** Eligible for primary-model slot (storyteller / chapter / draft). */
  primaryOk?: boolean;
}

export const POE_MODELS: PoeModel[] = [
  // ── Premium ──
  { id: 'glm-5.1',          label: 'GLM-5.1',          notes: '中文創作強；文筆比 4.6 高一檔，但比 4.6 貴（成本紀律下不作預設）', tier: 'premium', primaryOk: true },
  { id: 'glm-5.2',          label: 'GLM-5.2',          notes: '5.1 的新版；尚未長跑驗證',                                 tier: 'premium', primaryOk: true },
  { id: 'claude-opus-4.6',  label: 'Claude Opus 4.6',  notes: '頂級品質、中文出色；最貴',                                 tier: 'premium', primaryOk: true },
  { id: 'claude-sonnet-4.6',label: 'Claude Sonnet 4.6',notes: '品質 / 成本平衡，中文強',                                   tier: 'premium', primaryOk: true },
  { id: 'gpt-5',            label: 'GPT-5',            notes: '推理強、中文尚可；風格偏西式',                              tier: 'premium', primaryOk: true },
  { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   notes: '大 context、中文良好、instruction-following 強',          tier: 'premium', primaryOk: true },
  { id: 'GLM-4.6',          label: 'GLM-4.6',          notes: '中文母語級、長 context；武俠語境尤佳（Poe primary＋cheap 預設）', tier: 'premium', primaryOk: true, cheapOk: true },

  // ── Balanced ──
  { id: 'deepseek-v3.2',    label: 'DeepSeek V3.2',    notes: '中文強、便宜；風格偏寫實',                                 tier: 'balanced', primaryOk: true, cheapOk: true },
  { id: 'qwen3-max-n',      label: 'Qwen3 Max N',      notes: '中文母語級；思考很長，實測一次要一分鐘，不適合逐拍呼叫',    tier: 'balanced', primaryOk: true },

  // ── Cheap ──
  { id: 'glm-4.7-flash-n',  label: 'GLM-4.7 Flash N',  notes: '決策 / 審核 / tick 便宜層；Poe 上唯一不思考的 GLM（一兩秒回、不吃 headroom），故為 GLM 家族內的 fallback 首選', tier: 'cheap', cheapOk: true },
  { id: 'glm-4.7',          label: 'GLM-4.7',          notes: '決策備援；會思考，靠 headroom 才吐得出內容',                tier: 'cheap', cheapOk: true },
  { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', notes: '快、便宜；中文尚可',                                       tier: 'cheap', cheapOk: true },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', notes: '超低成本、中文尚可',                                       tier: 'cheap', cheapOk: true },
  { id: 'gpt-5-mini',       label: 'GPT-5 mini',       notes: '便宜、推理尚可',                                           tier: 'cheap', cheapOk: true },
];

export const PRIMARY_MODELS = POE_MODELS.filter((m) => m.primaryOk);
export const CHEAP_MODELS = POE_MODELS.filter((m) => m.cheapOk);

export const TIER_LABEL: Record<PoeModelTier, string> = {
  premium: '高品質',
  balanced: '平衡',
  cheap: '平價',
};

/**
 * Poe models that need `thinking: { enabled }` for best results.
 * Anthropic-side: model IDs that have the extended-thinking feature.
 */
export const THINKING_MODELS = new Set<string>([
  'Claude-Sonnet-4.6',
  'claude-sonnet-4.6',
  'claude-opus-4.6',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
]);

/** Provider-aware fallback chain on 429/503/529.
 *
 *  成本紀律：Poe 路徑的 fallback 只在 GLM 家族內——絕不無聲滑向
 *  Claude / GPT / Gemini（舊鏈第一順位是 Claude-Sonnet，GLM 一限流就
 *  默默燒最貴的模型；帳單即事故）。要用非 GLM，必須在 POE_MODEL_* 明示。
 *
 *  2026-08-10：鏈上第二順位原是 `GLM-4.7-FlashX` 與 `GLM-4.7-N`，兩顆都已被
 *  Poe 下架（404 / 500，實打驗過）。也就是 GLM-4.6 一出事就落進屍體，而 404
 *  在 fallback 眼裡是「不可重試」，於是整條鏈當場斷掉——備援在最需要它的那一刻
 *  才發現是空的。換成活著的 GLM，順位仍全在家族內。 */
export function getFallbackModels(provider: 'poe' | 'anthropic', cheap: boolean): string[] {
  if (provider === 'poe') {
    return cheap
      ? ['GLM-4.6', 'glm-4.7-flash-n']
      : ['GLM-4.6', 'glm-4.7', 'glm-4.7-flash-n'];
  }
  return cheap
    ? ['claude-sonnet-4-6']
    : ['claude-opus-4-6', 'claude-haiku-4-5'];
}
