/**
 * Phase 2.2L acceptance: smoke-test the four subpaths without hitting real APIs.
 *
 * Run: `cd packages/cli && pnpm exec tsx ../llm/src/__check__/llm-smoke.ts`
 *
 * Stubs `globalThis.fetch` so no network traffic, then exercises:
 *   1. seed/roll determinism (same seed → same values, twice)
 *   2. text/client constructs a Poe POST with expected body shape
 *   3. image/client constructs an OpenAI POST with expected body shape
 *   4. prompts/* builders return non-empty `BuildPromptResult`s
 *
 * Fails loud on any mismatch.
 */

import { createTextClient } from '../text/index.js';
import { createImageClient } from '../image/index.js';
import {
  buildCharacterGenPrompt,
  buildModerationPrompt,
  buildPortraitCurationPrompt,
  parseCharacterCandidate,
  parseModerationResult,
  type AttributeKey,
  type RolledAttribute,
} from '../prompts/index.js';
import { generateAttributeSeed, rollAttributesFromSeed } from '../seed/index.js';

const SCHEMA: AttributeKey[] = [
  { key: 'appearance', label: '外貌', min: 0, max: 100 },
  { key: 'constitution', label: '筋骨', min: 0, max: 100 },
  { key: 'acuity', label: '機敏', min: 0, max: 100 },
];

interface CapturedRequest {
  url: string;
  method: string;
  body: unknown;
}

