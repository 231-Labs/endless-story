/**
 * Scene lines — "what was just said/done here" per scene (手卷 Step 3).
 *
 * The character agent generates a first-person line every time it acts
 * (decide intent: 「我退後半步，手按舊傷」) or moves (reason: 「我得去帳房找孟老闆」).
 * Those lines are the believable-agent texture, but they're NOT on chain
 * (submit_action only stores a card index). This module keeps the latest
 * line per scene so the live handscroll can float it as a ghost quote
 * instead of the bare card label.
 *
 * **File-backed (single source of truth on disk).** It must be shared by two
 * *different processes / module graphs*:
 *   - the WRITER — the tick loop, reached via the `/api/tick` route handler
 *     (or run headless from a script);
 *   - the READER — `getSagaLiveSnapshot`, a server action behind the handscroll.
 * Next compiles route handlers and server actions into separate bundles (and
 * HMR re-instantiates modules), so a module-level `Map` gave them *different*
 * maps and the rich line never reached the UI (it fell back to the card label).
 * A small JSON file fixes that AND survives a dev-server restart, so the line
 * doesn't vanish every time the process recycles. TTL still ages lines out so a
 * quiet scene goes silent. Durable record is still the POV chapter + gazette
 * (those are anchored on chain); this file is just the transient "now" texture.
 *
 * Single machine only — for multi-instance / serverless, swap `readStore`/
 * `writeStore` for Redis/KV keyed by sceneId (the I/O is isolated here).
 *
 * Server-only (Node runtime; uses fs).
 */

import { readFileSync, writeFileSync } from 'node:fs';

export type SceneLineKind = 'act' | 'move' | 'social';

interface SceneLine {
    characterId: string;
    text: string;
    kind: SceneLineKind;
    ts: number;
}

// Fixed, TMPDIR-independent path so every process agrees (writer + reader may
// run under different TMPDIR values — e.g. a headless tick script vs the dev
// server — and os.tmpdir() would then resolve to different files). Override via
// SCENE_LINES_FILE on non-POSIX hosts.
const STORE_FILE = process.env.SCENE_LINES_FILE ?? '/tmp/endless-story-scene-lines.json';
const TTL_MS = 15 * 60 * 1000; // 15 min — a quiet scene goes silent

function readStore(): Record<string, SceneLine> {
    try {
        const raw = readFileSync(STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, SceneLine>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {}; // missing / unreadable / corrupt → empty
    }
}

function writeStore(store: Record<string, SceneLine>): void {
    try {
        writeFileSync(STORE_FILE, JSON.stringify(store));
    } catch {
        /* disk full / read-only fs → drop the line; it's only transient texture */
    }
}

/** Record the latest line for a scene (newest wins). No-op on empty input. */
export function recordSceneLine(
    sceneId: string | undefined,
    characterId: string,
    text: string | undefined,
    kind: SceneLineKind,
): void {
    if (!sceneId || !characterId || !text?.trim()) return;
    const store = readStore();
    store[sceneId] = { characterId, text: text.trim(), kind, ts: Date.now() };
    writeStore(store);
}

/** Latest non-expired line for a scene, or null. Expired entries are pruned. */
export function getLatestSceneLine(
    sceneId: string,
): { characterId: string; text: string } | null {
    const store = readStore();
    const l = store[sceneId];
    if (!l) return null;
    if (Date.now() - l.ts > TTL_MS) {
        delete store[sceneId];
        writeStore(store);
        return null;
    }
    return { characterId: l.characterId, text: l.text };
}
