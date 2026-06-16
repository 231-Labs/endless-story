/**
 * A troupe `Ask` backed by @endless-story/llm — the runner's sanctioned LLM
 * path. Lets the production engine (in @endless-story/troupe) run on the same
 * provider/fallback stack every other runner service uses, instead of troupe's
 * standalone fetch client (that one is for the offline CLI harness only).
 */

import { text as llmText } from '@endless-story/llm';
import type { Ask, AskRequest } from '@endless-story/troupe';

type Client = ReturnType<typeof llmText.createTextClient>;

export function makeProductionAsk(): Ask {
  let primary: Client | null = null;
  let cheap: Client | null = null;

  const ask = (async (req: AskRequest) => {
    const t0 = Date.now();
    ask.calls++;
    try {
      const client =
        req.kind === 'cheap'
          ? (cheap ??= llmText.createTextClient({ kind: 'cheap' }))
          : (primary ??= llmText.createTextClient({ kind: 'primary' }));
      const res = await client.chat({
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        maxTokens: req.maxTokens ?? 1400,
        temperature: req.temperature,
      });
      return res.text.trim();
    } catch (err) {
      ask.failures++;
      ask.lastError = String(err);
      throw err;
    } finally {
      ask.ms += Date.now() - t0;
    }
  }) as Ask;

  ask.mock = false;
  ask.provider = 'llm';
  ask.calls = ask.failures = ask.ms = 0;
  return ask;
}
