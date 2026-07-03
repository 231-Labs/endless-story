/**
 * §4d.2 arc pressure — the FORCING as an ACCUMULATOR (per the scene-param design: pressure
 * builds from what HAPPENS in the scene, echoing on-chain `SceneParams` + `apply_params_delta`),
 * NOT a tick counter. Each contesting action/event bearing on an arc's central question adds
 * pressure; an unpressed tick relaxes a little (mirrors the §2.4 relationship cooling). The
 * accumulated value drives the forcing that the arc's central character feels — so the deadline
 * is something the drama genuinely built up, never something a timer imposed.
 *
 * ── 寫死自檢 (structurally impossible to be a timer) ────────────────────────────────
 *   `accumulate` takes `pressingCount` = HOW MANY contesting things happened this tick, and
 *   NEVER a tick index. Pressure moves ONLY when something presses (pressingCount > 0). A quiet
 *   world (nothing presses) never raises forcing — it eases. So forcing rises because the world
 *   TIGHTENS, not because time passes. The forcing note is generic ("this central question"),
 *   domain-blind — no scripted "白南下/簽約" events, no hardcoded outcome.
 */

export interface ArcState {
    id: string;
    /** The central question (emergent — derived from the staged contention + central character). */
    question: string;
    /** Whose irreversible decision the question hangs on. */
    centralCharId: string;
    /** Accumulated pressure. Moves ONLY on pressing events; eases on quiet ticks. Never tick-fed. */
    pressure: number;
    answered: boolean;
    answer?: string;
}

export type ForcingLevel = 0 | 1 | 2 | 3;

/** Accumulated pressure at which the world visibly starts forcing the question. */
export const FORCING_PRESS_BAR = 3;
/** Accumulated pressure at which it is 退無可退 (must give an irreversible answer). */
export const FORCING_EDGE_BAR = 6;
/** How much an UNPRESSED tick relaxes pressure (drama tension fades if not maintained). */
export const PRESSURE_DECAY = 0.5;

export function newArc(id: string, question: string, centralCharId: string): ArcState {
    return { id, question, centralCharId, pressure: 0, answered: false };
}

/**
 * Fold this tick's pressing into the arc's accumulated pressure. `pressingCount` = the number
 * of contesting actions/events that bore on the central character's question this tick (co-present
 * pressers, ultimatums, intrusions — computed by the caller from real tick activity, NEVER a tick
 * index). Pressed ⇒ add; unpressed ⇒ ease. Pure.
 */
export function accumulate(arc: ArcState, pressingCount: number, opts: { decay?: number } = {}): ArcState {
    const decay = opts.decay ?? PRESSURE_DECAY;
    const pressure =
        pressingCount > 0 ? arc.pressure + pressingCount : Math.max(0, arc.pressure - decay);
    return { ...arc, pressure };
}

/** Forcing level = a function of ACCUMULATED PRESSURE (not ticks). */
export function forcingLevel(arc: ArcState): ForcingLevel {
    if (arc.pressure >= FORCING_EDGE_BAR) return 3;
    if (arc.pressure >= FORCING_PRESS_BAR) return 2;
    if (arc.pressure >= 1) return 1;
    return 0;
}

/**
 * The pressure AWARENESS fed to the CONTESTERS around the central character — never to the central
 * character as an instruction to resolve (that was a soft hardcode: it scripts the turn's OCCURRENCE;
 * see emergent-turn-selfdrive §4d.2). Instead the OTHERS feel the mounting「拖不下去」, and — like 白韻秋
 * autonomously choosing to let go and leave — their own decision changes the world (an option collapses,
 * a claim is made), so the central character resolves NATURALLY by responding, never told to. The note
 * explicitly hands the action back to the contester ("你怎麼做是你自己的事"). Domain-blind; no scripted
 * event, no preferred answer.
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
