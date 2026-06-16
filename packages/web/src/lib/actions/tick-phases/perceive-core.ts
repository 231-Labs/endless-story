// PERCEIVE step — pure assembly of each character's perception-scoped Situation
// from already-gathered tick data. No chain / I-O (the thin gather lives in
// perceive.ts), so this runs under `node --test --experimental-strip-types`.
//
// This is Step 1 of docs/PERCEPTION_PLAN.md: give PLAN / MOVE the objective stage
// they were blind to. Scoping is enforced PER CHARACTER here and double-checked by
// assertPerceivable — holdings are private unless the holder is co-present or the
// resource kind is public (the user's 2026-06-16 ruling). The subjective layer
// (recall + persona) is added by the caller, never here.

import {
    assembleSituation,
    assertPerceivable,
    renderSituationBriefing,
    type CoPresent,
    type Situation,
} from '../../chain/situation-core.ts';

/** A roster entry with its current scene — saga-wide; co-presence is derived from it. */
export interface RosterLite {
    id: string;
    name: string;
    role: string;
    sceneId: string;
    sceneName: string;
}

/** A contested resource as the ledger gives it (every holder). */
export interface ResourceLite {
    resourceId: string;
    label: string; // "kind:詳" e.g. "recording:首本唱片"
    heldBy: string[];
}

/** An event that resolved last tick — the Δ a participant "hears about" this tick. */
export interface ResolvedLite {
    eventId: string;
    label: string;
    winner: string | null;
    stake: string;
    participants: string[];
}

export interface PerceiveTarget {
    id: string;
    name: string;
    role: string;
    standingGoal: string | null;
    vitality?: number;
    solvent?: boolean;
}

export interface PerceiveInput {
    /** the characters to build a Situation for (this tick's acting slice). */
    targets: PerceiveTarget[];
    /** everyone with their current scene (for co-presence + holder scoping). */
    roster: RosterLite[];
    /** every contested resource this tick. */
    resources: ResourceLite[];
    /** events resolved LAST tick (fed forward as this tick's news). */
    resolvedLastTick?: ResolvedLite[];
    /** who was co-present with each character last time (for arrivals/departures Δ). */
    prevCoPresentByChar?: Record<string, CoPresent[]>;
    /** 行當→資源 ache (0..1); injected to keep this core decoupled from drama-core. */
    ambitionFor: (role: string, kind: string) => number;
    /** resource KINDS whose holdings are public knowledge (頭牌/壓軸…); others stay private. */
    publicResourceKinds?: ReadonlySet<string>;
}

export interface PerceivedSituation {
    characterId: string;
    situation: Situation;
    /** the objective「當下處境」block to inject into the prompt. */
    briefing: string;
}

const DEFAULT_PUBLIC_KINDS: ReadonlySet<string> = new Set(['spotlight', 'recording', 'naming', 'martial']);

const kindOf = (label: string) => (label.split(':')[0] || '').trim();

/**
 * Assemble each target's perception-scoped Situation + render its briefing.
 * Every result passes assertPerceivable (off-scene private holders / non-witnessed
 * resolutions are filtered out before assembly and the guard fails closed if any slip).
 */
export function buildSituations(input: PerceiveInput): PerceivedSituation[] {
    const publicKinds = input.publicResourceKinds ?? DEFAULT_PUBLIC_KINDS;
    const sceneOf = new Map(input.roster.map((r) => [r.id, r.sceneId]));
    const publicResourceIds = new Set(
        input.resources.filter((r) => publicKinds.has(kindOf(r.label))).map((r) => r.resourceId),
    );

    const out: PerceivedSituation[] = [];
    for (const t of input.targets) {
        const mine = input.roster.find((r) => r.id === t.id);
        if (!mine) continue; // not placed in a scene this tick → skip (no stage to stand on)
        const sceneId = mine.sceneId;

        const occupants: CoPresent[] = input.roster
            .filter((r) => r.sceneId === sceneId)
            .map((r) => ({ id: r.id, name: r.name, role: r.role }));
        const coPresentIds = new Set(occupants.filter((o) => o.id !== t.id).map((o) => o.id));

        const contested = input.resources
            .map((r) => {
                const kind = kindOf(r.label);
                const ache = input.ambitionFor(t.role, kind);
                const isPublic = publicKinds.has(kind);
                const coHolders = r.heldBy.filter((h) => coPresentIds.has(h));
                const include = ache > 0 || coHolders.length > 0 || isPublic;
                if (!include) return null;
                return {
                    resourceId: r.resourceId,
                    label: r.label,
                    heldBy: isPublic ? [...r.heldBy] : coHolders, // hide off-scene private holders
                    myAche: ache,
                };
            })
            .filter((c): c is NonNullable<typeof c> => c !== null);

        // News: only resolutions this character actually took part in (witnessed
        // first-hand). Public-gazette resolutions are a Step 2/3 extension.
        const myResolved = (input.resolvedLastTick ?? []).filter((e) => e.participants.includes(t.id));
        const castEventIds = new Set(myResolved.map((e) => e.eventId));

        const situation = assembleSituation({
            self: {
                id: t.id,
                name: t.name,
                role: t.role,
                standingGoal: t.standingGoal,
                vitality: t.vitality,
                solvent: t.solvent,
            },
            sceneId,
            sceneName: mine.sceneName,
            occupants,
            prevCoPresent: input.prevCoPresentByChar?.[t.id],
            contested,
            resolvedSinceLastSeen: myResolved.map((e) => ({
                eventId: e.eventId,
                label: e.label,
                winner: e.winner,
                stake: e.stake,
            })),
        });

        // Structural backstop — fails closed if any un-perceivable fact slipped in.
        assertPerceivable(situation, { publicResourceIds, castEventIds });

        out.push({ characterId: t.id, situation, briefing: renderSituationBriefing(situation) });
    }
    return out;
}
