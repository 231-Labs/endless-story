/**
 * Guard-layer tests for the 斡旋 seat (the establishment counterparty's overnight
 * answer to a written contract counter). The whether-to-yield / how-to-say-it
 * judgment is the LLM's; these verify only the deterministic shape guards:
 * buildUserPrompt surfaces the books + terms + the demand, and parseNegotiateReply
 * clamps the reply to {accept:boolean, note?:string≤60} or null (the fail-safe that
 * hands the engine back to its deterministic path).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildUserPrompt,
    parseNegotiateReply,
    type NegotiateCounterInput,
} from '../src/services/character-agent/negotiate-prompt.ts';

const base: NegotiateCounterInput = {
    establishmentLabel: '華光影片社',
    stance: '重信譽、惜檔期，錢上肯讓、規矩上不肯讓',
    booksView: '現銀：420圓｜押著：60圓｜每日開銷：30圓｜跑道：14日｜在途義務：付春雪社首映分成',
    contractLabel: '灌一張唱片的約',
    terms: ['首映須在第10日前', '分成四六', '違約退定金'],
    demandBy: '柳安春',
    demand: '首映順延三日，加碼預付三十圓，落在班庫帳上以備置裝',
    askLine: '這句還價要對方加碼三十圓（帳房已核：補鎖後仍在跑道底線之上）。',
    clock: '第3日',
};

test('buildUserPrompt: surfaces establishment, stance, books, terms, the demand, askLine, clock', () => {
    const p = buildUserPrompt(base);
    assert.ok(p.includes('華光影片社'));
    assert.ok(p.includes('重信譽、惜檔期'));
    assert.ok(p.includes('現銀：420圓'));
    assert.ok(p.includes('灌一張唱片的約'));
    assert.ok(p.includes('- 首映須在第10日前'));
    assert.ok(p.includes('柳安春：首映順延三日'));
    assert.ok(p.includes('帳房已核'));
    assert.ok(p.includes('第3日'));
    assert.ok(p.includes('讓、還是不讓？(JSON)'));
});

test('buildUserPrompt: optional stance/askLine/clock are omitted when absent', () => {
    const p = buildUserPrompt({
        establishmentLabel: '申報報館',
        booksView: '現銀：100圓',
        contractLabel: '約稿一篇',
        terms: [],
        demandBy: '沈雪笙',
        demand: '只把交稿改到後日',
    });
    assert.ok(!p.includes('你家的立場'));
    assert.ok(!p.includes('此刻：'));
    assert.ok(p.includes('（無明列條款）'));
});

test('parseNegotiateReply: a well-formed accept parses; note carried through', () => {
    const r = parseNegotiateReply('華光斟酌後：{"accept":true,"note":"華光回話：加碼三十圓照辦，簽期只順延一日。"}');
    assert.equal(r?.accept, true);
    assert.equal(r?.note, '華光回話：加碼三十圓照辦，簽期只順延一日。');
});

test('parseNegotiateReply: a refuse with no note parses to note undefined', () => {
    const r = parseNegotiateReply('{"accept":false}');
    assert.equal(r?.accept, false);
    assert.equal(r?.note, undefined);
});

test('parseNegotiateReply: note is clamped to 60 chars', () => {
    const long = '華'.repeat(90);
    const r = parseNegotiateReply(JSON.stringify({ accept: true, note: long }));
    assert.equal(r?.note?.length, 60);
});

test('parseNegotiateReply: non-boolean accept / no JSON / broken JSON all collapse to null', () => {
    assert.equal(parseNegotiateReply('{"accept":"yes","note":"x"}'), null);
    assert.equal(parseNegotiateReply('沒有 JSON'), null);
    assert.equal(parseNegotiateReply('{"accept":true,'), null);
});
