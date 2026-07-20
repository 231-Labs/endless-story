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

import { buildBeatSystemPrompt, type ActBeatInput } from '../src/services/character-agent/beat-prompt.ts';

const minimalInput: ActBeatInput = {
    name: '甲',
    persona: '一個角色',
    clock: '日午',
    sceneName: '前廳',
    others: [],
    recentBeats: [],
    want: { desc: '想把日子過下去' },
} as unknown as ActBeatInput;

test('the beat system prompt carries the 身段換樣 anti-formula rule', () => {
    const prompt = buildBeatSystemPrompt(minimalInput);
    assert.match(prompt, /【身段換樣】/, 'the craft rule section is present');
    assert.match(prompt, /別拍拍重演/, 'gesture repetition is forbidden');
    assert.match(prompt, /不可再照數覆誦/, 'numeric echo is forbidden');
});
