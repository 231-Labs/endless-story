/**
 * Guard-layer tests for the ASK step (the "pull" side of money). The whether/whom/how-much
 * judgment is the LLM's; these verify only the deterministic shape guards (parse + finalizeAsk:
 * a real non-self target + a positive amount).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAsk } from '../src/services/character-agent/parse.ts';
import { finalizeAsk, type AskActionInput } from '../src/services/character-agent/ask-prompt.ts';

const base: AskActionInput = {
    name: '周硯秋', role: '老生', persona: '念舊守義', traits: ['謹慎'],
    funds: 4, dailyCost: 7, runwayDays: 1, vitalityState: 'failing', plight: '斷炊在即',
    candidates: [
        { id: '0xpatron', name: '孟雲屏', role: '班主', relation: 'patron', personality: '豪闊', standing: '家底厚實' },
        { id: '0xrival', name: '羅震天', role: '武生', relation: 'rival', personality: '記仇', standing: '尚可' },
    ],
};

test('parseAsk: a well-formed ask parses; unknown kind defaults to plea', () => {
    const o = parseAsk('{"doAsk":true,"targetId":"0xpatron","amount":15,"kind":"loan","reason":"求借應急"}');
    assert.equal(o?.doAsk, true);
    assert.equal(o?.targetId, '0xpatron');
    assert.equal(o?.amount, 15);
    assert.equal(o?.kind, 'loan');
    assert.equal(parseAsk('{"doAsk":true,"targetId":"0x1","amount":5,"kind":"討"}')?.kind, 'plea');
});

test('parseAsk: doAsk only when strictly true; garbage → null', () => {
    assert.equal(parseAsk('{"doAsk":"yes"}')?.doAsk, false);
    assert.equal(parseAsk('沒有 JSON'), null);
});

test('finalizeAsk: a valid ask to a real candidate survives', () => {
    const r = finalizeAsk({ doAsk: true, targetId: '0xpatron', amount: 15, kind: 'loan' }, base);
    assert.equal(r.doAsk, true);
    assert.equal(r.targetId, '0xpatron');
    assert.equal(r.targetName, '孟雲屏');
    assert.equal(r.amount, 15);
});

test('finalizeAsk: no-ask / unknown target / non-positive amount all collapse to not asking', () => {
    assert.equal(finalizeAsk({ doAsk: false, reason: '拉不下臉' }, base).doAsk, false);
    assert.equal(finalizeAsk({ doAsk: true, targetId: '0xghost', amount: 10 }, base).doAsk, false);
    assert.equal(finalizeAsk({ doAsk: true, targetId: '0xpatron', amount: 0 }, base).doAsk, false);
    assert.equal(finalizeAsk(null, base).doAsk, false);
});
