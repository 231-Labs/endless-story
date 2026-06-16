// Decoupled unit tests for craft-skill derivation (the production-engine axis).
//
// Node-clean import graph: only ./saga-skills-core.ts (pure, no SDK/chain/I-O),
// so this runs under `node --test --experimental-strip-types` with zero deps.
//
//   node --test --experimental-strip-types packages/web/src/lib/chain/saga-skills-craft.test.ts
//   (or) pnpm --filter @endless-story/web test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    deriveCraftSkills,
    deriveAllSkills,
    deriveSagaSkills,
    CRAFT_SKILL_KEYS,
    SKILL_KEYS,
} from './saga-skills-core.ts';

test('琴師 → composing dominates its own craft profile', () => {
    const c = deriveCraftSkills('琴師');
    assert.ok(c.composing >= 75, `composing=${c.composing}`);
    assert.ok(c.composing > c.playwriting && c.composing > c.lyricism);
});

test('班主 / 文人 → high playwriting (story-minded)', () => {
    assert.ok(deriveCraftSkills('班主').playwriting >= 70);
    assert.ok(deriveCraftSkills('文人').playwriting >= 80);
});

test('旦 → lyricism leads (vocal + literary)', () => {
    const c = deriveCraftSkills('花旦');
    assert.ok(c.lyricism >= c.playwriting && c.lyricism >= c.composing);
});

test('perf feeds craft: more literati → more 編劇/填詞', () => {
    const perfLow = deriveSagaSkills('老生');
    const lowLit = { ...perfLow, literati: 40 };
    const highLit = { ...perfLow, literati: 90 };
    const low = deriveCraftSkills('老生', {}, lowLit);
    const high = deriveCraftSkills('老生', {}, highLit);
    assert.ok(high.playwriting > low.playwriting, `${high.playwriting} > ${low.playwriting}`);
    assert.ok(high.lyricism > low.lyricism);
});

test('unknown 行當 → balanced craft, never skill-less', () => {
    const c = deriveCraftSkills('看客');
    for (const k of CRAFT_SKILL_KEYS) assert.ok(c[k] > 0 && c[k] <= 100);
});

test('all derived values stay in [0,100]', () => {
    for (const role of ['武旦', '琴師', '班主', '淨', '文丑', '坤生']) {
        const c = deriveCraftSkills(role, { acuity: 99, disposition: 99 });
        for (const k of CRAFT_SKILL_KEYS) assert.ok(c[k] >= 0 && c[k] <= 100, `${role}.${k}=${c[k]}`);
    }
});

test('deriveAllSkills = 6 perf + 3 craft on the same DOF', () => {
    const all = deriveAllSkills('武旦');
    for (const k of SKILL_KEYS) assert.ok(typeof all[k] === 'number');
    for (const k of CRAFT_SKILL_KEYS) assert.ok(typeof all[k] === 'number');
    assert.ok('vocal' in all && 'playwriting' in all);
});
