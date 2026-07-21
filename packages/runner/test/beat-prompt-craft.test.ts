/**
 * 文筆戒律 — the beat system prompt carries the anti-formula craft rules.
 * Evidence-measured from a real GLM-5.2 run (診斷導出): the two dominant prose
 * pathologies were (1) a character re-performing the SAME gesture 5-gram across
 * 3-4 beats (磕鏟沿 ×4, 摸花串 ×3), and (2) box-office figures echoed verbatim
 * across the whole scroll (三十四圓半 ×8). The 【身段換樣】 iron rule targets
 * both; this test pins it into the built prompt so a prompt refactor cannot
 * silently drop it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBeatSystemPrompt, recurringImagery, type ActBeatInput } from '../src/services/character-agent/beat-prompt.ts';

const minimalInput: ActBeatInput = {
    name: '甲',
    persona: '一個角色',
    clock: '日午',
    sceneName: '前廳',
    others: [],
    recentBeats: [],
    want: { desc: '想把日子過下去' },
} as unknown as ActBeatInput;

function withSelfBeats(selfSceneBeats: string[]): ActBeatInput {
    return { ...minimalInput, selfSceneBeats } as unknown as ActBeatInput;
}

test('the beat system prompt carries the 身段換樣 anti-formula rule', () => {
    const prompt = buildBeatSystemPrompt(minimalInput);
    assert.match(prompt, /【身段換樣】/, 'the craft rule section is present');
    assert.match(prompt, /別拍拍重演/, 'gesture repetition is forbidden');
    assert.match(prompt, /不可再照數覆誦/, 'numeric echo is forbidden');
});

// ── 文筆二階：動態意象避用清單 ────────────────────────────────────────────────

test('recurringImagery surfaces a 5-gram tic recurring across the actor\'s own beats', () => {
    // 金鳳 loops 「聲音從喉嚨底勻出來」across her own beats — the measured pathology.
    const own = [
        '聲音從喉嚨底勻出來，拇指壓在她脈門上，她抵著她鼻尖。',
        '額頭抵回她額頭上，聲音從喉嚨底勻出來，啞，沒有端著。',
        '掌心貼上她肋骨側面那塊皮膚，量她呼吸的深淺。',
    ];
    const tics = recurringImagery(own);
    assert.ok(tics.length >= 1, 'a recurring tic is detected');
    assert.ok(tics.some((g) => '聲音從喉嚨底勻出來'.includes(g)), 'the looped phrase is among them');
});

test('recurringImagery is inert on a fresh / non-repeating window', () => {
    assert.deepEqual(recurringImagery(undefined), [], 'no beats ⇒ nothing');
    assert.deepEqual(recurringImagery(['聲音從喉嚨底勻出來，只此一拍。']), [], 'a single beat ⇒ nothing');
    const distinct = ['她拖開椅子坐下了，朝他偏過臉。', '他解開領口第一顆扣子，沒往下。'];
    assert.deepEqual(recurringImagery(distinct), [], 'two distinct beats ⇒ no tic');
});

test('the prompt gains a dynamic avoid-list only when the actor is looping', () => {
    const looping = buildBeatSystemPrompt(withSelfBeats([
        '拇指壓在她脈門上，量她跳得快不快，聲音從喉嚨底勻出來。',
        '拇指壓在她脈門上，量她跳得快不快，額頭抵著她額頭。',
    ]));
    assert.match(looping, /【近拍已用・這一拍換一種】/, 'the dynamic avoid-list appears when the actor loops');

    const fresh = buildBeatSystemPrompt(withSelfBeats(['她拖開椅子坐下了，朝他偏過臉。']));
    assert.doesNotMatch(fresh, /【近拍已用・這一拍換一種】/, 'no avoid-list on a fresh scene (byte-identical to before)');
});
