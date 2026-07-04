/**
 * dream-stir unit tests (§2.51 dose semantics: one tighten, hottest desire,
 * stirred character only, bounded at 0; the input world is mutated by design).
 * Run: TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> src/lib/chain/dream-stir.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALE } from '@endless-story/drama';
import { applyDreamStirs, type WorldState } from './drama-core.ts';

const desire = (id: string, weight: bigint, satisfaction: bigint) => ({
    id,
    statement: `想要${id}`,
    weight,
    satisfaction,
    baseline: satisfaction,
    volatility: SCALE,
    draws_from: [{ resource_id: 'r1', claim: 1n }],
});

const world = (): WorldState => ({
    tick: 0n,
    resources: { r1: { id: 'r1', capacity: 1n, allocations: {} } },
    agents: [
        {
            id: 'zheng',
            desires: [
                desire('頭牌', SCALE, SCALE / 2n), // tension 0.5·SCALE (hottest)
                desire('戲份', SCALE / 2n, SCALE / 2n), // tension 0.25·SCALE
            ],
        },
        { id: 'bai', desires: [desire('留在身邊', SCALE, SCALE / 5n)] },
    ],
});

test('① 只攪被注夢的人、只攪她最燙的 want、一單位 0.18', () => {
    const w = world();
    const applied = applyDreamStirs(w, new Map([['zheng', 0.18]]));
    assert.equal(applied.length, 1);
    assert.equal(applied[0].agentId, 'zheng');
    assert.equal(applied[0].statement, '想要頭牌');
    const drop = (SCALE * 18n) / 100n;
    assert.equal(w.agents[0].desires[0].satisfaction, SCALE / 2n - drop, '最燙的降一單位');
    assert.equal(w.agents[0].desires[1].satisfaction, SCALE / 2n, '第二 want 不動');
    assert.equal(w.agents[1].desires[0].satisfaction, SCALE / 5n, '別人不動');
});

test('② 見底不穿底 — satisfaction 不會負', () => {
    const w = world();
    w.agents[0].desires[0].satisfaction = SCALE / 100n;
    applyDreamStirs(w, new Map([['zheng', 0.18]]));
    assert.equal(w.agents[0].desires[0].satisfaction, 0n);
});

test('③ 空佇列＝identity', () => {
    const w = world();
    const applied = applyDreamStirs(w, new Map());
    assert.equal(applied.length, 0);
    assert.equal(w.agents[0].desires[0].satisfaction, SCALE / 2n);
});

test('④ 沒 desire 的人安全跳過', () => {
    const w = world();
    w.agents.push({ id: 'ghost', desires: [] });
    const applied = applyDreamStirs(w, new Map([['ghost', 0.18]]));
    assert.equal(applied.length, 0);
});
