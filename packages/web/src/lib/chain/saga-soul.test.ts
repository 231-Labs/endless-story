// Unit tests for the runner POV「戲班氣質」block (F — saga soul).
// Kept node-clean: imports the zero-dependency builder directly (mirrors
// role-inference.test.ts importing shared/role-traits.ts) so `node --test`
// needn't load the prompt module's @endless-story/shared import.
//
//   pnpm --filter @endless-story/web test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSagaSoulBlock,
    type SagaSoul,
} from '../../../../runner/src/services/character-worker/saga-soul.ts';

test('buildSagaSoulBlock returns "" with no soul / no tone-bearing fields', () => {
    // The "" result is what guarantees buildSystemPrompt(undefined) stays
    // byte-identical to the pre-soul version (it returns base.join when block "").
    assert.equal(buildSagaSoulBlock(), '');
    assert.equal(buildSagaSoulBlock({}), '');
    // sagaName / portraitTone alone are not tone-bearing for the POV prose.
    assert.equal(buildSagaSoulBlock({ sagaName: '春雪班', portraitTone: '水墨' }), '');
    // whitespace-only fields don't count.
    assert.equal(buildSagaSoulBlock({ premise: '   ' }), '');
});

test('buildSagaSoulBlock renders only the present tone fields', () => {
    const soul: SagaSoul = {
        sagaName: '春雪班',
        premise: '名角隕落後的爭班大戲',
        departurePolicy: '班主准許方可離班',
    };
    const block = buildSagaSoulBlock(soul);
    assert.match(block, /此戲班專屬氣質/);
    assert.match(block, /本事（這個戲班在演什麼局）：名角隕落後的爭班大戲/);
    assert.match(block, /離班規矩：班主准許方可離班/);
    // absent fields produce no line; sagaName is never rendered into the block.
    assert.doesNotMatch(block, /事件氣質/);
    assert.doesNotMatch(block, /自然節律/);
    assert.doesNotMatch(block, /春雪班/);
});

test('buildSagaSoulBlock includes Tier-2 nature/rhythm when provided', () => {
    const block = buildSagaSoulBlock({
        naturePrompt: '權謀為主、刀光在暗處',
        rhythmHints: '日出開嗓、戌時封箱',
    });
    assert.match(block, /事件氣質：權謀為主、刀光在暗處/);
    assert.match(block, /自然節律：日出開嗓、戌時封箱/);
});

test('different premises → different blocks (the differentiation we are buying)', () => {
    const a = buildSagaSoulBlock({ premise: '名角隕落後的爭班大戲' });
    const b = buildSagaSoulBlock({ premise: '江湖戲班流落碼頭討生活' });
    assert.notEqual(a, b);
    assert.match(a, /名角隕落/);
    assert.match(b, /碼頭討生活/);
});
