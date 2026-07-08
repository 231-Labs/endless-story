/**
 * relationship-felt: want → directed edge projection (layer→tone fan-out,
 * target resolution, tension floor, dedupe) and the lived+felt merge seam.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RelationshipEdge } from '@endless-story/shared';
import { newWant, type Want } from './want-core.ts';
import { mergeFeltEdges, projectWantEdges, tonesForLayer } from './relationship-felt.ts';

const CAST: Record<string, string> = { 柳生春: '0xliu', 白韻秋: '0xbai', 蘇映雪: '0xsu' };
const resolveTargetId = (t: string) => (t.startsWith('0x') ? t : CAST[t]);

function want(over: Partial<Want> & Pick<Want, 'characterId' | 'layer' | 'desc'>): Want {
    const w = newWant({
        weight: 0.9,
        sat: 0.2,
        resistance: 6,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 1,
        ...over,
    });
    // newWant constructs from its whitelist; carry test-only flags across.
    if (over.retired) w.retired = true;
    return w;
}

test('layer→tone: relational tags map, composite fans out, non-relational project nothing', () => {
    assert.deepEqual(tonesForLayer('愛'), ['romance']);
    assert.deepEqual(tonesForLayer('虧欠'), ['affection']);
    assert.deepEqual(tonesForLayer('怨'), ['estrangement']);
    assert.deepEqual(tonesForLayer('愛/妒'), ['romance', 'tension']);
    assert.deepEqual(tonesForLayer('志'), []);
    assert.deepEqual(tonesForLayer('日常'), []);
    // Garbage layers (ripple artifacts) are normalized away → no edge.
    assert.deepEqual(tonesForLayer('1'), []);
    assert.deepEqual(tonesForLayer('層'), []);
});

test('projects 白→柳 romance from an 愛 want, in her own words', () => {
    const edges = projectWantEdges(
        [want({ characterId: '0xbai', layer: '愛', desc: '想聽他應一聲「好」', target: '柳生春' })],
        { resolveTargetId, currentDay: 2 },
    );
    assert.equal(edges.length, 1);
    const e = edges[0];
    assert.equal(e.fromId, '0xbai');
    assert.equal(e.toId, '0xliu');
    assert.equal(e.tone, 'romance');
    assert.equal(e.origin, 'felt');
    assert.equal(e.summary, '想聽他應一聲「好」');
    // tension 0.9×0.8=0.72 → weight 7
    assert.equal(e.weight, 7);
    assert.equal(e.lastUpdatedDay, 2);
});

test('composite 愛/妒 yields two coexisting edges toward the same target', () => {
    const edges = projectWantEdges(
        [want({ characterId: '0xliu', layer: '愛/妒', desc: '當年天亮後…', target: '蘇映雪' })],
        { resolveTargetId },
    );
    assert.deepEqual(edges.map((e) => e.tone).sort(), ['romance', 'tension']);
});

test('skips: retired, no target, unresolvable target, self-target, saturated', () => {
    const edges = projectWantEdges(
        [
            want({ characterId: '0xbai', layer: '愛', desc: 'a', target: '柳生春', retired: true }),
            want({ characterId: '0xbai', layer: '愛', desc: 'b' }),
            want({ characterId: '0xbai', layer: '愛', desc: 'c', target: '張老爺' }),
            want({ characterId: '0xbai', layer: '愛', desc: 'd', target: '白韻秋' }),
            want({ characterId: '0xbai', layer: '愛', desc: 'e', target: '柳生春', sat: 0.95 }),
        ],
        { resolveTargetId },
    );
    assert.equal(edges.length, 0);
});

test('same (from,to,tone) from two wants keeps the strongest', () => {
    const edges = projectWantEdges(
        [
            want({ characterId: '0xbai', layer: '愛', desc: 'hot', target: '柳生春', weight: 0.9, sat: 0.1 }),
            want({ characterId: '0xbai', layer: '情', desc: 'cool', target: '柳生春', weight: 0.5, sat: 0.5 }),
        ],
        { resolveTargetId },
    );
    assert.equal(edges.length, 1);
    assert.equal(edges[0].summary, 'hot');
});

test('merge: distinct tones coexist, same tone keeps the heavier edge', () => {
    const lived: RelationshipEdge[] = [
        { fromId: '0xbai', toId: '0xliu', tone: 'wary', weight: 6, label: '戒備', lastUpdatedDay: 1 },
        { fromId: '0xbai', toId: '0xliu', tone: 'romance', weight: 3, label: '戀慕', lastUpdatedDay: 1 },
    ];
    const felt = projectWantEdges(
        [want({ characterId: '0xbai', layer: '愛', desc: '想聽他應一聲「好」', target: '柳生春' })],
        { resolveTargetId },
    );
    const merged = mergeFeltEdges(lived, felt);
    // wary (lived) + romance: coexist as two directed edges on the same pair.
    assert.equal(merged.length, 2);
    const romance = merged.find((e) => e.tone === 'romance')!;
    // felt romance (w7) beats the weaker lived romance seed (w3).
    assert.equal(romance.weight, 7);
    assert.equal(romance.origin, 'felt');
    assert.ok(merged.some((e) => e.tone === 'wary' && e.weight === 6));
});
