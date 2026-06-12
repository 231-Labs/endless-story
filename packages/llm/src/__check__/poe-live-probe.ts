/**
 * Live probe — force Poe provider and hit the configured primary/cheap models.
 *
 *   set -a && source packages/web/.env.local && set +a
 *   pnpm --filter @endless-story/cli exec tsx ../llm/src/__check__/poe-live-probe.ts
 */

import { loadLLMConfig } from '../config.js';
import { createTextClient } from '../text/client.js';

function maskKey(key: string | undefined): string {
  if (!key) return '(unset)';
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

async function probe(kind: 'primary' | 'cheap') {
  const cfg = loadLLMConfig();
  if (!cfg.poeApiKey) throw new Error('POE_API_KEY unset');

  const client = createTextClient({
    kind,
    disableFallback: true,
    config: {
      aiProvider: 'poe',
      poeApiKey: cfg.poeApiKey,
      zaiApiKey: undefined,
      anthropicApiKey: undefined,
    },
  });

  const expectedModel = kind === 'primary' ? cfg.poeModelPrimary : cfg.poeModelCheap;
  const started = Date.now();
  const res = await client.chat({
    system: 'Reply with exactly one JSON object, no markdown fences.',
    messages: [{ role: 'user', content: `Say {"ok":true,"tier":"${kind}","model":"${expectedModel}"}` }],
    maxTokens: 64,
    temperature: 0,
  });
  const ms = Date.now() - started;

  return { kind, expectedModel, clientDefault: client.defaultModel, res, ms };
}

async function main() {
  const cfg = loadLLMConfig();
  console.log('=== Poe probe (forced AI_PROVIDER=poe) ===');
  console.log(`POE_API_KEY=${maskKey(cfg.poeApiKey)}`);
  console.log(`POE_MODEL_PRIMARY=${cfg.poeModelPrimary}`);
  console.log(`POE_MODEL_CHEAP=${cfg.poeModelCheap}`);
  console.log('');

  if (!cfg.poeApiKey) {
    console.error('FAIL — POE_API_KEY not set');
    process.exit(1);
  }

  let ok = 0;
  for (const kind of ['cheap', 'primary'] as const) {
    try {
      const r = await probe(kind);
      console.log(`=== ${kind} ===`);
      console.log(`client defaultModel: ${r.clientDefault}`);
      console.log(`request model:    ${r.expectedModel}`);
      console.log(`response model:   ${r.res.model}`);
      console.log(`provider:       ${r.res.provider}`);
      console.log(`latency:        ${r.ms}ms`);
      console.log(`usage:          ${JSON.stringify(r.res.usage ?? {})}`);
      console.log(`text:           ${r.res.text.trim().slice(0, 160)}`);

      if (r.res.provider !== 'poe') {
        console.error(`FAIL — expected provider poe, got ${r.res.provider}`);
        process.exit(1);
      }
      if (r.res.model !== r.expectedModel) {
        console.warn(`WARN — model id differs (requested ${r.expectedModel}, got ${r.res.model})`);
      }
      if (!r.res.text.trim()) {
        console.error('FAIL — empty response');
        process.exit(1);
      }
      console.log('OK\n');
      ok += 1;
    } catch (err) {
      console.error(`FAIL ${kind}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  console.log(`ALL OK — Poe live probe passed (${ok}/2)`);
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
