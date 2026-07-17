// Character-agent LLM-output parsing + guardrails. These are the runner's
// first line of defence when ticks run unattended: a malformed model reply
// must degrade to stay/idle/fallback-plan, never throw or leak unauthorized
// setting drift into memories. Runs under `node --test`.
//
//   pnpm --filter @endless-story/runner test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseMove,
    parseDecision,
    parseSocial,
    parsePlan,
    sanitizeSocialMemory,
    sanitizePlanForRole,
    hasAuthorityDrift,
    driftsForRole,
} from '../src/services/character-agent/parse.ts';
import { sanitizeMoveReason } from '../src/services/character-agent/move-guard.ts';

/* ── MOVE ───────────────────────────────────────────────────────────── */

test('parseMove: valid JSON with prose around it', () => {
    const r = parseMove('我想了想。{"move": true, "targetSceneId": "0xabc", "reason": "去找她"}');
    assert.deepEqual(r, { move: true, targetSceneId: '0xabc', reason: '去找她' });
});

test('parseMove: no JSON object → null', () => {
    assert.equal(parseMove('我留在原地。'), null);
});

test('parseMove: broken JSON → null', () => {
    assert.equal(parseMove('{"move": true,'), null);
});

test('move reason is traditionalized and wrong unambiguous gender falls back neutrally', () => {
    const input = {
        name: '金鳳',
        role: '花旦',
        bodyFact: '女子',
        currentSceneName: '花廳',
        options: [{
            sceneId: 'stage',
            name: '雲錦台戲台',
            presentCharacters: [{ id: 'liu', name: '柳安春', role: '坤生', bodyFact: '女兒身，台上扮男' }],
        }],
    };
    assert.equal(
        sanitizeMoveReason('我要去找柳安春，逼他认那筆账。', input, 'stage'),
        '我決定去雲錦台戲台，照應心裡掛著的事。',
    );
});

test('move reason keeps its meaning while converting simplified characters', () => {
    const input = {
        name: '柳安春',
        role: '坤生',
        currentSceneName: '戲台',
        options: [{ sceneId: 'backstage', name: '後台妝閣', presentCharacters: [] }],
    };
    assert.equal(
        sanitizeMoveReason('联名那格得先问清楚。', input, 'backstage'),
        '聯名那格得先問清楚。',
    );
});

test('move reason may preserve a subjective mistaken belief about where someone is', () => {
    const input = {
        options: [
            {
                sceneId: 'newsroom',
                name: '報館茶室',
                presentCharacters: [{ id: 'shen', name: '沈雪笙', bodyFact: '女子' }],
            },
            {
                sceneId: 'stage',
                name: '雲錦台戲台',
                presentCharacters: [{ id: 'liu', name: '柳安春', bodyFact: '女兒身，台上扮男' }],
            },
        ],
    };
    assert.equal(
        sanitizeMoveReason('去找柳安春，問問校樣的事。', input, 'newsroom'),
        '去找柳安春，問問校樣的事。',
    );
});

/* ── ACT (card play) ────────────────────────────────────────────────── */

test('parseDecision: numeric-string catalogIndex is coerced', () => {
    const r = parseDecision('{"catalogIndex": "2", "intent": "先穩一手"}');
    assert.equal(r?.catalogIndex, 2);
    assert.equal(r?.intent, '先穩一手');
});

test('parseDecision: non-numeric catalogIndex → null', () => {
    assert.equal(parseDecision('{"catalogIndex": "壓軸", "intent": "x"}'), null);
});

/* ── SOCIAL ─────────────────────────────────────────────────────────── */

test('parseSocial: unknown kind degrades to idle', () => {
    const r = parseSocial('{"kind": "duel", "reason": "看他不順眼"}');
    assert.equal(r?.kind, 'idle');
});

test('parseSocial: line is clamped to 32 chars', () => {
    const long = '這'.repeat(60);
    const r = parseSocial(JSON.stringify({ kind: 'talk', targetCharacterId: '0x1', line: long }));
    assert.equal(r?.line?.length, 32);
});

test('parseSocial: non-string fields are ignored, not crashed on', () => {
    const r = parseSocial('{"kind": "observe", "observation": 42, "reason": ["x"]}');
    assert.equal(r?.kind, 'observe');
    assert.equal(r?.observation, undefined);
    assert.equal(r?.reason, undefined);
});

test('sanitizeSocialMemory: invented shared past is dropped', () => {
    assert.equal(sanitizeSocialMemory('我們是青梅竹馬，自小一同長大'), undefined);
    assert.equal(sanitizeSocialMemory('她與我有舊情'), undefined);
});

test('sanitizeSocialMemory: unsupported heavy motifs are dropped', () => {
    assert.equal(sanitizeSocialMemory('我看見他膝蓋的舊傷又犯了'), undefined);
    assert.equal(sanitizeSocialMemory('她袖中似藏著一只玉鐲信物'), undefined);
});

