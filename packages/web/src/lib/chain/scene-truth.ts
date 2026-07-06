/**
 * Per-scene enacted-truth registry (in-process, one tick horizon ~ spine window).
 *
 * The want scene-loop performs the actual drama — beats (who did what) and inner
 * lines (why) — but the published 回 was woven only from POV re-imaginations,
 * two LLM generations away from that truth. This registry carries the enacted
 * material to the cut weaver's existing (and previously always-empty)
 * `observations` / `intents` inputs, through ONE seam that both cut paths
 * (immediate weave + spine resolve) already share: compileEventChapterAction.
 *
 * Private scenes are never recorded — 窗內事 stays out of public cuts by
 * construction, not by filtering downstream.
 */

export interface SceneTruthEntry {
    day?: number;
    name: string;
    /** Objective beat — what the character did/said. */
    text: string;
    /** The actor's inner line behind the beat (fed as weave `intents`). */
    inner?: string;
}

/** `${sagaId}::${sceneId}` → accumulated entries (spine events span ticks). */
const store = new Map<string, SceneTruthEntry[]>();
const MAX_ENTRIES = 40;

export function recordSceneTruth(sagaId: string, sceneId: string, entry: SceneTruthEntry): void {
    const key = `${sagaId}::${sceneId}`;
    const list = store.get(key) ?? [];
    if (list.length === 0) store.set(key, list);
    list.push(entry);
    if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
}

/** Read-and-clear: the cut that consumes a scene's truth also retires it, so the
 *  next event in the same scene starts a fresh ledger. */
export function takeSceneTruth(sagaId: string, sceneId: string): SceneTruthEntry[] {
    const key = `${sagaId}::${sceneId}`;
    const list = store.get(key) ?? [];
    store.delete(key);
    return list;
}

/** Test-only. */
export function __resetSceneTruth(): void {
    store.clear();
}
