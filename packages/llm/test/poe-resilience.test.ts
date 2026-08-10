// 2026-08-10：Poe 那頭的兩顆雷，一顆已在 #225 修掉（空回是事故不是答案），
// 另一顆是這裡補的——**下架的 bot 會拖垮整條 fallback 鏈**。
//
// Poe 刪 bot 不留相容別名：舊 id 回 404（GLM-5.1-FW / GLM-4.7-FlashX /
// Claude-Opus-4.1 / Qwen3-Max / DeepSeek-R1）或 500（GLM-4.7-N）。而 404 不算
// 可重試，`chatWithFallback` 於是在第一顆就往外拋，後面健康的備援一顆都沒碰到。
//
// 兩者疊起來最兇：#225 讓「空回」丟出可重試的 503，鏈往下走一格——如果下一格
// 是一具屍體（鏈上原本正是 GLM-4.7-FlashX 和 GLM-4.7-N），那就從「靜靜回空」
// 變成「當場硬死」。所以 id 掃乾淨與鏈能跨過死 id，兩件都得釘住。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LLMHttpError, isModelUnavailableError, isRetryableError } from '../src/text/providers.ts';
import { chatWithFallback, type ChatFn } from '../src/text/fallback.ts';
import { getFallbackModels, POE_MODELS } from '../src/text/models.ts';
import { loadLLMConfig } from '../src/config.ts';
import type { ChatRequest, ChatResponse } from '../src/text/types.ts';

const BASE = { messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 480 };

/** 實打驗過已從 Poe 目錄消失的 bot（2026-08-10，GET /v1/models 330 顆）。 */
const RETIRED = ['GLM-5.1-FW', 'GLM-4.7-N', 'GLM-4.7-FlashX', 'Claude-Opus-4.1', 'Qwen3-Max', 'DeepSeek-R1'];

// ── 死掉的 id 只花一跳 ───────────────────────────────────────────────────

test('下架 bot 的 404 認得出來，不是「不可重試」一句話帶過', () => {
  const err = new LLMHttpError(404, 'poe', 'GLM-5.1-FW', 'Model not found, inaccessible, and/or not deployed');
  assert.equal(isModelUnavailableError(err), true);
});

test('400 指名「不認得這個模型」也算不在了；一般 400 照舊往外拋', () => {
  assert.equal(isModelUnavailableError(new LLMHttpError(400, 'poe', 'nope', 'unknown model: nope')), true);
  assert.equal(
    isModelUnavailableError(new LLMHttpError(400, 'poe', 'GLM-4.6', 'messages must not be empty')),
    false,
    '畸形的 prompt 在每顆模型上都會壞成一樣，走完整條鏈只是把同一個錯誤乘以鏈長',
  );
});

test('鏈會跨過不在了的模型，落到活的那顆', async () => {
  const tried: string[] = [];
  const fn: ChatFn = async (req: ChatRequest): Promise<ChatResponse> => {
    tried.push(req.model);
    if (req.model === 'dead-bot') throw new LLMHttpError(404, 'poe', req.model, 'Model not found');
    return { text: '好戲開場。', model: req.model, provider: 'poe' };
  };

  const res = await chatWithFallback(fn, BASE, ['dead-bot', 'GLM-4.6']);

  assert.equal(res.text, '好戲開場。');
  assert.equal(res.model, 'GLM-4.6');
  // 死 id 只打一次：不重試、不退避。對屍體做指數退避，看起來就像世界當掉了。
  assert.deepEqual(tried, ['dead-bot', 'GLM-4.6']);
});

test('空回（#225 的 503）往下走一格時，下一格不能是屍體', async () => {
  const tried: string[] = [];
  const fn: ChatFn = async (req: ChatRequest): Promise<ChatResponse> => {
    tried.push(req.model);
    if (req.model === 'GLM-4.6') throw new LLMHttpError(503, 'poe', req.model, '空回：模型回應成功但一個字都沒有');
    if (req.model === 'dead-bot') throw new LLMHttpError(404, 'poe', req.model, 'Model not found');
    return { text: '雨還在下。', model: req.model, provider: 'poe' };
  };

  const res = await chatWithFallback(fn, BASE, ['GLM-4.6', 'dead-bot', 'glm-4.7-flash-n']);

  assert.equal(res.model, 'glm-4.7-flash-n');
  assert.equal(tried.filter((m) => m === 'dead-bot').length, 1, '屍體不重試');
});

test('鏈尾也是死的，錯誤仍要浮出來，不能靜靜回空', async () => {
  const fn: ChatFn = async (req: ChatRequest) => {
    throw new LLMHttpError(404, 'poe', req.model, 'Model not found');
  };
  await assert.rejects(() => chatWithFallback(fn, BASE, ['dead-a', 'dead-b']), /404/);
});

test('非重試錯誤（壞 key）照舊當場短路整條鏈', async () => {
  const tried: string[] = [];
  const fn: ChatFn = async (req: ChatRequest) => {
    tried.push(req.model);
    throw new LLMHttpError(401, 'poe', req.model, 'invalid api key');
  };
  await assert.rejects(() => chatWithFallback(fn, BASE, ['GLM-4.6', 'glm-4.7-flash-n']), /401/);
  assert.deepEqual(tried, ['GLM-4.6']);
  assert.equal(isRetryableError(new LLMHttpError(401, 'poe', 'GLM-4.6', 'bad key')), false);
});

// ── 牌面上不留屍體 ───────────────────────────────────────────────────────

test('registry、fallback 鏈、預設，全都不含已下架的 id', () => {
  const cfg = loadLLMConfig();
  const inUse = [
    ...POE_MODELS.map((m) => m.id),
    ...getFallbackModels('poe', true),
    ...getFallbackModels('poe', false),
    cfg.poeModelPrimary,
    cfg.poeModelCheap,
  ].map((id) => id.toLowerCase());

  for (const dead of RETIRED) {
    assert.ok(!inUse.includes(dead.toLowerCase()), `已下架的 Poe bot 還被引用：${dead}`);
  }
});

test('fallback 鏈上每一顆都在 registry 裡，且全在 GLM 家族內（成本紀律）', () => {
  const ids = new Set(POE_MODELS.map((m) => m.id.toLowerCase()));
  for (const cheap of [true, false]) {
    const chain = getFallbackModels('poe', cheap);
    assert.ok(chain.length > 0);
    for (const id of chain) {
      assert.ok(ids.has(id.toLowerCase()), `fallback ${id} 不在 POE_MODELS 裡`);
      // #213 的判決：GLM 一限流就默默燒 Claude/GPT，帳單即事故。
      assert.match(id.toLowerCase(), /^glm-/, `fallback 滑出 GLM 家族：${id}`);
    }
  }
});

test('Poe 預設仍是成本紀律定的 GLM-4.6，兩檔都是', () => {
  const cfg = loadLLMConfig();
  assert.equal(cfg.poeModelPrimary, 'GLM-4.6');
  assert.equal(cfg.poeModelCheap, 'GLM-4.6');
});
