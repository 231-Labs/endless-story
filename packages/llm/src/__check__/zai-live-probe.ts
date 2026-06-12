/**
 * Live probe — verify which text provider actually serves requests.
 *
 * Run from repo root:
 *   set -a && source packages/web/.env.local && set +a
 *   pnpm exec tsx packages/llm/src/__check__/zai-live-probe.ts
 */

import { loadLLMConfig, resolveTextProvider } from '../config.js';
import { createTextClient } from '../text/client.js';

function maskKey(key: string | undefined): string {
  if (!key) return '(unset)';
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

async function probe(kind: 'primary' | 'cheap', label: string) {
  const client = createTextClient({ kind, disableFallback: true });
  const started = Date.now();
  const res = await client.chat({
    system: 'Reply with exactly one JSON object, no markdown.',
    messages: [{ role: 'user', content: 'Say {"ok":true,"tier":"' + kind + '"}' }],
    maxTokens: 64,
    temperature: 0,
  });
  const ms = Date.now() - started;
  return {
    label,
    provider: res.provider,
    model: res.model,
    ms,
    text: res.text.trim().slice(0, 120),
    usage: res.usage,
  };
}

async function main() {
  const cfg = loadLLMConfig();
  const resolved = resolveTextProvider(cfg);

  console.log('=== LLM config ===');
  console.log(`AI_PROVIDER=${cfg.aiProvider}`);
  console.log(`resolveTextProvider() → ${resolved ?? 'null (no key)'}`);
  console.log(`ZAI_API_KEY=${maskKey(cfg.zaiApiKey)}`);
  console.log(`POE_API_KEY=${maskKey(cfg.poeApiKey)}`);
  console.log(`ZAI models: primary=${cfg.zaiModelPrimary} cheap=${cfg.zaiModelCheap}`);
  console.log(`ZAI base: ${cfg.zaiBaseUrl}`);
  console.log('');

  if (!resolved) {
    console.error('FAIL — no text provider configured');
    process.exit(1);
  }

  for (const kind of ['cheap', 'primary'] as const) {
    try {
      const r = await probe(kind, kind);
      console.log(`=== ${r.label} (${kind}) ===`);
      console.log(`provider: ${r.provider}`);
      console.log(`model:    ${r.model}`);
      console.log(`latency:  ${r.ms}ms`);
      console.log(`usage:    ${JSON.stringify(r.usage ?? {})}`);
      console.log(`text:     ${r.text}`);
      if (r.provider !== resolved) {
        console.error(`FAIL — expected provider ${resolved}, got ${r.provider}`);
        process.exit(1);
      }
      console.log('OK');
      console.log('');
    } catch (err) {
      console.error(`FAIL ${kind}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  console.log('ALL OK — live probe passed on', resolved);
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
