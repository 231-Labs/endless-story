// Event framing — pure sanitizer for LLM incident lines. Runs under `node --test`.
// (Only the pure `sanitizeFraming` is exercised here; `frameIncident` does live
// LLM I/O and is covered by the §6 chain-session runbook, not unit tests.)
//
//   pnpm --filter @endless-story/web test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFraming } from './event-framing-core.ts';

const FB = '今晚誰壓軸的暗潮浮上了檯面';

test('passes a clean single line through unchanged', () => {
    assert.equal(sanitizeFraming('壓軸名額一夕成了眾人的心結', FB), '壓軸名額一夕成了眾人的心結');
});

test('strips wrapping quotes and trailing punctuation', () => {
    assert.equal(sanitizeFraming('「壓軸名額成了心結。」', FB), '壓軸名額成了心結');
    assert.equal(sanitizeFraming('壓軸名額成了心結！', FB), '壓軸名額成了心結');
});

test('takes the first non-empty line when the model rambles', () => {
    assert.equal(sanitizeFraming('\n壓軸名額成了心結\n（另外解釋一堆）', FB), '壓軸名額成了心結');
});

test('falls back when empty, too short, or too long', () => {
    assert.equal(sanitizeFraming('', FB), FB);
    assert.equal(sanitizeFraming(undefined, FB), FB);
    assert.equal(sanitizeFraming('好', FB), FB);
    assert.equal(sanitizeFraming('字'.repeat(60), FB), FB);
});
