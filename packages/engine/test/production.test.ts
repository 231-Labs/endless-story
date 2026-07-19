/**
 * 劇本產出 — pure plumbing tests for the deterministic production accumulator.
 * No LLM: they pin the lifecycle (propose → script → rehearse → premiere) and
 * the razor's exact gates. Whether characters CHOOSE to produce is a behavioural
 * property of a real run; this guarantees the mechanism they feed is correct.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    PRODUCTION,
    accumulateEffort,
    addScriptFragment,
    canPremiere,
    ensureContributor,
    markPremiered,
    productionSummary,
    startProduction,
    totalEffort,
} from '../src/core/production.ts';

test('startProduction: proposed, initiator is the first contributor', () => {
    const p = startProduction('斷橋', 'shen', 1);
    assert.equal(p.status, 'proposed');
    assert.equal(p.title, '斷橋');
    assert.deepEqual(p.contributors, ['shen']);
    assert.equal(totalEffort(p), 0);
    assert.equal(p.startedDay, 1);
});

test('blank title falls back to 新戲', () => {
    assert.equal(startProduction('   ', 'x', 1).title, '新戲');
});

test('addScriptFragment advances proposed → scripted and records the fragment', () => {
    const p = startProduction('新戲', 'shen', 1);
    addScriptFragment(p, 'su', '生旦對唱一句');
    assert.equal(p.status, 'scripted');
    assert.deepEqual(p.scriptFragments, ['生旦對唱一句']);
    assert.ok(p.contributors.includes('su'), 'composing makes you a contributor');
});

test('accumulateEffort banks per-contributor effort and reaches rehearsing', () => {
    const p = startProduction('新戲', 'shen', 1);
    addScriptFragment(p, 'su', '一句');       // scripted + contributor su
    accumulateEffort(p, 'shen', 2);
    accumulateEffort(p, 'jiang', 1);           // 2nd distinct contributor beyond su/shen
    assert.equal(totalEffort(p), 3);
    assert.equal(p.status, 'rehearsing', 'a scripted work with ≥2 hands rehearsing is rehearsing');
});

test('ensureContributor is idempotent', () => {
    const p = startProduction('新戲', 'shen', 1);
    ensureContributor(p, 'su');
    ensureContributor(p, 'su');
    assert.equal(p.contributors.filter((c) => c === 'su').length, 1);
});

test('the razor: needs a fragment, ≥minContributors, and ≥rehearsalThreshold effort', () => {
    const p = startProduction('新戲', 'shen', 1);
    assert.equal(canPremiere(p), false, 'a bare proposal cannot premiere');

    addScriptFragment(p, 'su', '一句');
    assert.equal(canPremiere(p), false, 'a script with no rehearsal cannot premiere');

    accumulateEffort(p, 'shen', PRODUCTION.rehearsalThreshold); // effort met, contributors = shen+su
    assert.ok(p.contributors.length >= PRODUCTION.minContributors);
    assert.equal(canPremiere(p), true, 'scripted + collaborators + banked effort ⇒ may premiere');

    markPremiered(p, 3);
    assert.equal(p.status, 'premiered');
    assert.equal(p.premieredDay, 3);
    assert.equal(canPremiere(p), false, 'already premiered ⇒ never again');
});

test('one contributor can never premiere alone, however much they rehearse', () => {
    const p = startProduction('新戲', 'solo', 1);
    addScriptFragment(p, 'solo', '一句');
    accumulateEffort(p, 'solo', 100);
    assert.equal(p.contributors.length, 1);
    assert.equal(canPremiere(p), false, 'solo daydream never becomes a real premiere');
});

test('productionSummary reads differently in-progress vs premiered', () => {
    const p = startProduction('斷橋', 'shen', 1);
    addScriptFragment(p, 'su', '一句');
    accumulateEffort(p, 'shen', 4);
    assert.match(productionSummary(p), /製作中/);
    markPremiered(p, 2);
    assert.match(productionSummary(p), /已於第2日首演/);
});
