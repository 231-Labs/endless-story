/**
 * Situation core — the PERCEIVE step's pure assembler (no chain, no I/O).
 *
 * The canonical loop (NARRATIVE_AGENTS.md) is perceive → plan → act → reflect,
 * but the code never had a real perceive step: PLAN ran first, fed only by fuzzy
 * self-recall + the standing plan, blind to this tick's drama / events / crises.
 * The `Situation` is that missing authoritative perception: the OBJECTIVE stage a
 * character stands on this tick (where, who's here, what's at stake, what just
 * happened, the director's active beat) — assembled from chain + this-tick state,
 * NOT from memory recall.
 *
 * SEPARATION OF CONCERNS (the load-bearing rule — see PERCEPTION_PLAN.md §1):
 *   - Situation = the objective STAGE. No recall, no interpretation.
 *   - The character's MEMORY + personality = the subjective SOUL: how THIS person
 *     reads the stage and what they choose. That stays in the recall/decide path
 *     and gets STRONGER — two souls on the same stage decide differently.
 * Do not put recalled memories or interpretation into the Situation.
 *
 * Pure + unit-tested (`situation-core.test.ts`), mirroring spine-core / drama-core.
 */

export interface SituationSelf {
    id: string;
    name: string;
    role: string;
    /** The standing plan, carried as an EXPLICIT field (not left to compete inside
     *  recall, where importance=8 made it drown fresh observations and self-perpetuate). */
    standingGoal: string | null;
    vitality?: number;
    solvent?: boolean;
}

export interface CoPresent {
    id: string;
    name: string;
    role: string;
}

/** A contested on-chain resource, with how badly THIS character aches for it. */
export interface ContestedStake {
    resourceId: string;
    label: string;
    /** character ids currently holding the slot(s). */
    heldBy: string[];
    /** this character's tension toward it (0..1); 0 = doesn't want it. */
    myAche: number;
}

export interface OpenEventRef {
    eventId: string;
    label: string;
    cast: string[];
}

/** An event that resolved since this character last appeared — the Δ they "hear about". */
export interface ResolvedNews {
    eventId: string;
    label: string;
    winner: string | null;
    stake: string;
}

/** The director's active narrative beat/crisis — a FIRST-CLASS fact (replaces the
 *  write-only open_storylet signal nothing read). */
export interface DirectorBeat {
    text: string;
    phase?: string;
}

export interface Situation {
    self: SituationSelf;
    place: {
        sceneId: string;
        sceneName: string;
        coPresent: CoPresent[];
    };
    stakes: {
        /** contested resources, strongest ache first. */
        contested: ContestedStake[];
        /** the open event this character is in / forming this tick, if any. */
        openEvent?: OpenEventRef;
    };
    news: {
        resolvedSinceLastSeen: ResolvedNews[];
        arrivals: string[];
        departures: string[];
        directorBeat?: DirectorBeat;
    };
}

/** Raw parts the thin chain fetcher (`situation.ts`) gathers; assembly is pure. */
export interface SituationParts {
    self: SituationSelf;
    sceneId: string;
    sceneName: string;
    /** everyone in the scene INCLUDING self; self is filtered out during assembly. */
    occupants: CoPresent[];
    /** who was co-present the LAST time this character was seen here (for arrivals/departures Δ). */
    prevCoPresent?: CoPresent[];
    /** every contested resource this tick, with this character's ache filled in. */
    contested: ContestedStake[];
    openEvent?: OpenEventRef;
    resolvedSinceLastSeen?: ResolvedNews[];
    directorBeat?: DirectorBeat;
}

/**
 * Assemble the objective Situation. Deterministic + pure:
 *   - co-present excludes self;
 *   - arrivals/departures are the set Δ vs the previous co-present snapshot;
 *   - contested stakes are sorted strongest-ache-first (tie-break by label) so the
 *     prompt leads with what this character most wants.
 */
export function assembleSituation(p: SituationParts): Situation {
    const coPresent = p.occupants.filter((o) => o.id !== p.self.id);
    const nowIds = new Set(coPresent.map((o) => o.id));
    // Distinguish "no history known" (undefined → emit no Δ; else the first sight of
    // a scene reports everyone as a fresh arrival) from "last time nobody was here"
    // ([] → everyone present really is an arrival).
    const hasPrev = p.prevCoPresent !== undefined;
    const prev = p.prevCoPresent ?? [];
    const prevIds = new Set(prev.map((o) => o.id));

    const arrivals = hasPrev ? coPresent.filter((o) => !prevIds.has(o.id)).map((o) => o.name) : [];
    const departures = hasPrev ? prev.filter((o) => !nowIds.has(o.id)).map((o) => o.name) : [];

    const contested = [...p.contested].sort(
        (a, b) => b.myAche - a.myAche || a.label.localeCompare(b.label),
    );

    return {
        self: p.self,
        place: { sceneId: p.sceneId, sceneName: p.sceneName, coPresent },
        stakes: { contested, openEvent: p.openEvent },
        news: {
            resolvedSinceLastSeen: p.resolvedSinceLastSeen ?? [],
            arrivals,
            departures,
            directorBeat: p.directorBeat,
        },
    };
}

/**
 * Render the Situation as a compact 中文 briefing block for a prompt. This is the
 * OBJECTIVE stage only; the caller still appends the character's recalled memories
 * + personality so the SAME stage yields different reactions per soul.
 */
export function renderSituationBriefing(s: Situation): string {
    const lines: string[] = [];
    lines.push(`〔此刻〕你在${s.place.sceneName}。`);
    if (s.place.coPresent.length > 0) {
        lines.push(`同場：${s.place.coPresent.map((c) => `${c.name}（${c.role}）`).join('、')}。`);
    } else {
        lines.push('此處只有你一人。');
    }
    if (s.self.standingGoal) lines.push(`〔你的盤算〕${s.self.standingGoal}`);
    if (s.stakes.contested.length > 0) {
        const top = s.stakes.contested
            .slice(0, 3)
            .map((c) => {
                const held = c.heldBy.length > 0 ? `（在 ${c.heldBy.length} 人手裡）` : '（懸而未決）';
                const ache = c.myAche > 0 ? `你尤其在意` : '你並不上心';
                return `${c.label}${held}—${ache}`;
            })
            .join('；');
        lines.push(`〔台面上的爭奪〕${top}。`);
    }
    if (s.stakes.openEvent) {
        lines.push(`〔正在上演〕${s.stakes.openEvent.label}。`);
    }
    const news: string[] = [];
    for (const r of s.news.resolvedSinceLastSeen) {
        news.push(r.winner ? `${r.label}已有分曉，${r.winner}拔得頭籌` : `${r.label}不了了之`);
    }
    if (s.news.arrivals.length > 0) news.push(`${s.news.arrivals.join('、')}來了`);
    if (s.news.departures.length > 0) news.push(`${s.news.departures.join('、')}走了`);
    if (news.length > 0) lines.push(`〔風聲〕${news.join('；')}。`);
    if (s.news.directorBeat) lines.push(`〔山雨欲來〕${s.news.directorBeat.text}`);
    return lines.join('\n');
}
