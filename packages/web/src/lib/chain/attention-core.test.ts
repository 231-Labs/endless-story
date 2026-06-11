// Attention coupling — pure overlay on the demand signal. Runs under `node --test`.
//
//   pnpm --filter @endless-story/web test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coupleAttention } from './attention-core.ts';

const r = (characterId: string, statement: string, tension: number) => ({ characterId, statement, tension });

test('a character with a single desire is unchanged (fully funded)', () => {
    const rows = [r('liu', '爭得「recording:唱片」', 0.6)];
    const out = coupleAttention(rows, { focus: 1 });
    assert.equal(out[0].tension, 0.6);
});

test('a character split across two desires neglects the weaker one (it aches more)', () => {
    const rows = [
        r('liu', '爭得「recording:唱片」', 0.6),
        r('liu', '與某人搭戲', 0.5),
    ];
    const out = coupleAttention(rows, { focus: 1, spill: 0.35 });
    const recording = out.find((x) => x.statement.includes('recording'))!;
    const partner = out.find((x) => x.statement.includes('搭戲'))!;
    assert.equal(recording.tension, 0.6, 'top desire funded → unchanged');
    // neglected: 0.5 * (1 + 0.35*1) = 0.675
    assert.ok(Math.abs(partner.tension - 0.675) < 1e-9, `got ${partner.tension}`);
    assert.ok(partner.tension > recording.tension, 'neglected axis now outranks the funded one');
});

test('neglect deepens with each further desire', () => {
    const rows = [
        r('liu', 'a', 0.5),
        r('liu', 'b', 0.5),
        r('liu', 'c', 0.5),
    ];
    const out = coupleAttention(rows, { focus: 1, spill: 0.2 });
    // ranks (ties broken by sort): one funded, then *1.2, then *1.4
    const vals = out.map((x) => x.tension).sort((a, b) => a - b);
    assert.ok(Math.abs(vals[0] - 0.5) < 1e-9); // funded
    assert.ok(Math.abs(vals[1] - 0.6) < 1e-9); // *1.2
    assert.ok(Math.abs(vals[2] - 0.7) < 1e-9); // *1.4
});

test('tension is clamped to 1', () => {
    const rows = [r('x', 'a', 0.9), r('x', 'b', 0.95)];
    const out = coupleAttention(rows, { focus: 1, spill: 5 });
    for (const o of out) assert.ok(o.tension <= 1);
});

test('focus ≥ desire count is the identity', () => {
    const rows = [r('x', 'a', 0.4), r('x', 'b', 0.3)];
    const out = coupleAttention(rows, { focus: 2 });
    assert.deepEqual(out.map((o) => o.tension), [0.4, 0.3]);
});

test('characters do not bleed into each other', () => {
    const rows = [r('a', 'p', 0.5), r('a', 'q', 0.5), r('b', 'p', 0.5)];
    const out = coupleAttention(rows, { focus: 1, spill: 0.4 });
    // b has one desire → unchanged
    assert.equal(out.find((x) => x.characterId === 'b')!.tension, 0.5);
    // extra fields preserved
    const rich = coupleAttention([{ characterId: 'a', statement: 's', tension: 0.5, name: '柳' }], {});
    assert.equal(rich[0].name, '柳');
});
