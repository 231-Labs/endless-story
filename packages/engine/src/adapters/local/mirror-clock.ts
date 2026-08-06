/**
 * MirrorClock — 鏡像時間的 ClockPort(見 docs/narrative/WORLD_TIME_MIRROR.md)。
 *
 * 牆鐘是時間之源:day / 時辰由真實時刻(UTC+8,年份減 yearOffset)取樣,
 * `advance` 只遞增心跳計數並「重新取樣此刻」——不是把時間往前推一格。
 * 故事時間永不暫停:兩拍之間隔了多久,世界就靜靜活過多久。
 *
 * `now` 可注入(測試傳固定序列即得確定性);lab / CLI season 維持 LocalClock。
 */

import {
    SPRING_SNOW_MIRROR,
    isNightPart,
    storyDayIndex,
    storyNow,
    type MirrorTimeConfig,
} from '@endless-story/shared/world-clock';
import { PARTS_OF_DAY, type ClockPort, type WorldClock } from '../../ports.ts';

/** 以真實時刻取樣一份 WorldClock(tickOfDay := 時辰 index,一日恆六拍)。 */
export function sampleMirrorClock(
    realMs: number,
    epochRealMs: number,
    cfg: MirrorTimeConfig,
    currentTick: number,
): WorldClock {
    const m = storyNow(realMs, cfg);
    return {
        currentTick,
        ticksPerDay: PARTS_OF_DAY.length,
        day: storyDayIndex(realMs, epochRealMs, cfg),
        tickOfDay: m.partIndex,
        partOfDay: m.partOfDay,
    };
}

export class MirrorClock implements ClockPort {
    private readonly epochRealMs: number;
    private readonly cfg: MirrorTimeConfig;
    private readonly now: () => number;

    constructor(opts: { epochRealMs: number; cfg?: MirrorTimeConfig; now?: () => number }) {
        this.epochRealMs = opts.epochRealMs;
        this.cfg = opts.cfg ?? SPRING_SNOW_MIRROR;
        this.now = opts.now ?? (() => Date.now());
    }

    /** 心跳 +1,時間重新取樣此刻(可能跨過任意多個未演繹的時辰)。 */
    advance(clock: WorldClock): WorldClock {
        return sampleMirrorClock(this.now(), this.epochRealMs, this.cfg, clock.currentTick + 1);
    }

    isNight(clock: WorldClock): boolean {
        return isNightPart(clock.partOfDay);
    }

    isDayEnd(clock: WorldClock): boolean {
        return clock.tickOfDay === clock.ticksPerDay - 1;
    }
}