test('sanitizeSocialMemory: plain stage observation passes', () => {
    const ok = '我看見她收袖時仍留半分台上的光';
    assert.equal(sanitizeSocialMemory(ok), ok);
});

/* ── PLAN ───────────────────────────────────────────────────────────── */

test('parsePlan: valid plan JSON', () => {
    const r = parsePlan(
        '{"longTermGoal":"站穩小生位","dailyPlanHint":"接住下一折戲","openSubgoals":["探口風"]}',
    );
    assert.equal(r?.longTermGoal, '站穩小生位');
    assert.deepEqual(r?.openSubgoals, ['探口風']);
});

test('parsePlan: object missing both goal fields → null', () => {
    assert.equal(parsePlan('{"openSubgoals": ["x"]}'), null);
});

test('hasAuthorityDrift: flags troupe-master language', () => {
    assert.ok(hasAuthorityDrift('我要當這戲班的當家'));
    assert.ok(hasAuthorityDrift('讓誰紅誰就紅'));
    assert.ok(!hasAuthorityDrift('我要把今晚的戲唱好'));
});

test('sanitizePlanForRole: 班主 keeps authority plans', () => {
    const plan = { longTermGoal: '掌好這一班人', dailyPlanHint: '當家事當家辦', openSubgoals: [] };
    const r = sanitizePlanForRole({ name: '常四爺', role: '班主' }, plan);
    assert.deepEqual(r, plan);
});

test('sanitizePlanForRole: 花旦 with authority drift gets a role-true fallback', () => {
    const drifted = {
        longTermGoal: '我要做這戲班的老板',
        dailyPlanHint: '敲打新來的角兒讓他們安分',
        openSubgoals: [],
    };
    const r = sanitizePlanForRole({ name: '孟雲屏', role: '花旦' }, drifted);
    assert.ok(r.longTermGoal.includes('孟雲屏'));
    assert.ok(r.longTermGoal.includes('花旦'));
    assert.ok(!hasAuthorityDrift([r.longTermGoal, r.dailyPlanHint, ...r.openSubgoals].join(' ')));
});

test('sanitizePlanForRole: clean plan passes through untouched', () => {
    const plan = {
        longTermGoal: '我要在這戲班站穩小生位',
        dailyPlanHint: '先把身段磨穩',
        openSubgoals: ['看清誰在爭台口'],
    };
    const r = sanitizePlanForRole({ name: '柳生春', role: '小生' }, plan);
    assert.deepEqual(r, plan);
});

test('hasAuthorityDrift: usurping the troupe master is drift', () => {
    // Claiming / seizing / displacing authority — must clamp.
    assert.ok(hasAuthorityDrift('我要做這戲班的老板 敲打新來的角兒讓他們安分'));
    assert.ok(hasAuthorityDrift('我要掌控全班 讓誰紅誰就紅'));
    assert.ok(hasAuthorityDrift('總有一天取代班主 讓誰涼誰就涼'));
    assert.ok(hasAuthorityDrift('我要坐上當家的位子 整治不聽話的後輩'));
});

test('hasAuthorityDrift: merely naming the boss is NOT drift', () => {
    // A minor role planning AROUND the troupe master is in-character — the old
    // bare-noun guard wrongly clamped all of these (the "常常 fallback" cause).
    assert.ok(!hasAuthorityDrift('我想得到班主的賞識 把今天的戲演好'));
    assert.ok(!hasAuthorityDrift('盼著班主給我一個正戲的機會 先把身段練熟'));
    assert.ok(!hasAuthorityDrift('別惹當家的不快 守住自己的本分'));
    assert.ok(!hasAuthorityDrift('等東家發了月錢就贖回當掉的行頭 省著點花'));
    assert.ok(!hasAuthorityDrift('在班主面前證明我接得住戲 別出錯'));
});

test('hasAuthorityDrift: wildcards stay within a clause (no cross-field match)', () => {
    // `joined` glues fields with spaces; 敲打/新來 must not reach across them.
    assert.ok(!hasAuthorityDrift('把功夫磨好不再被人敲打 接住主角留的那句戲'));
    assert.ok(!hasAuthorityDrift('照顧新來的師弟 讓自己安分守己別惹事'));
});

test('driftsForRole: gate matches sanitize — 班主 bypass, drift detected, clean passes', () => {
    const usurp = { longTermGoal: '我要當這戲班的當家', dailyPlanHint: '整治新來的後輩', openSubgoals: [] };
    const clean = { longTermGoal: '我想得到班主的賞識', dailyPlanHint: '把今天的戲演好', openSubgoals: [] };
    // 班主 never drifts (so the repair loop never fires for the boss).
    assert.equal(driftsForRole('班主', usurp), false);
    // A non-班主 over-reaching → drift → triggers repair, not a direct template.
    assert.equal(driftsForRole('花旦', usurp), true);
    // Merely naming the boss is clean → no repair, plan passes through.
    assert.equal(driftsForRole('花旦', clean), false);
});
