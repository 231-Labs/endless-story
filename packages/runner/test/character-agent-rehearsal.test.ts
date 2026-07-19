/**
 * Guard-layer tests for the 班主叫排戲 seat (the troupe-leader's morning rehearsal
 * call). The whether-to-call / which-戲碼 judgment is the LLM's; these verify only
 * the deterministic shape guards: buildUserPrompt surfaces the troupe + venue +
 * play + situation, and parseRehearsalReply clamps the reply to
 * {call:boolean, title?, line?} or null (the fail-safe that hands the engine back
 * to NOT calling rehearsal). Imports the node-clean PURE leaf directly — the
 * character-agent barrel is tsx-only (`.js` specifiers + eager llm import).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildUserPrompt,
    parseRehearsalReply,
    type RehearsalDecideInput,
} from '../src/services/character-agent/rehearsal-prompt.ts';

const base: RehearsalDecideInput = {
    banzhuName: '沈雪笙',
    role: '班主',
    troupeNames: ['柳安春', '蘇映雪', '江聞鶴', '連翹'],
    rehearsalVenue: '雲錦台戲台',
    playSummary: '《回雪》製作中（scripted；戲文 1 段、成之者 2 人、積功 0／4）',
    dayLabel: '第3日',
    situation: '今夜黃昏【雲錦台戲台】開鑼，到場不足4人便停鑼；班庫現銀約可撐 5 日',
};

test('buildUserPrompt: surfaces the 班主, troupe, venue, play, day, situation', () => {
    const p = buildUserPrompt(base);
    assert.ok(p.includes('沈雪笙'));
    assert.ok(p.includes('班主'));
    assert.ok(p.includes('柳安春、蘇映雪、江聞鶴、連翹'));
    assert.ok(p.includes('「雲錦台戲台」'));
    assert.ok(p.includes('《回雪》製作中'));
    assert.ok(p.includes('第3日'));
    assert.ok(p.includes('今夜黃昏'));
    assert.ok(p.includes('叫不叫排戲'));
});

test('buildUserPrompt: no play falls back to 尚無新戲在排; empty troupe + absent situation/role omitted', () => {
    const p = buildUserPrompt({
        banzhuName: '沈雪笙',
        troupeNames: [],
        rehearsalVenue: '後台妝閣',
        dayLabel: '第1日',
    });
    assert.ok(p.includes('尚無新戲在排'));
    assert.ok(p.includes('（今日無人可叫）'));
    assert.ok(!p.includes('今日的難處'));
    assert.ok(!p.includes('行當'));
});

test('parseRehearsalReply: a well-formed call parses; title + line carried through', () => {
    const r = parseRehearsalReply('班主沉吟片刻：{"call":true,"title":"回雪","line":"今日排《回雪》，午後戲台見"}');
    assert.equal(r?.call, true);
    assert.equal(r?.title, '回雪');
    assert.equal(r?.line, '今日排《回雪》，午後戲台見');
});

test('parseRehearsalReply: a no-call parses to call:false with no title/line', () => {
    const r = parseRehearsalReply('{"call":false}');
    assert.equal(r?.call, false);
    assert.equal(r?.title, undefined);
    assert.equal(r?.line, undefined);
});

test('parseRehearsalReply: title/line are clamped to ~40 chars', () => {
    const long = '戲'.repeat(90);
    const r = parseRehearsalReply(JSON.stringify({ call: true, title: long, line: long }));
    assert.equal(r?.title?.length, 40);
    assert.equal(r?.line?.length, 40);
});

test('parseRehearsalReply: non-boolean call / no JSON / broken JSON all collapse to null', () => {
    assert.equal(parseRehearsalReply('{"call":"yes","title":"回雪"}'), null);
    assert.equal(parseRehearsalReply('沒有 JSON'), null);
    assert.equal(parseRehearsalReply('{"call":true,'), null);
});
