/**
 * 當前敘事日序的單一推導點。
 *
 * 先前有三處各自從鏈上 world 抄一份「tick × bp / 10000 + 1」（saga-live、
 * memory 的 recency、character-read），三份會隨模式改動而互相漂移。這裡收攏
 * 成一個分歧：mirror 之下日序由牆鐘與創世時刻推得（見
 * docs/narrative/WORLD_TIME_MIRROR.md），tick 之下走 shared 的 canonical
 * 整數節律。
 *
 * `day` 是資料鍵（分組、排序、事件 id `d{day}:t{tick}`），永遠是 1-indexed
 * 整數；日期只是它的顯示層投影。
 */

import {
    resolveWorldClockConfig,
    storyDayIndex,
    tickDerivedDay,
} from '@endless-story/shared/world-clock';

export interface DeriveWorldDayArgs {
    currentTick: number;
    daysPerTickBp: number;
    /** 鏈上心跳間隔；缺席時只能靠 env 明示判定模式。 */
    tickIntervalMs?: number;
    /** `WorldState.created_at_ms`——mirror 日序的 epoch。缺席則退回 tick 推導。 */
    createdAtMs?: number;
    nowMs?: number;
}

export function deriveWorldDay(args: DeriveWorldDayArgs): number {
    const cfg = resolveWorldClockConfig(process.env, args.tickIntervalMs);
    // 少了 epoch 就沒有日序原點——寧可退回 tick 推導，也不要憑空定一個創世日。
    if (cfg.mode === 'mirror' && args.createdAtMs && args.createdAtMs > 0) {
        return storyDayIndex(args.nowMs ?? Date.now(), args.createdAtMs, cfg.mirror);
    }
    return tickDerivedDay(args.currentTick, args.daysPerTickBp);
}
