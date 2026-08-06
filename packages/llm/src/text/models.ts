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
  { id: 'GLM-5.1-FW',       label: 'GLM-5.1 FW',       notes: '中文創作強；章回 / 導演 / 預覽',                           tier: 'premium', primaryOk: true },
  { id: 'Claude-Opus-4.1',  label: 'Claude Opus 4.1',  notes: '頂級品質、中文出色；最貴',                                 tier: 'premium', primaryOk: true },
  { id: 'Claude-Sonnet-4.6',label: 'Claude Sonnet 4.6',notes: '品質 / 成本平衡，中文強',                                   tier: 'premium', primaryOk: true },
  { id: 'GPT-5',            label: 'GPT-5',            notes: '推理強、中文尚可；風格偏西式',                              tier: 'premium', primaryOk: true },
  { id: 'Gemini-2.5-Pro',   label: 'Gemini 2.5 Pro',   notes: '大 context、中文良好、instruction-following 強',          tier: 'premium', primaryOk: true },
  { id: 'GLM-4.6',          label: 'GLM-4.6',          notes: '中文母語級、長 context；武俠語境尤佳（Poe primary＋cheap 預設）', tier: 'premium', primaryOk: true, cheapOk: true },

  // ── Balanced ──
  { id: 'DeepSeek-V3.2',    label: 'DeepSeek V3.2',    notes: '中文強、便宜；風格偏寫實',                                 tier: 'balanced', primaryOk: true, cheapOk: true },
  { id: 'Qwen3-Max',        label: 'Qwen3 Max',        notes: '中文母語級、通用任務穩',                                   tier: 'balanced', primaryOk: true, cheapOk: true },

  // ── Cheap ──
  { id: 'GLM-4.7-N',        label: 'GLM-4.7 N',        notes: '決策 / 審核 / tick 便宜層',                                 tier: 'cheap', cheapOk: true },
  { id: 'GLM-4.7-FlashX',   label: 'GLM-4.7 FlashX',   notes: 'Flash 變體；決策備援',                                     tier: 'cheap', cheapOk: true },
  { id: 'Claude-Haiku-4.5', label: 'Claude Haiku 4.5', notes: '快、便宜；中文尚可',                                       tier: 'cheap', cheapOk: true },
  { id: 'Gemini-2.5-Flash', label: 'Gemini 2.5 Flash', notes: '超低成本、中文尚可',                                       tier: 'cheap', cheapOk: true },
  { id: 'GPT-5-mini',       label: 'GPT-5 mini',       notes: '便宜、推理尚可',                                           tier: 'cheap', cheapOk: true },
  { id: 'DeepSeek-R1',      label: 'DeepSeek R1',      notes: '推理特長、中文強；適合需要思考的決策',                       tier: 'cheap', cheapOk: true },
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
  'Claude-Opus-4.1',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
]);

/** Provider-aware fallback chain on 429/503/529.
 *
 *  成本紀律：Poe 路徑的 fallback 只在 GLM 家族內——絕不無聲滑向
 *  Claude / GPT / Gemini（舊鏈第一順位是 Claude-Sonnet，GLM 一限流就
 *  默默燒最貴的模型；帳單即事故）。要用非 GLM，必須在 POE_MODEL_* 明示。 */
export function getFallbackModels(provider: 'poe' | 'anthropic', cheap: boolean): string[] {
  if (provider === 'poe') {
    return cheap
      ? ['GLM-4.6', 'GLM-4.7-FlashX']
      : ['GLM-4.6', 'GLM-4.7-N'];
  }
  return cheap
    ? ['claude-sonnet-4-6']
    : ['claude-opus-4-6', 'claude-haiku-4-5'];
}
