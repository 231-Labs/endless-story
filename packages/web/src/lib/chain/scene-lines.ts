/**
 * Scene lines — ephemeral "what was just said/done here" per scene (手卷 Step 3).
 *
 * The character agent generates a first-person line every time it acts
 * (decide intent: 「我退後半步，手按舊傷」) or moves (reason: 「我得去帳房找孟老闆」).
 * Those lines are the believable-agent texture, but they're NOT on chain
 * (submit_action only stores a card index). This module keeps the latest
 * line per scene so the live handscroll can float it as a ghost quote
 * instead of the bare card label.
 *
 * Deliberately in-memory + ephemeral: ghost quotes are transient "now"
 * flavour, not provenance — the durable record is the POV chapter + gazette
 * (those ARE anchored). It resets on restart and isn't shared across instances,
 * which is fine for a transient UI hint. TTL keeps stale lines from lingering.
 *
 * **Process-global on purpose.** The writer (tick loop, reached via the
 * `/api/tick` route handler) and the reader (`getSagaLiveSnapshot` server
 * action) live in DIFFERENT module bundles under Next — and HMR re-instantiates
 * modules in dev — so a plain `const LINES = new Map()` gives them two separate
 * maps and the rich first-person line never reaches the handscroll (it falls
 * back to the bare card label). Pinning the map to `globalThis` makes the whole
 * process share ONE map, so the line the tick records is the line the snapshot
 * reads. (Single-process only; multi-instance / serverless still needs an
 * external store — Redis/KV keyed by sceneId — see the deploy note in the PR.)
 *
 * Server-only (written by the tick loop, read by getSagaLiveSnapshot).
 */

export type SceneLineKind = 'act' | 'move' | 'social';

interface SceneLine {
    characterId: string;
    text: string;
    kind: SceneLineKind;
    ts: number;
}

// Process-global singleton (see header): survive Next's separate route/action
// bundles + dev HMR so writer and reader share one map.
const globalForLines = globalThis as unknown as {
    __endlessSceneLines?: Map<string, SceneLine>;
};
const LINES: Map<string, SceneLine> =
    globalForLines.__endlessSceneLines ?? (globalForLines.__endlessSceneLines = new Map());
const TTL_MS = 15 * 60 * 1000; // 15 min — a quiet scene goes silent

/** Record the latest line for a scene (newest wins). No-op on empty input. */
export function recordSceneLine(
    sceneId: string | undefined,
    characterId: string,
    text: string | undefined,
    kind: SceneLineKind,
): void {
    if (!sceneId || !characterId || !text?.trim()) return;
    LINES.set(sceneId, { characterId, text: text.trim(), kind, ts: Date.now() });
}

/** Latest non-expired line for a scene, or null. Expired entries are pruned. */
export function getLatestSceneLine(
    sceneId: string,
): { characterId: string; text: string } | null {
    const l = LINES.get(sceneId);
    if (!l) return null;
    if (Date.now() - l.ts > TTL_MS) {
        LINES.delete(sceneId);
        return null;
    }
    return { characterId: l.characterId, text: l.text };
}
