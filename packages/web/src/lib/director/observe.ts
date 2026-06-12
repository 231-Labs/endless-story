/**
 * Shared OBSERVE reads for the Showrunner heartbeat and the director chat —
 * anything both surfaces need to "see" the story goes here (keeps tools.ts
 * and showrunner.ts free of import cycles).
 */

import { fetchGazettesForSaga } from '@/lib/chain/gazette-read';

const DEFAULT_LIMIT = 3;
const DEFAULT_CHAR_CAP = 1500;

/** Latest gazette texts, oldest-first, each capped. Never throws. */
export async function fetchRecentGazetteTexts(
  sagaId: string,
  opts: { limit?: number; charCap?: number } = {},
): Promise<string> {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 10));
  const charCap = opts.charCap ?? DEFAULT_CHAR_CAP;
  try {
    const entries = await fetchGazettesForSaga(sagaId, { limit });
    if (entries.length === 0) return '（尚無公報）';
    const texts: string[] = [];
    // oldest-first so the LLM reads the story in order
    for (const entry of [...entries].reverse()) {
      try {
        const res = await fetch(entry.blobUrl);
        texts.push((await res.text()).slice(0, charCap));
      } catch {
        texts.push('（本期內文讀取失敗）');
      }
    }
    return texts.join('\n\n---\n\n');
  } catch {
    return '（公報讀取失敗）';
  }
}
