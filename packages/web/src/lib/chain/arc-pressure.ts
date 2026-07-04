/**
 * §4d.2 arc pressure — forcing as an ACCUMULATOR, structurally not a timer:
 * `accumulate` takes pressingCount (contesting events this tick), never a tick index,
 * and quiet ticks ease pressure (mirrors §2.4 cooling), so forcing rises only because
 * the world tightens. Domain-blind: no scripted events, no hardcoded outcome.
 */

export interface ArcState {
    id: string;
    /** Emergent central question. */
    question: string;
    /** Whose irreversible decision the question hangs on. */
    centralCharId: string;
    /** Moves ONLY on pressing events; eases on quiet ticks. Never tick-fed. */
    pressure: number;
    answered: boolean;
    answer?: string;
}

export type ForcingLevel = 0 | 1 | 2 | 3;

/** Pressure at which the world visibly starts forcing the question. */
export const FORCING_PRESS_BAR = 3;
/** Pressure at which an irreversible answer can no longer be dodged. */
export const FORCING_EDGE_BAR = 6;
/** Relaxation per unpressed tick. */
export const PRESSURE_DECAY = 0.5;

export function newArc(id: string, question: string, centralCharId: string): ArcState {
    return { id, question, centralCharId, pressure: 0, answered: false };
}

/**
 * Fold this tick's pressing into accumulated pressure. `pressingCount` = contesting
 * events bearing on the central character's question this tick, computed by the caller
 * from real activity — NEVER a tick index. Pure.
 */
export function accumulate(arc: ArcState, pressingCount: number, opts: { decay?: number } = {}): ArcState {
    const decay = opts.decay ?? PRESSURE_DECAY;
    const pressure =
        pressingCount > 0 ? arc.pressure + pressingCount : Math.max(0, arc.pressure - decay);
    return { ...arc, pressure };
}

/** A function of accumulated pressure, not ticks. */
export function forcingLevel(arc: ArcState): ForcingLevel {
    if (arc.pressure >= FORCING_EDGE_BAR) return 3;
    if (arc.pressure >= FORCING_PRESS_BAR) return 2;
    if (arc.pressure >= 1) return 1;
    return 0;
}

/**
 * Pressure awareness fed to the CONTESTERS around the central character — never to the
 * central character as an instruction to resolve (that would script the turn, §4d.2).
 * The contesters' own decisions change the world, so the centre resolves naturally.
 */
export function pressureAwareness(level: ForcingLevel, centralName: string): string {
    switch (level) {
        case 0:
        case 1:
            return '';
        case 2:
            return `${centralName}遲遲沒個著落的這件事，懸得夠久了，這一場也逼到了檯面上——你身在其中，也感覺到這股拖不下去的緊。`;
        case 3:
            return `${centralName}這事已經拖到頭了，再耗下去誰都難看，這股壓力你比誰都清楚——接下來你怎麼做、要不要就此了了自己這頭，是你自己的事。`;
    }
}
