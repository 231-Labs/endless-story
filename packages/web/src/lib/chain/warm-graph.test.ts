/**
 * buildWarmGraph unit test (§2.50 Phase B): pursue + welcome derive from directed
 * WARM tone edges only, restricted to the roster.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/chain/warm-graph.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWarmGraph, type RelEventLite } from './relationship-core.ts';

const events: RelEventLite[] = [
    { characterA: 'su', characterB: 'liu', tone: 'romance', tick: 0 },
    { characterA: 'liu', characterB: 'su', tone: 'romance', tick: 0 },
    { characterA: 'liu', characterB: 'jin', tone: 'estrangement', tick: 0 },
    { characterA: 'jin', characterB: 'liu', tone: 'romance', tick: 0 },
    { characterA: 'bai', characterB: 'liu', tone: 'romance', tick: 0 },
    { characterA: 'tian', characterB: 'liu', tone: 'affection', tick: 0 },
];
const ids = ['su', 'liu', 'jin', 'bai', 'tian'];

test('welcome = warm outgoing edge (romance/affection/mentorship), else 0', () => {
    const g = buildWarmGraph(events, ids);
    assert.ok(g.welcome('su', 'liu') > 0, '蘇→柳 戀慕 → 迎');
    assert.ok(g.welcome('tian', 'liu') > 0, '田→柳 親近 → 迎');
    assert.equal(g.welcome('liu', 'jin'), 0, '柳→金鳳 隔閡(冷) → 不迎');
    assert.equal(g.welcome('su', 'jin'), 0, '無邊 → 不迎');
});

test('pursue = strongest warm outgoing edge to a roster peer', () => {
    const g = buildWarmGraph(events, ids);
    assert.equal(g.pursueByChar.get('su')?.id, 'liu', '蘇 追 柳');
    assert.equal(g.pursueByChar.get('liu')?.id, 'su', '柳 追 蘇');
    assert.equal(g.pursueByChar.get('jin')?.id, 'liu', '金鳳 追 柳');
    assert.equal(g.pursueByChar.get('bai')?.id, 'liu', '白 追 柳');
    // A cold edge is never a pursue target.
    assert.notEqual(g.pursueByChar.get('liu')?.id, 'jin');
});

test('cold-only / no warm edge ⇒ no pursue, no welcome', () => {
    const g = buildWarmGraph([{ characterA: 'a', characterB: 'b', tone: 'rivalry', tick: 0 }], ['a', 'b']);
    assert.equal(g.pursueByChar.get('a'), undefined, '只有競爭邊 → 不追');
    assert.equal(g.welcome('a', 'b'), 0, '競爭 → 不迎');
});

test('pursue targets must be in the roster (ignore off-roster warm edges)', () => {
    const g = buildWarmGraph([{ characterA: 'su', characterB: 'ghost', tone: 'romance', tick: 0 }], ['su', 'liu']);
    assert.equal(g.pursueByChar.get('su'), undefined, '追的人不在名單 → 不列入');
});
