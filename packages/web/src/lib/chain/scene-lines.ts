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
 * (those ARE anchored). A module-level Map shared across server actions in
 * one process (dev server / single instance) is the right altitude; it
 * resets on restart and isn't shared across instances, which is fine for a
 * transient UI hint. TTL keeps stale lines from lingering after inactivity.
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

const LINES = new Map<string, SceneLine>();
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
