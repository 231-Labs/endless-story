/**
 * Story-bible persistence — the novel's running continuity state per saga.
 *
 * File-backed (same model + rationale as scene-lines.ts): the WRITER (the cut
 * weave inside the tick, via `/api/tick`) and any READER share one JSON file so
 * a recycled module graph doesn't lose the thread. The durable record is the
 * anchored chapters on chain; this is the "story so far" the storyteller reads
 * to write each回 as the NEXT movement (承先啟後) and folds forward after.
 *
 * Keyed by sagaId in a single file. Server-only (Node fs). Best-effort: any
 * read/write failure degrades to an empty bible — continuity simply restarts,
 * it never blocks a weave.
 *
 * Single machine only (the VPS world-loop). NOTE: an ephemeral container wipes
 * /tmp on redeploy, so continuity resets per deploy — acceptable while a run
 * spans many ticks between deploys; swap STORE_FILE for a volume / on-chain
 * commitment if cross-deploy continuity is needed.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { storyteller } from '@endless-story/runner';

type StoryBible = storyteller.StoryBible;

const STORE_FILE = process.env.STORY_BIBLE_FILE ?? '/tmp/endless-story-bible.json';

function readStore(): Record<string, StoryBible> {
    try {
        const parsed = JSON.parse(readFileSync(STORE_FILE, 'utf8')) as Record<string, StoryBible>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

/** The saga's bible, or a fresh empty one (never throws). */
export function loadBible(sagaId: string): StoryBible {
    return readStore()[sagaId] ?? storyteller.emptyBible(sagaId);
}

/** Persist the saga's bible (best-effort; a write failure is swallowed). */
export function saveBible(bible: StoryBible): void {
    try {
        const store = readStore();
        store[bible.sagaId] = bible;
        writeFileSync(STORE_FILE, JSON.stringify(store));
    } catch {
        /* read-only fs / disk full → drop it; continuity restarts next time */
    }
}
