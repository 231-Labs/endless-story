/**
 * AGENT-SEASON · SEASON PERSISTENCE (snapshot / restore → continue a week).
 * ============================================================================
 * A "season" is a week. At its end we SNAPSHOT the characters' MUTATED overlay —
 * the state a week of living changed — then the NEXT week RESTORES it onto a fresh
 * seeded cast and continues: relationships, wants (incl. retired), self-model,
 * health, money and hunger all carry forward.
 *
 * What is persisted = ONLY the mutated overlay. The thick SEED memories are CANON
 * (reloaded verbatim from buildCast → recall every season); the episodic memories a
 * week accumulated live in the LocalRecall JSON dir (run.ts copies that forward
 * separately). Transient per-round flags (sceneThisRound / waitingFor /
 * occupiedRestOfDay / addressedToday / todayLedger / scenesToday) are NOT snapshotted —
 * they reset each round/day, so restoring them would be meaningless.
 *
 * GENERAL / data-driven: keyed purely by character id, never by name. A character
 * ABSENT from the snapshot keeps its seed defaults (so a newly-added cast member in a
 * later week is fine).
 */

import type { Want } from '../../src/index.ts';
import type { Char, DormantChar } from './world.ts';

/** The mutated overlay captured per character. */
export interface CharSnapshot {
    /** otherId → current one-line view (the mutable self-model, latest-wins). */
    relationshipViews: Record<string, string>;
    /** FULL want state — every field of every want, INCLUDING retired ones (so a
     *  settled debt stays settled next week and doesn't re-plan from scratch). */
    wants: Want[];
    /** mutable always-injected identity facts (grew nightly). */
    coreIdentity: string[];
    health: number;
    fatigue: number;
    money: number;
    hunger: number;
    /** 隨身物/行頭 (gifts with provenance) — property persists across weeks. */
    carried?: Array<{ desc: string; from?: string; newUntil?: number }>;
    /** seasons already lived (FINITUDE). Absent in an old snapshot → treated as 0. On
     *  restore it is bumped +1, so a restored character knows one more year has passed. */
    seasonsLived?: number;
    /** The EVOLVED unspoken matter (心事自改). Absent → seed secret stands. */
    secret?: string;
    /** 技藝手感 — practice keeps it, neglect lets it slide (zero-sum time). */
    craft?: number;
}

/** A versioned, JSON-serializable snapshot of the whole cast's mutated overlay. */
export interface CastSnapshot {
    version: 1;
    /** the world tick the snapshot was taken at (end of the week). */
    savedTick: number;
    /** pairs promoted to established in play (pairKey = sorted ids '|'). */
    establishedPairs?: string[];
    /** dormant lives (street vendors …): ledger + heat carry across seasons —
     *  the world keeps growing from being touched. */
    dormants?: Array<{ id: string; heat: number; ledger: Array<{ day: number; note: string }> }>;
    /** charId → its mutated overlay. */
    cast: Record<string, CharSnapshot>;
}

/**
 * Capture the cast's MUTATED overlay (NOT the canon seed memories, NOT transient
 * per-round flags). Deep-copies wants + views so the snapshot never aliases live state.
 */
export function snapshotCast(cast: Char[], savedTick = 0, establishedPairs: string[] = [], dormants: DormantChar[] = []): CastSnapshot {
    const out: Record<string, CharSnapshot> = {};
    for (const c of cast) {
        out[c.id] = {
            relationshipViews: Object.fromEntries(c.relationshipViews),
            wants: c.wants.map((w) => ({ ...w })), // full state incl. retired
            coreIdentity: [...c.coreIdentity],
            health: c.health,
            fatigue: c.fatigue,
            money: c.money,
            hunger: c.hunger,
            carried: c.carried.length ? c.carried.map((it) => ({ ...it })) : undefined,
            seasonsLived: c.seasonsLived,
            secret: c.secret,
            craft: c.craft,
        };
    }
    return {
        version: 1,
        savedTick,
        establishedPairs,
        dormants: dormants.length ? dormants.map((d) => ({ id: d.id, heat: d.heat, ledger: d.ledger.map((l) => ({ ...l })) })) : undefined,
        cast: out,
    };
}

/**
 * OVERLAY a snapshot onto a fresh seeded cast (from buildCast), IN PLACE, by id. A
 * character present in the snapshot has its views / wants / self-model / health / money /
 * fatigue / hunger replaced with the carried-over state; a character ABSENT from the
 * snapshot is left with its seed defaults. Canon thick memories are untouched (they were
 * reloaded verbatim by buildCast). Returns the ids that were actually restored.
 */
/** Overlay saved dormant state (heat/ledger) onto a fresh dormant population. */
export function restoreDormants(dormants: DormantChar[], snap: CastSnapshot): void {
    for (const d of dormants) {
        const s = snap.dormants?.find((x) => x.id === d.id);
        if (!s) continue;
        d.heat = s.heat;
        d.ledger = s.ledger.map((l) => ({ ...l }));
    }
}

export function restoreCast(cast: Char[], snap: CastSnapshot): string[] {
    const restored: string[] = [];
    for (const c of cast) {
        const s = snap.cast[c.id];
        if (!s) continue; // absent → keep seed defaults
        c.relationshipViews = new Map(Object.entries(s.relationshipViews));
        // REBASE want time fields onto the NEW season's clock (which restarts at 0):
        // without this, every want the prior season resolved at tick 35-41 counts as
        // "just resolved" in EVERY nightly regen window of the new season (a 承接
        // flood drowning the 線頭/世道 sources), and restored wants look newborn to
        // age-based fading. savedTick is the prior season's end tick.
        c.wants = s.wants.map((w) => ({
            ...w,
            bornTick: w.bornTick - snap.savedTick,
            resolvedTick: w.resolvedTick != null ? w.resolvedTick - snap.savedTick : w.resolvedTick,
        }));
        c.coreIdentity = [...s.coreIdentity];
        c.health = s.health;
        c.fatigue = s.fatigue;
        c.money = s.money;
        c.carried = s.carried ? s.carried.map((it) => ({ ...it })) : [];
        c.hunger = s.hunger;
        c.seasonsLived = (s.seasonsLived ?? 0) + 1; // one more year has passed
        if (s.secret) c.secret = s.secret; // the matter kept the shape it grew into
        if (typeof s.craft === 'number') c.craft = s.craft;
        restored.push(c.id);
    }
    return restored;
}
