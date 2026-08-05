/**
 * 鏡像時間法則（shared/lib/world-clock）— 春雪社改曆的核心語義。
 * 敘事時刻 = 真實時刻（UTC+8 民用時）年份減一百；敘事日界 = 清晨 05:00。
 * 見 docs/narrative/WORLD_TIME_MIRROR.md。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    SPRING_SNOW_MIRROR,
    type MirrorTimeConfig,
    storyNow,
    storyDayIndex,
    storyDateOfDayIndex,
    nextBucketBoundaryMs,
    bucketsBetween,
    shichenLabel,
    chineseNumber,
    formatStoryDate,
    formatStoryDateIso,
    formatStoryMoment,
    inferTimeMode,
    resolveWorldClockConfig,
    MIRROR_TICK_INTERVAL_MS,
    ticksPerDay,
    tickDerivedDay,
    tickOfDay,
    tickPartOfDay,
    toDayPart,
    isNightPart,
} from '@endless-story/shared/world-clock';

const CFG = SPRING_SNOW_MIRROR;

/** 上海民用時 → 真實 UTC 毫秒。 */
function sh(y: number, mo: number, d: number, h: number, mi = 0): number {
    return Date.UTC(y, mo - 1, d, h, mi) - CFG.tzOffsetMinutes * 60_000;
}

test('鏡像法則：2026-08-05 晡時 → 民國十五年八月五日', () => {
    const m = storyNow(sh(2026, 8, 5, 14, 32), CFG);
    assert.equal(m.date.year, 1926);
    assert.equal(m.date.rocYear, 15);
    assert.equal(m.date.month, 8);
    assert.equal(m.date.day, 5);
    assert.equal(m.partOfDay, '晡時');
    assert.equal(m.partIndex, 2);
    assert.equal(m.isNight, false);
    assert.equal(m.hour, 14);
    assert.equal(m.minute, 32);
    assert.equal(formatStoryMoment(m), '民國十五年八月五日 · 晡時');
    assert.equal(formatStoryDateIso(m.date), '1926-08-05');
});

test('六時辰邊界：05:00 起清晨，各四小時', () => {
    const parts = [
        [5, '清晨'], [9, '日午'], [13, '晡時'], [17, '黃昏'], [21, '入夜'], [1, '深宵'],
    ] as const;
    for (const [h, label] of parts) {
        assert.equal(storyNow(sh(2026, 8, 5, h), CFG).partOfDay, label, `${h}:00 → ${label}`);
    }
    assert.equal(storyNow(sh(2026, 8, 5, 4, 59), CFG).partOfDay, '深宵');
    assert.equal(storyNow(sh(2026, 8, 5, 8, 59), CFG).partOfDay, '清晨');
});

test('敘事日界＝清晨：凌晨兩點的戲文記在昨夜', () => {
    // 民用 8/6 02:00（深宵）仍屬敘事日 8/5。
    const smallHours = storyNow(sh(2026, 8, 6, 2, 0), CFG);
    assert.equal(smallHours.date.day, 5);
    assert.equal(smallHours.partOfDay, '深宵');
    assert.equal(smallHours.isNight, true);
    // 05:00 整，新的一日。
    const dawn = storyNow(sh(2026, 8, 6, 5, 0), CFG);
    assert.equal(dawn.date.day, 6);
    assert.equal(dawn.partOfDay, '清晨');
});

test('跨年在黎明：元旦凌晨仍是去年臘月卅一的深宵', () => {
    const m = storyNow(sh(2027, 1, 1, 2, 0), CFG);
    assert.equal(m.date.year, 1926);
    assert.equal(m.date.month, 12);
    assert.equal(m.date.day, 31);
    const newYear = storyNow(sh(2027, 1, 1, 5, 0), CFG);
    assert.equal(newYear.date.year, 1927);
    assert.equal(newYear.date.rocYear, 16);
});

test('星期由故事日期本身推得：1926-08-05 是星期四', () => {
    const m = storyNow(sh(2026, 8, 5, 12), CFG);
    assert.equal(m.date.weekday, 4);
    assert.equal(formatStoryDate(m.date, { withWeekday: true }), '民國十五年八月五日 星期四');
});

test('閏日：2028-02-29 → 1928-02-29（兩皆閏年，不觸鉗）；防禦鉗到 2/28', () => {
    const m = storyNow(sh(2028, 2, 29, 12), CFG);
    assert.equal(m.date.month, 2);
    assert.equal(m.date.day, 29);
    // yearOffset=128 使 2028 → 1900（非閏年）：防禦分支鉗到 2/28。
    const clampCfg: MirrorTimeConfig = { ...CFG, yearOffset: 128 };
    const clamped = storyNow(sh(2028, 2, 29, 12), clampCfg);
    assert.equal(clamped.date.year, 1900);
    assert.equal(clamped.date.month, 2);
    assert.equal(clamped.date.day, 28);
});

