// Decoupled unit tests for encounter selection + bond collection (pure cores).
// Node-clean: only import the *-core.ts modules (no chain/SDK), so this runs under
// `node --test --experimental-strip-types` with zero workspace deps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectEncounterPair, encounterPairKey, type RelationshipPair } from './encounter-core.ts';
import { collectBondPairs, type GiveLike } from './bond-core.ts';

const zh = (t: string) => ({ affection: '親近', romance: '戀慕', mentorship: '師徒', rivalry: '競爭', tension: '緊張', estrangement: '隔閡', neutral: '平淡' } as Record<string, string>)[t] ?? '平淡';
const scene = (m: Record<string, string>) => (id: string) => m[id];
const name = (id: string) => id;
type P = RelationshipPair;
const pair = (otherId: string, tone: string, count: number): P => ({ otherId, tone: tone as P['tone'], count });

test('encounterPairKey: order-independent', () => {
    assert.equal(encounterPairKey('b', 'a'), encounterPairKey('a', 'b'));
});

test('selectEncounterPair: co-present + bond tone + count≥1 → picks the pair', () => {
    const perChar = [
        { id: 'su', pairs: [pair('liu', 'affection', 1)] },
        { id: 'liu', pairs: [pair('su', 'affection', 1)] },
    ];
    const got = selectEncounterPair(perChar, scene({ su: 's1', liu: 's1' }), name, zh);
    assert.ok(got);
    assert.equal(got!.pairKey, encounterPairKey('su', 'liu'));
    assert.equal(got!.holderId, 'liu'); // lexicographically-first
    assert.equal(got!.toneZh, '親近');
});

test('selectEncounterPair: NOT co-present → undefined', () => {
    const perChar = [
        { id: 'su', pairs: [pair('liu', 'affection', 2)] },
        { id: 'liu', pairs: [pair('su', 'affection', 2)] },
    ];
    assert.equal(selectEncounterPair(perChar, scene({ su: 's1', liu: 's2' }), name, zh), undefined);
});

test('selectEncounterPair: WARM tone wins over a charged tone at EQUAL count (溫情 surfaces)', () => {
    // su↔liu affection (warm) vs su↔jiang rivalry (charged), all co-present, all count 1.
    const perChar = [
        { id: 'jiang', pairs: [pair('su', 'rivalry', 1)] },
        { id: 'su', pairs: [pair('liu', 'affection', 1), pair('jiang', 'rivalry', 1)] },
        { id: 'liu', pairs: [pair('su', 'affection', 1)] },
    ];
    const got = selectEncounterPair(perChar, scene({ su: 's1', liu: 's1', jiang: 's1' }), name, zh);
    assert.ok(got);
    assert.equal(got!.tone, 'affection'); // warm preferred over rivalry at equal count
    assert.equal(got!.pairKey, encounterPairKey('su', 'liu'));
});

test('selectEncounterPair: a DEEPER charged bond still wins over a faint warm one (conflict not erased)', () => {
    // rivalry count 3 beats affection count 1 — warmth bias only breaks TIES, not strength.
    const perChar = [
        { id: 'jiang', pairs: [pair('su', 'rivalry', 3)] },
        { id: 'su', pairs: [pair('liu', 'affection', 1), pair('jiang', 'rivalry', 3)] },
        { id: 'liu', pairs: [pair('su', 'affection', 1)] },
    ];
    const got = selectEncounterPair(perChar, scene({ su: 's1', liu: 's1', jiang: 's1' }), name, zh);
    assert.equal(got!.tone, 'rivalry');
});

test('selectEncounterPair: thin tone (neutral) → undefined', () => {
    const perChar = [
        { id: 'su', pairs: [pair('liu', 'neutral', 5)] },
        { id: 'liu', pairs: [pair('su', 'neutral', 5)] },
    ];
    assert.equal(selectEncounterPair(perChar, scene({ su: 's1', liu: 's1' }), name, zh), undefined);
});

test('selectEncounterPair: prefers the HIGHER-count (deepened) pair', () => {
    const perChar = [
        { id: 'a', pairs: [pair('b', 'affection', 1), pair('c', 'mentorship', 3)] },
        { id: 'b', pairs: [pair('a', 'affection', 1)] },
        { id: 'c', pairs: [pair('a', 'mentorship', 3)] },
    ];
    const got = selectEncounterPair(perChar, scene({ a: 's1', b: 's1', c: 's1' }), name, zh);
    assert.equal(got!.pairKey, encounterPairKey('a', 'c'));
    assert.equal(got!.count, 3);
});

test('selectEncounterPair: other not acting this tick → undefined', () => {
    const perChar = [{ id: 'a', pairs: [pair('ghost', 'romance', 2)] }];
    assert.equal(selectEncounterPair(perChar, scene({ a: 's1', ghost: 's1' }), name, zh), undefined);
});

test('collectBondPairs: an accepted gift becomes one bond pair', () => {
    const gives: GiveLike[] = [{ characterId: 'su', ok: true, gave: true, gifts: [{ recipientId: 'liu' }] }];
    const got = collectBondPairs(gives, scene({ su: 's1', liu: 's1' }), 'fallback');
    assert.equal(got.length, 1);
    assert.deepEqual([got[0].aId, got[0].bId, got[0].sceneId, got[0].tone], ['su', 'liu', 's1', 'affection']);
});

test('collectBondPairs: refused gift / self gift / no-gave are ignored; symmetric dedup; cap', () => {
    const gives: GiveLike[] = [
        { characterId: 'a', ok: true, gave: true, gifts: [{ recipientId: 'b', refused: true }] }, // refused
        { characterId: 'c', ok: true, gave: false, gifts: [{ recipientId: 'd' }] }, // didn't give
        { characterId: 'e', ok: true, gave: true, gifts: [{ recipientId: 'e' }] }, // self
        { characterId: 'f', ok: true, gave: true, gifts: [{ recipientId: 'g' }] }, // valid
        { characterId: 'g', ok: true, gave: true, gifts: [{ recipientId: 'f' }] }, // symmetric dup of f-g
    ];
    const got = collectBondPairs(gives, () => 's1', 'fallback');
    assert.equal(got.length, 1);
    assert.equal(encounterPairKey(got[0].aId, got[0].bId), encounterPairKey('f', 'g'));
});

test('collectBondPairs: falls back to the provided scene when roster has none', () => {
    const gives: GiveLike[] = [{ characterId: 'a', ok: true, gave: true, gifts: [{ recipientId: 'b' }] }];
    assert.equal(collectBondPairs(gives, () => undefined, 'sFallback')[0].sceneId, 'sFallback');
    assert.equal(collectBondPairs(gives, () => undefined, undefined).length, 0); // no scene at all → skip
});
