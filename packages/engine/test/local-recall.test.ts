/**
 * LocalRecall scoring is UNCHANGED by the self-model work. The eviction fix does
 * NOT touch this channel: episodic memory stays append-only with importance ×
 * recency(halfLife=2) × relevance scoring. This test locks that behaviour so a
 * future edit to the recall lottery is caught — the whole point of the self-model
 * is that "who X is to me" left this channel, not that this channel changed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';

test('recency decay (halfLife=2) still ranks a newer identical memory above an older one', async () => {
    const r = new LocalRecall(); // in-memory, deterministic hash embeddings (no key)
    await r.remember('c0', '除夕那年的暗號', { kind: 'observation', importance: 5, day: 1 });
    await r.remember('c0', '除夕那年的暗號', { kind: 'observation', importance: 5, day: 5 });
    const out = await r.recall('c0', '除夕那年的暗號', 2, 5);
    assert.equal(out.length, 2, 'both returned');
    assert.equal(out[0].day, 5, 'newer (less-decayed) copy ranks first — recency still applied');
    assert.equal(out[1].day, 1, 'older copy ranks below');
    assert.equal(r.hits, 2, 'hit counter advanced by the returned count');
});

test('a wall of recent trivia crowds out an older core memory in the top-K (the eviction this fixes)', async () => {
    const r = new LocalRecall();
    // One old, high-importance core memory.
    await r.remember('c0', '金鳳是我的舊情人', { kind: 'genesis', importance: 9, day: 1 });
    // A pile of recent, low-importance trivia on an unrelated query axis.
    for (let i = 0; i < 15; i++) {
        await r.remember('c0', `後台瑣事第${i}樁`, { kind: 'observation', importance: 2, day: 6 });
    }
    // Query along the trivia axis: recency×relevance buries the old core line out
    // of a small top-K — exactly the failure the self-model channel sidesteps.
    const top3 = await r.recall('c0', '後台瑣事', 3, 6);
    assert.ok(!top3.some((m) => m.text.includes('舊情人')), 'core memory evicted from top-3 by recent trivia — recall behaves as before');
});