function installFetchStub(scripted: Array<{ status: number; json: unknown }>): {
  restore: () => void;
  captured: CapturedRequest[];
} {
  const originalFetch = globalThis.fetch;
  const captured: CapturedRequest[] = [];
  let i = 0;
  (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    let body: unknown;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    captured.push({ url, method, body });
    const next = scripted[i++];
    if (!next) throw new Error(`fetch stub: no scripted response at call ${i}`);
    return new Response(JSON.stringify(next.json), {
      status: next.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return {
    restore: () => {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    },
    captured,
  };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL ${msg}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────
// 1. seed/roll determinism
// ───────────────────────────────────────────────────────────────────────
function testSeedDeterminism() {
  const seed = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const a = rollAttributesFromSeed(seed, SCHEMA);
  const b = rollAttributesFromSeed(seed, SCHEMA);
  assert(a.length === 3, 'seed: expected 3 values');
  assert(
    a.every((v, i) => v.value === b[i].value && v.key === b[i].key),
    'seed: same seed must produce identical roll',
  );
  for (const v of a) {
    assert(v.value >= 0 && v.value <= 100, `seed: value out of range for ${v.key}`);
  }

  const seed2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 9]);
  const c = rollAttributesFromSeed(seed2, SCHEMA);
  assert(
    a.some((v, i) => v.value !== c[i].value),
    'seed: different seed should produce different roll (statistically)',
  );

  const fresh = generateAttributeSeed();
  assert(fresh.length === 32, 'seed: generateAttributeSeed returns 32 bytes');

  console.log(`OK  seed roll deterministic        — values: ${a.map((v) => v.value).join(',')}`);
}

// ───────────────────────────────────────────────────────────────────────
// 2. text client: Poe POST body shape
// ───────────────────────────────────────────────────────────────────────
async function testTextClient() {
  const stub = installFetchStub([
    {
      status: 200,
      json: { choices: [{ message: { content: '{"ok": true}' } }], usage: { prompt_tokens: 10 } },
    },
  ]);
  try {
    const client = createTextClient({
      kind: 'cheap',
      config: {
        poeApiKey: 'test-key',
        anthropicApiKey: undefined,
        aiProvider: 'poe',
        poeModelCheap: 'Claude-Haiku-4.5',
      },
      disableFallback: true,
    });
    const res = await client.chat({
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100,
      temperature: 0.5,
    });
    assert(res.text === '{"ok": true}', 'text: response text mismatch');
    assert(res.provider === 'poe', 'text: provider tag wrong');
    assert(stub.captured.length === 1, 'text: expected exactly 1 fetch call');
    const req = stub.captured[0];
    assert(req.url === 'https://api.poe.com/v1/chat/completions', 'text: wrong URL');
    assert(req.method === 'POST', 'text: wrong method');
    const body = req.body as { model: string; messages: Array<{ role: string }>; max_tokens: number };
    assert(body.model === 'Claude-Haiku-4.5', 'text: wrong model');
    assert(body.max_tokens === 100, 'text: maxTokens not propagated');
    assert(body.messages.length === 2 && body.messages[0].role === 'system', 'text: system not first');
    console.log(`OK  text client → Poe POST shape   — model=${body.model}`);
  } finally {
    stub.restore();
  }
}

// ───────────────────────────────────────────────────────────────────────
// 3. image client: OpenAI POST body shape
// ───────────────────────────────────────────────────────────────────────
async function testImageClient() {
  const stub = installFetchStub([
    {
      status: 200,
      json: { data: [{ b64_json: 'ZmFrZQ==', revised_prompt: 'revised' }] },
    },
  ]);
  try {
    const client = createImageClient({
      config: { openaiApiKey: 'test-key', openaiImageModel: 'gpt-image-2' },
    });
    const res = await client.generate({ prompt: 'a painting', aspectRatio: '4:5' });
    assert(res.images.length === 1, 'image: expected 1 image');
    assert(res.images[0].base64 === 'ZmFrZQ==', 'image: base64 not propagated');
    const req = stub.captured[0];
    assert(req.url === 'https://api.openai.com/v1/images/generations', 'image: wrong URL');
    const body = req.body as { model: string; size: string; quality: string; n: number };
    assert(body.model === 'gpt-image-2', 'image: wrong model');
    assert(body.size === '1024x1536', 'image: 4:5 should map to 1024x1536');
    assert(body.n === 1, 'image: default n should be 1');
    assert(body.quality === 'medium', 'image: default quality should be medium');
    console.log(`OK  image client → OpenAI POST     — size=${body.size}`);
  } finally {
    stub.restore();
  }
}

// ───────────────────────────────────────────────────────────────────────
// 4. prompts builders + parsers
// ───────────────────────────────────────────────────────────────────────
function testPrompts() {
  // moderation
  const modPrompt = buildModerationPrompt({ userPrompt: '一個少年武生' });
  assert(modPrompt.messages.length === 1, 'mod: expected 1 message');
  assert(modPrompt.maxTokens === 200, 'mod: maxTokens default mismatch');
  const ok = parseModerationResult('{"verdict": "ok"}');
  assert(ok.verdict === 'ok', 'mod: parse ok');
  const notOk = parseModerationResult('{"verdict": "not_ok", "reason": "test"}');
  assert(notOk.verdict === 'not_ok' && notOk.reason === 'test', 'mod: parse not_ok');
  const bad = parseModerationResult('garbage');
  assert(bad.verdict === 'parse_failed', 'mod: parse fail');

  // character gen
  const rolled: RolledAttribute[] = SCHEMA.map((s, i) => ({
    key: s.key,
    label: s.label,
    value: 50 + i * 10,
  }));
  const charPrompt = buildCharacterGenPrompt({
    userPrompt: '想當小生',
    schemaKeys: SCHEMA,
    rolledValues: rolled,
  });
  assert(charPrompt.maxTokens >= 1000, 'char: should request enough tokens');
  const candidate = parseCharacterCandidate(
    '{"name":"林霽虹","description":"少年武生剛入梨園眉目英朗手腳俐落能擋酒能對戲台上的喧囂卻仍記得家鄉的雨。","physicalFacts":{"gender":"男","age":18,"body":"瘦削"}}',
    rolled,
  );
  assert(candidate !== null, 'char: parse should succeed');
  assert(candidate?.name === '林霽虹', 'char: name parse');
  assert(candidate?.attributes.length === 3, 'char: attributes attached');
  assert(candidate?.physicalFacts.gender === '男', 'char: gender normalized');

  // portrait curate
  const portraitPrompt = buildPortraitCurationPrompt(
    {
      description: '少年武生',
      physical: { gender: '男', ageYears: 18, body: '瘦削' },
      attributes: rolled,
    },
    { toneHint: '水墨工筆畫風格' },
  );
  assert(portraitPrompt.system && portraitPrompt.system.length > 100, 'portrait: system prompt present');
  console.log(`OK  prompts builders + parsers     — moderation/character/portrait`);
}

async function main() {
  testSeedDeterminism();
  await testTextClient();
  await testImageClient();
  testPrompts();
  console.log('\nALL OK — packages/llm Phase 2.2L smoke test passed.');
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