test('日序自創世起算，日期是日序的投影', () => {
    const epoch = sh(2026, 7, 1, 10, 0); // 創世：民用 7/1 上午
    assert.equal(storyDayIndex(epoch, epoch, CFG), 1);
    assert.equal(storyDayIndex(sh(2026, 7, 2, 4, 59), epoch, CFG), 1); // 翌日黎明前仍第 1 日
    assert.equal(storyDayIndex(sh(2026, 7, 2, 5, 0), epoch, CFG), 2);
    assert.equal(storyDayIndex(sh(2026, 8, 5, 14), epoch, CFG), 36);
    const d36 = storyDateOfDayIndex(36, epoch, CFG);
    assert.equal(formatStoryDateIso(d36), '1926-08-05');
    // 往返一致：日序 → 日期 → 同一天的任何時刻 → 同日序。
    assert.equal(storyDateOfDayIndex(1, epoch, CFG).day, 1);
});

test('排程邊界：睡到下一個時辰整點', () => {
    const at6 = sh(2026, 8, 5, 6, 17);
    assert.equal(nextBucketBoundaryMs(at6, CFG), sh(2026, 8, 5, 9, 0));
    // 恰在邊界 → 下一個邊界（+4h），不重打當拍。
    assert.equal(nextBucketBoundaryMs(sh(2026, 8, 5, 9, 0), CFG), sh(2026, 8, 5, 13, 0));
    // 入夜跨民用午夜 → 深宵 01:00。
    assert.equal(nextBucketBoundaryMs(sh(2026, 8, 5, 22, 30), CFG), sh(2026, 8, 6, 1, 0));
});

test('停機補償語義：只數經過的邊界，不補歷史積壓', () => {
    // 停機 24 小時 = 錯過 6 拍。
    assert.equal(bucketsBetween(sh(2026, 8, 5, 6), sh(2026, 8, 6, 6), CFG), 6);
    // 同一拍內重啟 = 0。
    assert.equal(bucketsBetween(sh(2026, 8, 5, 6), sh(2026, 8, 5, 8, 59), CFG), 0);
    assert.equal(bucketsBetween(sh(2026, 8, 5, 8), sh(2026, 8, 5, 9, 1), CFG), 1);
});

test('真十二地支時辰加刻', () => {
    assert.equal(shichenLabel(5, 0), '卯時初刻');
    assert.equal(shichenLabel(6, 30), '卯時三刻');
    assert.equal(shichenLabel(14, 32), '未時三刻');
    assert.equal(shichenLabel(23, 10), '子時初刻');
    assert.equal(shichenLabel(0, 10), '子時二刻');
    assert.equal(shichenLabel(0, 40), '子時三刻');
});

test('中文數字：民國紀年所需全域', () => {
    assert.equal(chineseNumber(15), '十五');
    assert.equal(chineseNumber(10), '十');
    assert.equal(chineseNumber(29), '二十九');
    assert.equal(chineseNumber(105), '一百零五');
    assert.equal(chineseNumber(115), '一百一十五');
    assert.equal(chineseNumber(8), '八');
});

test('mirror 世界以心跳節律自述（毋須改合約）', () => {
    assert.equal(inferTimeMode(MIRROR_TICK_INTERVAL_MS), 'mirror');
    assert.equal(inferTimeMode(120_000), 'tick');
    assert.equal(inferTimeMode(undefined), 'tick');
    // env 明示優先於鏈上推斷。
    assert.equal(resolveWorldClockConfig({ ES_TIME_MODE: 'tick' }, MIRROR_TICK_INTERVAL_MS).mode, 'tick');
    assert.equal(resolveWorldClockConfig({}, MIRROR_TICK_INTERVAL_MS).mode, 'mirror');
    const r = resolveWorldClockConfig({ ES_MIRROR_YEAR_OFFSET: '98' }, MIRROR_TICK_INTERVAL_MS);
    assert.equal(r.mirror.yearOffset, 98);
    assert.equal(r.mirror.tzOffsetMinutes, 480);
});

test('tick 模式：bp 數學單一來源，整數節律為 canonical（漂移已修）', () => {
    assert.equal(ticksPerDay(1670), 6);
    assert.equal(ticksPerDay(10_000), 1);
    assert.equal(tickDerivedDay(0, 1670), 1);
    assert.equal(tickDerivedDay(35, 1670), 6);
    assert.equal(tickDerivedDay(36, 1670), 7);
    // 舊 bp 公式在 tick 503 給第 85 日（6×1670=10020≠10000 的累積漂移）；
    // canonical 整數節律給第 84 日，與引擎一致。
    assert.equal(tickDerivedDay(503, 1670), 84);
    assert.equal(tickOfDay(7, 1670), 1);
    assert.equal(tickPartOfDay(0, 1670), '清晨');
    assert.equal(tickPartOfDay(5, 1670), '深宵');
});

test('讀者站四分投影與夜段判定', () => {
    assert.equal(toDayPart('清晨'), 'morning');
    assert.equal(toDayPart('晡時'), 'noon');
    assert.equal(toDayPart('黃昏'), 'dusk');
    assert.equal(toDayPart('深宵'), 'night');
    assert.equal(isNightPart('入夜'), true);
    assert.equal(isNightPart('日午'), false);
});
