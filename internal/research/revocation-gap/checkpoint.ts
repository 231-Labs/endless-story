/**
 * Checkpoint: shared warm-up snapshot (world.json + recall.json) restored per condition.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LocalRecall } from '../../../packages/engine/src/adapters/local/local-recall.ts';
import { WorldState } from '../../../packages/engine/src/world-state.ts';

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeCheckpoint(dir: string, world: WorldState, recall: LocalRecall): void {
  ensureDir(dir);
  world.snapshot(dir);
  // LocalRecall already persists to dir/recall.json when constructed with dir;
  // force a round-trip by reading store via a throwaway remember of empty skip —
  // instead: clone by file copy if the recall was bound to this dir.
  const recallFile = path.join(dir, 'recall.json');
  if (!fs.existsSync(recallFile)) {
    // In-memory recall (no dir) — dump via a temp LocalRecall bound to dir.
    // We re-seed by constructing a disk-backed recall only when the source was disk.
    // For warm-up we always construct recall with the checkpoint dir (see run.ts).
    fs.writeFileSync(recallFile, JSON.stringify({ seq: 0, store: {} }, null, 0));
  }
}

export function restoreCheckpoint(
  dir: string,
  embeddings: 'deterministic' | 'auto' = 'deterministic',
): { world: WorldState; recall: LocalRecall } {
  const world = WorldState.restore(dir);
  const recall = new LocalRecall(dir, { embeddings });
  return { world, recall };
}

/** Copy a checkpoint directory so two conditions never mutate the shared warm-up. */
export function cloneCheckpoint(src: string, dest: string): void {
  ensureDir(dest);
  for (const name of ['world.json', 'recall.json']) {
    const from = path.join(src, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dest, name));
  }
}
