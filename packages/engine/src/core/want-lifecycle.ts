/**
 * 願望生命週期 — the exit lanes a write-only want system was missing.
 *
 * Diagnosed failure: over 13 ticks the world spawned 58 live wants and resolved
 * 4. Wants had one way in (every stir spawns one) and effectively no way out —
 * `fadeStaleWants` only reaps cold ripples, and everything else waited on an LLM
 * 判決 that almost never came. The 願榜 became a landfill, and the resolved rate —
 * the story's heartbeat — flatlined.
 *
 * Two deterministic lanes are added here, both settled from persisted state so a
 * replay retires the same wants on the same ticks:
 *
 *   · `settleCompletedWants` — a want that declared a `completion` test at birth
 *     resolves the moment the world satisfies it. No model call.
 *   · `forecloseDueWants` — a want that declared a `dueDay` and reached it dies
 *     as 'foreclosed', with ONE line telling its owner so. A deadline that never
 *     arrives is what made 「月半結帳」 recede forever; a want's deadline is the
 *     same promise at the scale of one heart.
 *
 * Both lanes leave `resolutionCause` set regardless of the STRICT flag: the
 * cause is the audit trail for the resolved-rate vital, not a research shadow.
 */

import { accountFace, yuanToSubunits } from './season-economy.ts';
import { tension, type Want } from './want-core.ts';
import type { WorldState } from '../world-state.ts';

export interface WantLifecycleReport {
    /** wants whose completion test held — retired as genuinely answered. */
    resolved: Want[];
    /** wants that hit their 死線 unanswered — retired as foreclosed. */
    foreclosed: Want[];
    /** one private percept per affected owner, ready to schedule. */
    notices: Array<{ characterId: string; text: string }>;
}

const emptyReport = (): WantLifecycleReport => ({ resolved: [], foreclosed: [], notices: [] });

/** Is this want's declared completion test satisfied by the world right now?
 *  Pure read — never mutates. Unknown subjects answer `false` (a want pinned to
 *  a bill that no longer exists simply waits for its 死線). */
export function completionHolds(world: WorldState, want: Want): boolean {
    const completion = want.completion;
    if (!completion) return false;
    switch (completion.kind) {
        case 'bill-cleared': {
            const bill = world.data.economy?.bills?.find((row) => row.id === completion.billId);
            if (!bill) return false;
            return BigInt(bill.paidSubunits) >= BigInt(bill.amountSubunits);
        }
        case 'flowers-caught': {
            const table = world.data.patronage?.flowersByChar ?? {};
            return (table[want.characterId] ?? 0) >= (table[completion.rivalId] ?? 0);
        }
        case 'purse-atleast': {
            const purse = accountFace(world, want.characterId);
            if (!purse) return false;
            return purse.available >= yuanToSubunits(world, completion.yuan);
        }
        case 'secret-published': {
            const secret = world.data.secretLedger?.find((row) => row.id === completion.secretId);
            return !!secret?.publishedDay;
        }
    }
}

/**
 * Lane 1 — retire every live want whose declared completion test now holds.
 * Marks cause 'resolved' so the vital counts it as a real answer, and cools the
 * owner's other standing wants the same way a judged resolution does (a settled
 * matter takes some pressure off the rest of the heart).
 */
export function settleCompletedWants(world: WorldState, tick: number): WantLifecycleReport {
    const report = emptyReport();
    for (const want of world.data.wants) {
        if (want.retired || !want.completion) continue;
        if (!completionHolds(world, want)) continue;
        want.retired = true;
        want.resolvedTick = tick;
        want.resolutionCause = 'resolved';
        want.resolvedNote = want.resolvedNote ?? '（這樁，落地了）';
        report.resolved.push(want);
        report.notices.push({
            characterId: want.characterId,
            text: `「${want.desc}」——這一樁，總算是有了下文。`,
        });
    }
    return report;
}

/**
 * Lane 2 — a want past its 死線 forecloses. The owner learns it ONCE (so tonight's
 * self-rewrite has something真的 to move on from), and the want stops pressing.
 * Wants with no `dueDay` are untouched, so a world that authors no deadlines
 * behaves exactly as before.
 */
export function forecloseDueWants(world: WorldState, day: number, tick: number): WantLifecycleReport {
    const report = emptyReport();
    for (const want of world.data.wants) {
        if (want.retired || want.dueDay === undefined) continue;
        if (day <= want.dueDay) continue;
        want.retired = true;
        want.resolvedTick = tick;
        want.resolutionCause = 'foreclosed';
        want.resolvedNote = '（日子到了，這樁沒了下文）';
        report.foreclosed.push(want);
        report.notices.push({
            characterId: want.characterId,
            text: `「${want.desc}」——說好的日子過了，這件事就這麼擱下了，再提也沒有意思。`,
        });
    }
    return report;
}

/** Both lanes, completion first (a want that JUST landed must not be recorded as
 *  a foreclosure on the same tick). */
export function runWantLifecycle(world: WorldState, day: number, tick: number): WantLifecycleReport {
    const completed = settleCompletedWants(world, tick);
    const due = forecloseDueWants(world, day, tick);
    return {
        resolved: completed.resolved,
        foreclosed: due.foreclosed,
        notices: [...completed.notices, ...due.notices],
    };
}

/** 心跳 — the season's resolved rate: genuinely-answered wants over all wants
 *  that have left the board (resolved + faded + foreclosed). A rate of 0 means
 *  nothing in this world ever lands; that was the diagnosis. */
export function resolvedRate(wants: ReadonlyArray<Want>): { resolved: number; retired: number; live: number; rate: number } {
    let resolved = 0;
    let retired = 0;
    let live = 0;
    for (const want of wants) {
        if (!want.retired) {
            live += 1;
            continue;
        }
        retired += 1;
        // Legacy runs never stamped a cause; a retired want carrying a note that
        // is not one of the two "gave up" notes counts as a real resolution.
        const cause = want.resolutionCause ?? (want.resolvedNote?.includes('淡了') || want.resolvedNote?.includes('過去了') ? 'faded' : 'resolved');
        if (cause === 'resolved') resolved += 1;
    }
    return { resolved, retired, live, rate: retired > 0 ? resolved / retired : 0 };
}

/** The hottest live want per character — the deck's targeting reads it to aim a
 *  card at whoever is most under pressure. */
export function hottestWantOf(world: WorldState, characterId: string): Want | undefined {
    let best: Want | undefined;
    for (const want of world.data.wants) {
        if (want.retired || want.characterId !== characterId) continue;
        if (!best || tension(want) > tension(best)) best = want;
    }
    return best;
}
