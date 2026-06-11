// Director resource proposal — pure validation rails. Runs under `node --test`.
//
//   pnpm --filter @endless-story/web test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateResourceProposal,
    countDirectorResources,
    RESERVED_KINDS,
} from './resource-proposal.ts';

const NONE: string[] = [];

test('accepts a clean proposal and derives label / templateId / archetype', () => {
    const r = validateResourceProposal({ kind: 'Feud', display: '春雪社班底', capacity: 1 }, NONE, 4);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.proposal.kind, 'feud'); // lowercased
    assert.equal(r.proposal.label, 'feud:春雪社班底');
    assert.equal(r.proposal.templateId, 'contention:feud');
    assert.equal(r.proposal.archetype, 'capacity-1-slot');
    assert.equal(r.proposal.capacity, 1);
});

test('templateId keyword equals the label prefix (spine settlement coherence)', () => {
    // The spine resolves via templateId.split(':')[1] === label/statement keyword.
    const r = validateResourceProposal({ kind: 'patron', display: '李府堂會', capacity: 1 }, NONE, 3);
    assert.ok(r.ok);
    if (!r.ok) return;
    const keyword = r.proposal.templateId.split(':')[1];
    assert.equal(keyword, 'patron');
    assert.ok(r.proposal.label.startsWith(`${keyword}:`));
});

test('rejects reserved built-in kinds', () => {
    for (const kind of RESERVED_KINDS) {
        const r = validateResourceProposal({ kind, display: '某物', capacity: 1 }, NONE, 4);
        assert.equal(r.ok, false);
    }
});

test('rejects malformed kind (non-ascii, spaces, too long)', () => {
    assert.equal(validateResourceProposal({ kind: '恩怨', display: 'x', capacity: 1 }, NONE, 4).ok, false);
    assert.equal(validateResourceProposal({ kind: 'a b', display: 'x', capacity: 1 }, NONE, 4).ok, false);
    assert.equal(validateResourceProposal({ kind: 'x'.repeat(30), display: 'y', capacity: 1 }, NONE, 4).ok, false);
});

test('rejects empty / oversized display', () => {
    assert.equal(validateResourceProposal({ kind: 'feud', display: '', capacity: 1 }, NONE, 4).ok, false);
    assert.equal(validateResourceProposal({ kind: 'feud', display: '長'.repeat(40), capacity: 1 }, NONE, 4).ok, false);
});

test('rejects non-integer / sub-1 capacity', () => {
    assert.equal(validateResourceProposal({ kind: 'feud', display: 'x', capacity: 0 }, NONE, 4).ok, false);
    assert.equal(validateResourceProposal({ kind: 'feud', display: 'x', capacity: 1.5 }, NONE, 4).ok, false);
    assert.equal(validateResourceProposal({ kind: 'feud', display: 'x', capacity: 'two' }, NONE, 4).ok, false);
});

test('clamps capacity below cast size so the slot stays contested', () => {
    const r = validateResourceProposal({ kind: 'feud', display: 'x', capacity: 99 }, NONE, 4);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.proposal.capacity, 3); // castSize 4 → max 3
});

test('rejects duplicate label and duplicate kind axis', () => {
    const existing = ['feud:春雪社班底', 'spotlight:壓軸'];
    assert.equal(
        validateResourceProposal({ kind: 'feud', display: '春雪社班底', capacity: 1 }, existing, 4).ok,
        false,
        'exact label dup',
    );
    assert.equal(
        validateResourceProposal({ kind: 'feud', display: '另一個', capacity: 1 }, existing, 4).ok,
        false,
        'same kind axis already in play',
    );
});

test('countDirectorResources ignores built-in kinds', () => {
    assert.equal(
        countDirectorResources(['spotlight:壓軸', 'partnership:某', 'recording:某', 'feud:甲', 'patron:乙']),
        2,
    );
});
