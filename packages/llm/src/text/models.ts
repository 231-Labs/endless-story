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
  { id: 'Claude-Opus-4.1',  label: 'Claude Opus 4.1',  notes: '頂級品質、中文出色；最貴',                                 tier: 'premium', primaryOk: true },
  { id: 'Claude-Sonnet-4.6',label: 'Claude Sonnet 4.6',notes: '品質 / 成本平衡最佳，中文強（預設）',                       tier: 'premium', primaryOk: true },
  { id: 'GPT-5',            label: 'GPT-5',            notes: '推理強、中文尚可；風格偏西式',                              tier: 'premium', primaryOk: true },
  { id: 'Gemini-2.5-Pro',   label: 'Gemini 2.5 Pro',   notes: '大 context、中文良好、instruction-following 強',          tier: 'premium', primaryOk: true },
  { id: 'GLM-4.6',          label: 'GLM-4.6',          notes: '中文母語級、長 context；武俠語境尤佳。primary / cheap 兩用', tier: 'premium', primaryOk: true, cheapOk: true },

  // ── Balanced ──
  { id: 'DeepSeek-V3.2',    label: 'DeepSeek V3.2',    notes: '中文強、便宜；風格偏寫實',                                 tier: 'balanced', primaryOk: true, cheapOk: true },
  { id: 'Qwen3-Max',        label: 'Qwen3 Max',        notes: '中文母語級、通用任務穩',                                   tier: 'balanced', primaryOk: true, cheapOk: true },

  // ── Cheap ──
  { id: 'Claude-Haiku-4.5', label: 'Claude Haiku 4.5', notes: '快、便宜；中文 OK；決策 / 意圖首選（預設 cheap）',           tier: 'cheap', cheapOk: true },
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

/** Provider-aware fallback chain on 429/503/529. */
export function getFallbackModels(provider: 'poe' | 'anthropic', cheap: boolean): string[] {
  if (provider === 'poe') {
    return cheap
      ? ['Claude-Haiku-4.5', 'Gemini-2.5-Flash', 'GLM-4.6']
      : ['Claude-Sonnet-4.6', 'GPT-5', 'GLM-4.6'];
  }
  return cheap
    ? ['claude-sonnet-4-6']
    : ['claude-opus-4-6', 'claude-haiku-4-5'];
}
