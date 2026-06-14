/**
 * narrative-audit unit tests — the deterministic self-check is fully data-driven (craft rules
 * by substring on the free-form role, gender/pronoun from the roster), so these assert it (a)
 * catches real role/pronoun/token errors and (b) does NOT false-positive on correct prose,
 * including a brand-new 行當 / character it has never seen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { auditProse } from '../src/services/narrative-audit/index.ts';

const ROSTER = [
    { name: '柳生春', gender: '女', role: '坤生' }, // 女演小生 → 台上presentsMale，可被「他」指
    { name: '蘇映雪', gender: '女', role: '花旦' },
    { name: '沈雪笙', gender: '女', role: '班主' },
    { name: '江聞鶴', gender: '男', role: '乾生' },
];
const liu = { name: '柳生春', role: '坤生', gender: '女' };
const su = { name: '蘇映雪', role: '花旦', gender: '女' };

const has = (vs: string[], frag: string) => vs.some((v) => v.includes(frag));

test('beardless 行當 出現非否定鬍鬚 → 抓', () => {
    assert.ok(has(auditProse('他捋了捋那部黑三', liu, ROSTER), '行當錯誤'));
});
test('否定的鬍鬚（前置/後置）→ 放行', () => {
    assert.equal(auditProse('面上乾淨，不掛髯口', liu, ROSTER).length, 0);
    assert.equal(auditProse('連半根鬍鬚的痕子都沒有', liu, ROSTER).length, 0);
});
test('小生唱老生戲 → 抓戲碼錯誤', () => {
    assert.ok(has(auditProse('他要灌的是《四郎探母》', liu, ROSTER), '戲碼錯誤'));
});
test('女角自身被用「他」當代詞 → 抓', () => {
    assert.ok(has(auditProse('蘇映雪卸了妝，他抬眼看鏡子', su, ROSTER), '性別代詞'));
});
test('「他」指在場男性（被他/盯著他）→ 放行', () => {
    assert.equal(auditProse('蘇映雪被他逼退半步', su, ROSTER).length, 0);
    assert.equal(auditProse('蘇映雪盯著他，沒言聲', su, ROSTER).length, 0);
});
test('女角被稱師兄/師哥 → 抓稱謂錯誤', () => {
    assert.ok(has(auditProse('蘇映雪是我師兄', su, ROSTER), '稱謂錯誤'));
});
test('機制 token 洩漏 → 抓', () => {
    assert.ok(has(auditProse('他打出〔守〕，穩住陣腳', liu, ROSTER), 'token'));
    assert.ok(has(auditProse('爭的是 recording:首張唱片', liu, ROSTER), 'token'));
});
test('通用性：全新行當/角色，無需改規則即生效', () => {
    const roster2 = [...ROSTER, { name: '秦鐵山', gender: '男', role: '老生' }, { name: '霍小翠', gender: '女', role: '武旦' }];
    // 老生掛鬚是本色 → 放行
    assert.equal(auditProse('秦鐵山捋了捋三髯', { name: '秦鐵山', role: '老生', gender: '男' }, roster2).length, 0);
    // 新女角誤用「他」→ 自動抓
    assert.ok(has(auditProse('霍小翠翻身亮相，他擺了個架子', { name: '霍小翠', role: '武旦', gender: '女' }, roster2), '性別代詞'));
    // 未知行當（賬房）→ 不誤判鬍鬚（permissive）
    assert.equal(auditProse('賬房先生捋著鬍子算賬', { name: '某甲', role: '賬房', gender: '男' }, roster2).length, 0);
});
