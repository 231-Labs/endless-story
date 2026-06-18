/**
 * Scene lines — "what was just said/done here" per scene (handscroll Step 3).
 *
 * The character agent generates a first-person line every time it acts
 * (decide intent) or moves (reason), e.g. "I step back, hand on the old wound".
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
 * doesn't vanish every time the process recycles. A scene keeps its latest line
 * until a newer act/move supersedes it — no TTL (an aggressive TTL kept wiping
 * the rich line back to the bare card label between ticks). Durable record is
 * still the POV chapter + gazette (anchored on chain); this is "now" texture.
 *
 * Single machine only — for multi-instance / serverless, swap `readStore`/
 * `writeStore` for Redis/KV keyed by sceneId (the I/O is isolated here).
 *
 * Server-only (Node runtime; uses fs).
 */

import { readFileSync, writeFileSync } from 'node:fs';

/** What KIND of beat the line is — lets the handscroll tint each ghost quote so
 *  the world reads alive in more than one register: 爭(act) · 走(move) · 周旋(social)
 *  · 盤算(plan) · 暖(warmth). */
export type SceneLineKind = 'act' | 'move' | 'social' | 'plan' | 'warmth';

export interface SceneLine {
    characterId: string;
    text: string;
    kind: SceneLineKind;
    ts: number;
}

/** Recent lines kept per scene (the living stream, newest last). */
const RING = 5;

// Fixed, TMPDIR-independent path so every process agrees (writer + reader may
// run under different TMPDIR values — e.g. a headless tick script vs the dev
// server — and os.tmpdir() would then resolve to different files). Override via
// SCENE_LINES_FILE on non-POSIX hosts.
const STORE_FILE = process.env.SCENE_LINES_FILE ?? '/tmp/endless-story-scene-lines.json';

/** sceneId → recent lines (newest last). Tolerates the legacy single-object
 *  shape (one line per scene) by wrapping it in a one-element ring. */
function readStore(): Record<string, SceneLine[]> {
    try {
        const raw = readFileSync(STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, SceneLine | SceneLine[]>;
        if (!parsed || typeof parsed !== 'object') return {};
        const out: Record<string, SceneLine[]> = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (Array.isArray(v)) out[k] = v;
            else if (v && typeof v === 'object') out[k] = [v as SceneLine]; // legacy
        }
        return out;
    } catch {
        return {}; // missing / unreadable / corrupt → empty
    }
}

function writeStore(store: Record<string, SceneLine[]>): void {
    try {
        writeFileSync(STORE_FILE, JSON.stringify(store));
    } catch {
        /* disk full / read-only fs → drop the line; it's only transient texture */
    }
}

/** Append a line to a scene's living stream (ring-trimmed to RING). De-dupes an
 *  immediate exact repeat (same character + text) so a re-run doesn't stutter. */
export function recordSceneLine(
    sceneId: string | undefined,
    characterId: string,
    text: string | undefined,
    kind: SceneLineKind,
): void {
    if (!sceneId || !characterId || !text?.trim()) return;
    const store = readStore();
    const ring = store[sceneId] ?? [];
    const last = ring[ring.length - 1];
    const clean = text.trim();
    if (last && last.characterId === characterId && last.text === clean) return;
    ring.push({ characterId, text: clean, kind, ts: Date.now() });
    store[sceneId] = ring.slice(-RING);
    writeStore(store);
}

/** Latest recorded line for a scene, or null (back-compat). */
export function getLatestSceneLine(
    sceneId: string,
): { characterId: string; text: string; kind: SceneLineKind } | null {
    const ring = readStore()[sceneId];
    const l = ring?.[ring.length - 1];
    return l ? { characterId: l.characterId, text: l.text, kind: l.kind } : null;
}

/** Recent lines for a scene, newest first, up to `n`. */
export function getRecentSceneLines(sceneId: string, n = RING): SceneLine[] {
    const ring = readStore()[sceneId] ?? [];
    return ring.slice(-n).reverse();
}

/** A saga-wide pulse: the newest lines across all scenes, newest first. */
export function getRecentSceneLinesAcross(n = 8): Array<SceneLine & { sceneId: string }> {
    const store = readStore();
    const all: Array<SceneLine & { sceneId: string }> = [];
    for (const [sceneId, ring] of Object.entries(store)) {
        for (const l of ring) all.push({ ...l, sceneId });
    }
    return all.sort((a, b) => b.ts - a.ts).slice(0, n);
}
