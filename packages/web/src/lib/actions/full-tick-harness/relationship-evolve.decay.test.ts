/**
 * Cooling-engine unit tests — pure, no LLM, no chain. Feeds synthetic seeding
 * events at known ticks and asserts the decayed aggregation: maintained ties stay
 * strong, abandoned ties fade off the graph, tone follows the newest seeding.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> --import tsx --test \
 *     src/lib/actions/full-tick-harness/relationship-evolve.decay.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    aggregateDecayedOutgoing,
    type RelEventLite,
} from '../../chain/relationship-core.ts';

test('cooling: maintained tie stays, abandoned tie fades out', () => {
    const events: RelEventLite[] = [
        // newest-first
        { characterA: 'A', characterB: 'D', tone: 'romance', tick: 4 },
        { characterA: 'A', characterB: 'D', tone: 'affection', tick: 3 },
        { characterA: 'A', characterB: 'C', tone: 'affection', tick: 1 },
        { characterA: 'A', characterB: 'B', tone: 'rivalry', tick: 0 },
    ];
    const out = aggregateDecayedOutgoing(events, 'A', 4, { halfLife: 2, minStrength: 0.35 });
    const ids = out.map((e) => e.toId);

    assert.ok(ids.includes('D'), 'maintained D survives');
    assert.ok(ids.includes('C'), 'age-3 C just survives (0.354 ≥ 0.35)');
    assert.ok(!ids.includes('B'), 'age-4 B has faded out (0.25 < 0.35)');
    assert.equal(out[0].toId, 'D', 'maintained tie ranks first');
    assert.equal(out[0].tone, 'romance', 'newest seeding sets the tone');
    // tick4 (age0 →1.0) + tick3 (age1 →0.5^0.5≈0.707) ≈ 1.707
    assert.ok(out[0].weight > 1.6 && out[0].weight < 1.8, `D strength ≈1.71, got ${out[0].weight}`);
});

test('cooling: a one-off tie decays to nothing over ticks', () => {
    const ev: RelEventLite[] = [{ characterA: 'A', characterB: 'B', tone: 'romance', tick: 0 }];
    assert.equal(aggregateDecayedOutgoing(ev, 'A', 0).length, 1, 'fresh tie present');
    assert.equal(aggregateDecayedOutgoing(ev, 'A', 2).length, 1, 'one half-life (0.5) still present');
    assert.equal(aggregateDecayedOutgoing(ev, 'A', 5).length, 0, '2.5 half-lives (0.18) faded out');
});

test('cooling: reaffirming every tick keeps a tie hot', () => {
    const ev: RelEventLite[] = [
        { characterA: 'A', characterB: 'B', tone: 'romance', tick: 5 },
        { characterA: 'A', characterB: 'B', tone: 'romance', tick: 4 },
        { characterA: 'A', characterB: 'B', tone: 'romance', tick: 3 },
    ];
    const out = aggregateDecayedOutgoing(ev, 'A', 5, { halfLife: 2 });
    assert.equal(out.length, 1);
    assert.ok(out[0].weight > 2, `reaffirmed tie accrues past raw ×1, got ${out[0].weight}`);
});

test('cooling: only outgoing edges from the source count', () => {
    const ev: RelEventLite[] = [
        { characterA: 'A', characterB: 'B', tone: 'romance', tick: 1 },
        { characterA: 'B', characterB: 'A', tone: 'rivalry', tick: 1 }, // incoming, ignored
    ];
    const out = aggregateDecayedOutgoing(ev, 'A', 1);
    assert.equal(out.length, 1, 'only A→B counts as A outgoing');
    assert.equal(out[0].toId, 'B');
    assert.equal(out[0].tone, 'romance');
});
