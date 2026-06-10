/**
 * Pure guard-layer tests for the AID step. The give/no-give JUDGMENT is the LLM's — these only
 * verify the deterministic safety net: parse the model's JSON, default a bad memo, and the hard
 * no-overdraft clamp. (Behavioral quality of the judgment is checked by the eval harness against
 * a real model: src/services/character-agent/__eval__/aid-eval.ts.)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAid, clampAidAmount } from '../src/services/character-agent/parse.ts';

test('parseAid: a well-formed give decision is parsed verbatim', () => {
    const o = parseAid('{"doAid":true,"recipientId":"0xally","amount":12,"memo":"patronage","reason":"她要斷炊了"}');
    assert.ok(o);
    assert.equal(o.doAid, true);
    assert.equal(o.recipientId, '0xally');
    assert.equal(o.amount, 12);
    assert.equal(o.memo, 'patronage');
    assert.equal(o.reason, '她要斷炊了');
});

test('parseAid: a no-aid decision parses with doAid false', () => {
    const o = parseAid('{"doAid":false,"reason":"眾人氣色都還穩"}');
    assert.ok(o);
    assert.equal(o.doAid, false);
    assert.equal(o.recipientId, undefined);
});

test('parseAid: doAid only counts when strictly true (no truthy coercion)', () => {
    assert.equal(parseAid('{"doAid":"yes"}')?.doAid, false);
    assert.equal(parseAid('{"doAid":1}')?.doAid, false);
});

test('parseAid: an unknown / missing memo defaults to gift', () => {
    assert.equal(parseAid('{"doAid":true,"recipientId":"0x1","amount":5,"memo":"贈與"}')?.memo, 'gift');
    assert.equal(parseAid('{"doAid":true,"recipientId":"0x1","amount":5}')?.memo, 'gift');
});

test('parseAid: prose with an embedded JSON object still parses; pure garbage is null', () => {
    assert.ok(parseAid('我想了想：{"doAid":true,"recipientId":"0x1","amount":3}'));
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
