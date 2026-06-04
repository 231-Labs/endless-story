import assert from 'node:assert/strict';
import test from 'node:test';
import { personaSubject } from './persona-subject.ts';

test('personaSubject is a deterministic address namespace per character', () => {
    const lower = personaSubject('0xabc123');
    const upper = personaSubject('0xABC123');
    assert.equal(lower, upper);
    assert.match(lower, /^0x[0-9a-f]{64}$/);
    assert.notEqual(lower, '0xabc123');
});
