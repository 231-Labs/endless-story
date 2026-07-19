/**
 * 行當節律 (livelihood day-rhythm) — pure plumbing tests. Deterministic, no LLM:
 * they pin the day/night SHAPE of the pull (work by day, home at night) and its
 * graceful fallback when a seed leaves work/home unset. Whether characters
 * actually follow it is a behavioural property measured on a real LLM run, not
 * here — this only guarantees the hint the move prompt receives is correct.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { livelihoodRhythm } from '../src/core/livelihood-rhythm.ts';
import { PARTS_OF_DAY } from '../src/ports.ts';

const DAY_PARTS = ['清晨', '日午', '晡時'];
const NIGHT_PARTS = ['入夜', '深宵'];

test('by day the pull names the 做活處, never the 住處', () => {
    for (const part of DAY_PARTS) {
        const line = livelihoodRhythm(part, '練功房', '會樂里寓所');
        assert.ok(line, `${part} yields a line`);
        assert.ok(line!.includes('練功房'), `${part} points at work`);
        assert.ok(!line!.includes('會樂里寓所'), `${part} does not point home`);
    }
});

test('at night the pull names the 住處, never the 做活處', () => {
    for (const part of NIGHT_PARTS) {
        const line = livelihoodRhythm(part, '練功房', '會樂里寓所');
        assert.ok(line, `${part} yields a line`);
        assert.ok(line!.includes('會樂里寓所'), `${part} points home`);
        assert.ok(!line!.includes('練功房'), `${part} does not point at work`);
    }
});

test('黃昏 is the transitional release — mentions going home, not staying at work', () => {
    const line = livelihoodRhythm('黃昏', '練功房', '會樂里寓所')!;
    assert.ok(line.includes('歸家'), 'dusk winds the day down toward home');
    assert.ok(line.includes('會樂里寓所'), 'dusk still names the home to head for');
});

test('every canonical part-of-day produces a line; unknown labels return undefined', () => {
    for (const part of PARTS_OF_DAY) {
        assert.ok(livelihoodRhythm(part, '練功房', '會樂里寓所'), `${part} is covered`);
    }
    assert.equal(livelihoodRhythm('子夜', '練功房', '會樂里寓所'), undefined);
    assert.equal(livelihoodRhythm(''), undefined);
});

test('missing work/home anchors fall back to generic wording, never a bracketed empty', () => {
    for (const part of PARTS_OF_DAY) {
        const line = livelihoodRhythm(part)!;
        assert.ok(line, `${part} still yields a generic line with no anchors`);
        assert.ok(!line.includes('「」'), `${part} never emits an empty 「」 placeholder`);
        assert.ok(!line.includes('undefined'), `${part} never leaks 'undefined'`);
    }
});
