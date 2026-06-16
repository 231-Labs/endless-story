// PERCEIVE step — thin chain gather around the pure `perceive-core` assembler.
// Reads the resource ledger + this-tick roster, carries cross-tick cursors
// (last resolutions + last co-present, for the news/arrivals Δ), and returns each
// acting character's objective「當下處境」briefing for PLAN (Step 1, flag-gated).
// Plain module (not 'use server') — called inside the tick loop's server action.

import type { Character } from '@endless-story/shared';
import { type SuiClient } from '@endless-story/sdk';
import { readResourceLedger } from '@/lib/chain/drama';
import { roleResourceAmbition } from '@/lib/chain/drama-core';
import type { CoPresent } from '@/lib/chain/situation-core';
import type { SagaRosterEntry } from '@/lib/chain/roster';
import { buildSituations, type ResolvedLite, type RosterLite } from './perceive-core';

// Process-local cursors, keyed by saga. They survive across ticks in the same
// server process; a cold start simply yields no Δ on the first tick (handled).
const lastResolvedBySaga = new Map<string, ResolvedLite[]>();
const lastCoPresentBySaga = new Map<string, Record<string, CoPresent[]>>();

// The director's current SAGA-PUBLIC beat/crisis (Step 2). Process-local: the web
// service is a long-running process (Zeabur VPS, not serverless), so this persists
// until the director clears it or the process restarts. Character-targeted pressure
// uses inject_dream instead — only public crises live here and reach every Situation.
const directorBeatBySaga = new Map<string, { text: string; phase?: string }>();

/** Director broadcasts a public crisis every character will perceive next tick. */
export function setDirectorBeat(sagaId: string, text: string, phase?: string): void {
    const t = text.trim();
    if (!t) {
        directorBeatBySaga.delete(sagaId);
        return;
    }
    directorBeatBySaga.set(sagaId, phase ? { text: t, phase } : { text: t });
}

/** Clear the public beat (the crisis has passed). */
export function clearDirectorBeat(sagaId: string): void {
    directorBeatBySaga.delete(sagaId);
}

/** Read the current public beat, if any. */
export function getDirectorBeat(sagaId: string): { text: string; phase?: string } | undefined {
    return directorBeatBySaga.get(sagaId);
}

export interface BuildTickSituationsArgs {
    client: SuiClient;
    packageId: string;
    sagaId: string;
    /** the acting slice to build briefings for. */
    slice: Character[];
    /** saga-wide roster with current scenes (post-move positions, if available). */
    roster: SagaRosterEntry[];
    roleById: Map<string, string>;
    /** each character's standing goal (prior plan), if known; surfaced as an explicit field. */
    standingGoalById?: Map<string, string | null>;
}

/**
 * Build each acting character's objective briefing. Returns a map characterId →
 * briefing text (already perception-scoped + guard-checked in perceive-core).
 * Also advances the co-present cursor for next tick's arrivals/departures Δ.
 */
export async function buildTickSituations(args: BuildTickSituationsArgs): Promise<Map<string, string>> {
    const snapshots = await readResourceLedger(args.client, args.packageId, args.sagaId).catch(() => []);
    const resources = snapshots.map((r) => ({
        resourceId: r.id,
        label: r.label,
        heldBy: Object.keys(r.allocations),
    }));

    const roster: RosterLite[] = args.roster.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role || '—',
        sceneId: r.currentSceneId ?? '',
        sceneName: r.currentSceneName ?? '某處',
    }));

    const targets = args.slice.map((c) => ({
        id: c.id,
        name: c.name,
        role: args.roleById.get(c.id) ?? '—',
        standingGoal: args.standingGoalById?.get(c.id) ?? null,
    }));

    const built = buildSituations({
        targets,
        roster,
        resources,
        resolvedLastTick: lastResolvedBySaga.get(args.sagaId) ?? [],
        prevCoPresentByChar: lastCoPresentBySaga.get(args.sagaId),
        ambitionFor: roleResourceAmbition,
        directorBeat: directorBeatBySaga.get(args.sagaId),
    });

    // Advance the co-present cursor (this tick's view becomes next tick's "prev").
    const coPresentByChar = { ...(lastCoPresentBySaga.get(args.sagaId) ?? {}) };
    for (const b of built) coPresentByChar[b.characterId] = b.situation.place.coPresent;
    lastCoPresentBySaga.set(args.sagaId, coPresentByChar);

    return new Map(built.map((b) => [b.characterId, b.briefing]));
}

/** Record this tick's resolutions so next tick's PLAN hears the news (the Δ that
 *  makes plans RESPOND to events instead of self-replicating). */
export function stashTickResolved(sagaId: string, resolved: ResolvedLite[]): void {
    lastResolvedBySaga.set(sagaId, resolved);
}

/** Test/inspection helper — clears cursors for a saga (or all). */
export function __resetPerceiveCursors(sagaId?: string): void {
    if (sagaId) {
        lastResolvedBySaga.delete(sagaId);
        lastCoPresentBySaga.delete(sagaId);
    } else {
        lastResolvedBySaga.clear();
        lastCoPresentBySaga.clear();
    }
}
