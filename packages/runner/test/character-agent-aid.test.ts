/**
 * Pure guard-layer tests for the AID step. The give/no-give JUDGMENT is the LLM's — these only
 * verify the deterministic safety net: parse the model's JSON, default a bad memo, and the hard
 * no-overdraft clamp. (Behavioral quality of the judgment is checked by the eval harness against
 * a real model: src/services/character-agent/__eval__/aid-eval.ts.)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAid } from '../src/services/character-agent/parse.ts';
import { clampAidAmount } from '../src/services/character-agent/aid-prompt.ts';

test('parseAid: a multi-gift decision is parsed verbatim', () => {
    const o = parseAid('{"gifts":[{"recipientId":"0xmentor","amount":18,"memo":"tribute","manner":"via-proxy","reason":"保他體面"},{"recipientId":"0xlover","amount":12,"memo":"gift"}],"reason":"先救恩情"}');
    assert.ok(o);
    assert.equal(o.gifts.length, 2);
    assert.equal(o.gifts[0].recipientId, '0xmentor');
    assert.equal(o.gifts[0].amount, 18);
    assert.equal(o.gifts[0].memo, 'tribute');
    assert.equal(o.gifts[0].manner, 'via-proxy');
    assert.equal(o.gifts[1].memo, 'gift');
    assert.equal(o.reason, '先救恩情');
});

test('parseAid: an empty gift list (no-aid) parses', () => {
    assert.deepEqual(parseAid('{"gifts":[],"reason":"眾人氣色都還穩"}'), { gifts: [], reason: '眾人氣色都還穩' });
    assert.deepEqual(parseAid('{"doAid":false,"reason":"罷了"}'), { gifts: [], reason: '罷了' });
});

test('parseAid: tolerates a bare single-gift object (model dropped the array)', () => {
    const o = parseAid('{"recipientId":"0x1","amount":5,"memo":"loan"}');
    assert.equal(o?.gifts.length, 1);
    assert.equal(o?.gifts[0].memo, 'loan');
});

test('parseAid: unknown memo → gift, unknown manner → undefined', () => {
    const o = parseAid('{"gifts":[{"recipientId":"0x1","amount":5,"memo":"贈與","manner":"硬塞"}]}');
    assert.equal(o?.gifts[0].memo, 'gift');
    assert.equal(o?.gifts[0].manner, undefined);
});

test('parseAid: prose with an embedded JSON object still parses; pure garbage is null', () => {
    assert.ok(parseAid('我想了想：{"gifts":[{"recipientId":"0x1","amount":3,"memo":"gift"}]}'));
    assert.equal(parseAid('沒有 JSON 在這裡'), null);
});

test('clampAidAmount: never exceeds funds (hard no-overdraft)', () => {
    assert.equal(clampAidAmount(999, 50), 50);
    assert.equal(clampAidAmount(12, 50), 12);
});

test('clampAidAmount: non-positive / non-finite / fractional are floored or zeroed', () => {
    assert.equal(clampAidAmount(-5, 50), 0);
    assert.equal(clampAidAmount(0, 50), 0);
    assert.equal(clampAidAmount(Number.NaN, 50), 0);
    assert.equal(clampAidAmount('abc', 50), 0);
    assert.equal(clampAidAmount(7.9, 50), 7);
    assert.equal(clampAidAmount(10, 0), 0); // broke giver can give nothing
});
