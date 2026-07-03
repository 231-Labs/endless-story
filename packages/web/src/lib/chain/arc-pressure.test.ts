/**
 * arc-pressure unit test — proves the forcing is an ACCUMULATOR driven by events, and is
 * STRUCTURALLY INCAPABLE of being a tick-timer (the §4d.2 寫死自檢 turned into assertions).
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/chain/arc-pressure.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newArc, accumulate, forcingLevel, FORCING_PRESS_BAR, FORCING_EDGE_BAR } from './arc-pressure.ts';

test('① 壓力只在有事發生時漲 — pressing raises pressure', () => {
    let arc = newArc('a', 'q', 'liu');
    arc = accumulate(arc, 2); // 兩方施壓
    assert.ok(arc.pressure >= 2, '有事發生 → 壓力漲');
});

test('② 不是計時器 — 空轉 20 拍、沒事發生 → forcing 仍 0', () => {
    let arc = newArc('a', 'q', 'liu');
    for (let i = 0; i < 20; i += 1) arc = accumulate(arc, 0); // 20 個安靜的拍
    assert.equal(forcingLevel(arc), 0, '時間流逝但沒事發生 → 不逼問（證明不吃 tick 數）');
});

test('③ 匯流壓力持續 → 退無可退', () => {
    let arc = newArc('a', 'q', 'liu');
    for (let i = 0; i < 3; i += 1) arc = accumulate(arc, 3); // 三方連續施壓
    assert.ok(arc.pressure >= FORCING_EDGE_BAR);
    assert.equal(forcingLevel(arc), 3, '世界真的收緊 → 退無可退');
});

test('④ 世界收手 → 壓力回落、arc 重新可拖', () => {
    let arc = newArc('a', 'q', 'liu');
    arc = accumulate(arc, 4);
    assert.equal(forcingLevel(arc), 2, '匯流時世界在逼');
    for (let i = 0; i < 12; i += 1) arc = accumulate(arc, 0); // 沒人再逼
    assert.equal(forcingLevel(arc), 0, '不維持壓力 → 鬆掉（像關係冷卻）');
});

test('⑤ forcing 分級隨累積壓力、非隨時間', () => {
    let arc = newArc('a', 'q', 'liu');
    assert.equal(forcingLevel(arc), 0);
    arc = accumulate(arc, 1);
    assert.equal(forcingLevel(arc), 1);
    arc = accumulate(arc, FORCING_PRESS_BAR);
    assert.equal(forcingLevel(arc), 2);
    arc = accumulate(arc, FORCING_EDGE_BAR);
    assert.equal(forcingLevel(arc), 3);
});
