// Director LLM-output validation — the gate between a free-text model reply
// and typed on-chain capability dispatch. Runs under `node --test` (the
// module under test has type-only imports, so its graph is node-clean).
//
//   pnpm --filter @endless-story/runner test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDirectorResponse } from '../src/services/saga-director/parse.ts';

const SCENE = '0xscene';
const CHAR_A = '0xchar_a';
const CHAR_B = '0xchar_b';

function envelope(capabilities: unknown[], rationale = '今日該起一點風波') {
    return JSON.stringify({ rationale, capabilities });
}

test('parses a clean multi-capability response', () => {
    const r = parseDirectorResponse(
        envelope([
            {
                name: 'open_storylet',
                input: { templateId: 'confession_after_show', sceneId: SCENE, characterIds: [CHAR_A, CHAR_B] },
            },
            { name: 'attribute_pressure', input: { sceneId: SCENE, axis: 'danger', delta: -10 } },
            { name: 'character_call', input: { sceneId: SCENE, characterId: CHAR_A, reason: '台口缺人' } },
        ]),
    );
    assert.equal(r.rawErrors.length, 0);
    assert.equal(r.rationale, '今日該起一點風波');
    assert.deepEqual(
        r.capabilities.map((c) => c.kind),
        ['open_storylet', 'attribute_pressure', 'character_call'],
    );
});

test('unwraps ```json fences', () => {
    const r = parseDirectorResponse(
        '```json\n' + envelope([{ name: 'advance_phase', input: { sagaId: '0xsaga', nextPhase: 'act2' } }]) + '\n```',
    );
    assert.equal(r.capabilities.length, 1);
    assert.equal(r.capabilities[0].kind, 'advance_phase');
});

test('extracts the JSON object out of surrounding prose', () => {
    const r = parseDirectorResponse(
        '好的，導演安排如下：\n' +
            envelope([{ name: 'character_call', input: { sceneId: SCENE, characterId: CHAR_A } }]) +
            '\n以上。',
    );
    assert.equal(r.capabilities.length, 1);
});

test('non-JSON garbage → no capabilities + an error, never a throw', () => {
    const r = parseDirectorResponse('今晚就讓他們唱一齣空城計吧。');
    assert.deepEqual(r.capabilities, []);
    assert.ok(r.rawErrors.length > 0);
});

test('unknown capability names are dropped with an error, valid siblings survive', () => {
    const r = parseDirectorResponse(
        envelope([
            { name: 'summon_dragon', input: {} },
            { name: 'character_call', input: { sceneId: SCENE, characterId: CHAR_A } },
        ]),
    );
    assert.equal(r.capabilities.length, 1);
    assert.equal(r.capabilities[0].kind, 'character_call');
    assert.ok(r.rawErrors.some((e) => e.includes('summon_dragon')));
});

test('attribute_pressure delta outside ±20 is rejected', () => {
    const r = parseDirectorResponse(
        envelope([{ name: 'attribute_pressure', input: { sceneId: SCENE, axis: 'atmosphere', delta: 55 } }]),
    );
    assert.deepEqual(r.capabilities, []);
});

test('attribute_pressure with an invented axis is rejected', () => {
    const r = parseDirectorResponse(
        envelope([{ name: 'attribute_pressure', input: { sceneId: SCENE, axis: 'romance', delta: 5 } }]),
    );
    assert.deepEqual(r.capabilities, []);
});

test('open_storylet without characters is rejected', () => {
    const r = parseDirectorResponse(
        envelope([{ name: 'open_storylet', input: { templateId: 't', sceneId: SCENE, characterIds: [] } }]),
    );
    assert.deepEqual(r.capabilities, []);
});

test('relationship_seed accepts only the fixed tone vocabulary', () => {
    const base = { sceneId: SCENE, characterA: CHAR_A, characterB: CHAR_B };
    const ok = parseDirectorResponse(
        envelope([{ name: 'relationship_seed', input: { ...base, tone: 'rivalry' } }]),
    );
    assert.equal(ok.capabilities.length, 1);
    const bad = parseDirectorResponse(
        envelope([{ name: 'relationship_seed', input: { ...base, tone: 'soulmates' } }]),
    );
    assert.deepEqual(bad.capabilities, []);
});

test('missing string fields are reported per entry', () => {
    const r = parseDirectorResponse(
        envelope([{ name: 'character_call', input: { characterId: CHAR_A } }]),
    );
    assert.deepEqual(r.capabilities, []);
    assert.ok(r.rawErrors.some((e) => e.includes('sceneId')));
});
