/**
 * MirrorClock（ClockPort 的鏡像時間 adapter）— advance 是「心跳 +1 並重新取樣
 * 此刻」，不是把時間推一格。停機跨拍時 day/時辰直接跳到現在，不補歷史積壓。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPRING_SNOW_MIRROR } from '@endless-story/shared/world-clock';
import { MirrorClock, sampleMirrorClock } from '../src/adapters/local/mirror-clock.ts';

const CFG = SPRING_SNOW_MIRROR;

/** 上海民用時 → 真實 UTC 毫秒。 */
function sh(y: number, mo: number, d: number, h: number, mi = 0): number {
    return Date.UTC(y, mo - 1, d, h, mi) - CFG.tzOffsetMinutes * 60_000;
}

test('取樣：tickOfDay = 時辰 index，一日恆六拍', () => {
    const epoch = sh(2026, 7, 1, 10);
    const c = sampleMirrorClock(sh(2026, 8, 5, 14, 32), epoch, CFG, 42);
    assert.equal(c.currentTick, 42);
    assert.equal(c.ticksPerDay, 6);
    assert.equal(c.day, 36);
    assert.equal(c.tickOfDay, 2);
    assert.equal(c.partOfDay, '晡時');
});

test('advance 重取樣此刻：正常排程走到下一時辰，停機則直接跳到現在', () => {
    const epoch = sh(2026, 7, 1, 10);
    const moments = [sh(2026, 8, 5, 17, 0), sh(2026, 8, 8, 9, 0)];
    let i = 0;
    const clock = new MirrorClock({ epochRealMs: epoch, cfg: CFG, now: () => moments[i++] });

    const start = sampleMirrorClock(sh(2026, 8, 5, 14, 0), epoch, CFG, 10);
    const next = clock.advance(start);
    assert.equal(next.currentTick, 11);
    assert.equal(next.partOfDay, '黃昏');
    assert.equal(next.day, 36);

    // 第二次 advance 時「現在」已是三天後——世界靜靜活過了無事的三日。
    const resumed = clock.advance(next);
    assert.equal(resumed.currentTick, 12);
    assert.equal(resumed.day, 39);
    assert.equal(resumed.partOfDay, '日午');
});

test('夜與日終語義沿用六拍節律', () => {
    const epoch = sh(2026, 7, 1, 10);
    const clock = new MirrorClock({ epochRealMs: epoch, cfg: CFG, now: () => 0 });
    const nightC = sampleMirrorClock(sh(2026, 8, 5, 22), epoch, CFG, 0);
    assert.equal(clock.isNight(nightC), true);
    assert.equal(clock.isDayEnd(nightC), false);
    const deepNight = sampleMirrorClock(sh(2026, 8, 6, 2), epoch, CFG, 0);
    assert.equal(deepNight.partOfDay, '深宵');
    assert.equal(clock.isDayEnd(deepNight), true);
    const noonC = sampleMirrorClock(sh(2026, 8, 5, 12), epoch, CFG, 0);
    assert.equal(clock.isNight(noonC), false);
});
