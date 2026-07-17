import assert from 'node:assert/strict';
import test from 'node:test';

import { applyRipples, shouldDeriveAftermath } from '../src/core/want-core.ts';

test('a first-order drive may open one aftermath thread', () => {
    assert.equal(shouldDeriveAftermath({ source: 'genesis' }), true);
    assert.equal(shouldDeriveAftermath({ source: 'owner' }), true);
});

test('an aftermath resolution cannot recursively spawn another aftermath', () => {
    assert.equal(shouldDeriveAftermath({ source: 'aftermath' }), false);
});

test('ripple placeholder text can never become a live want', () => {
    const wants: Parameters<typeof applyRipples>[0] = [];
    const spawned = applyRipples(wants, [
        { characterId: 'c1', shift: 'none', newThread: '省略' },
        { characterId: 'c2', shift: 'none', newThread: 'none' },
    ], 0);
    assert.deepEqual(spawned, []);
    assert.deepEqual(wants, []);
});
