// Pure unit tests for castingFromRole — chain role tag → casting slot.
// Node-clean (only ../src/hangdang.ts → types.ts). Run:
//   node --test packages/troupe/test/casting.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castingFromRole } from '../src/hangdang.ts';

test('exact 應工 tags map to their 行當', () => {
  assert.deepEqual(castingFromRole('花旦'), { hangdang: '旦', yinggong: '花旦' });
  assert.deepEqual(castingFromRole('文小生'), { hangdang: '生', yinggong: '文小生' });
  assert.deepEqual(castingFromRole('銅錘花臉'), { hangdang: '淨', yinggong: '銅錘花臉' });
  assert.deepEqual(castingFromRole('琴師'), { hangdang: '樂', yinggong: '琴師' });
  assert.deepEqual(castingFromRole('武旦'), { hangdang: '旦', yinggong: '武旦' });
  assert.deepEqual(castingFromRole('老旦'), { hangdang: '旦', yinggong: '老旦' });
});

test('行當 keyword fallback for loose tags', () => {
  assert.deepEqual(castingFromRole('小生'), { hangdang: '生', yinggong: '文小生' });
  assert.equal(castingFromRole('坤生').yinggong, '文小生'); // 坤生 plays 小生 roles
  assert.equal(castingFromRole('大花臉').hangdang, '淨');
  assert.equal(castingFromRole('文丑').hangdang, '丑');
  assert.equal(castingFromRole('鼓師').hangdang, '樂');
});

test('班主 / unknown / empty → safe default, never throws', () => {
  assert.ok(['生', '旦', '淨', '丑', '樂'].includes(castingFromRole('班主').hangdang));
  assert.deepEqual(castingFromRole(''), { hangdang: '生', yinggong: '文小生' });
  assert.deepEqual(castingFromRole('看客'), { hangdang: '生', yinggong: '文小生' });
});
