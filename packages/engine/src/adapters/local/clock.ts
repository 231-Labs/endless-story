/**
 * LocalClock — the engine's own world clock (ClockPort). Local-first: no chain
 * WorldState. One tick advances currentTick by one; day/part-of-day derive from
 * the fixed ticks-per-day rhythm. Night = the last two parts of the day; the
 * day-end tick is the last of its day (episode weave fires there).
 */

import { PARTS_OF_DAY, type ClockPort, type WorldClock } from '../../ports.ts';

/** Build a fresh clock at tick 0 (day 1). */
export function makeClock(ticksPerDay = 6, currentTick = 0): WorldClock {
    const perDay = Math.max(1, Math.floor(ticksPerDay));
    const tickOfDay = ((currentTick % perDay) + perDay) % perDay;
    const idx = Math.min(PARTS_OF_DAY.length - 1, Math.floor((tickOfDay / perDay) * PARTS_OF_DAY.length));
    return {
        currentTick,
        ticksPerDay: perDay,
        day: Math.floor(currentTick / perDay) + 1,
        tickOfDay,
        partOfDay: PARTS_OF_DAY[idx],
    };
}

export class LocalClock implements ClockPort {
    /** Parts-of-day index at or beyond which it is night (default 入夜/深宵). */
    private readonly nightFrom: number;

    constructor(opts: { nightFrom?: number } = {}) {
        this.nightFrom = opts.nightFrom ?? 4;
    }

    advance(clock: WorldClock): WorldClock {
        return makeClock(clock.ticksPerDay, clock.currentTick + 1);
    }

    isNight(clock: WorldClock): boolean {
        return PARTS_OF_DAY.indexOf(clock.partOfDay) >= this.nightFrom;
    }

    isDayEnd(clock: WorldClock): boolean {
        return clock.tickOfDay === clock.ticksPerDay - 1;
    }
}
