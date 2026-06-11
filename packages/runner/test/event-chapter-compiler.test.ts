// Event-chapter compiler — pure weave logic (gate + prompt + cut header).
// Runs under `node --test`; the prompt module is node-clean (saga-soul has no
// imports), so its graph imports cleanly without the chain/LLM deps.
//
//   pnpm --filter @endless-story/runner test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    shouldWeave,
    countDistinctVoices,
    buildUserPrompt,
    embedCutHeader,
    parseCutHeader,
    MIN_POVS_FOR_CUT,
    type EventCutPov,
    type EventCutHeader,
} from '../src/services/event-chapter-compiler/weave.ts';

const pov = (id: string, name: string, body: string, role?: string): EventCutPov => ({
    characterId: id,
    characterName: name,
    role,
    body,
});

test('MIN_POVS_FOR_CUT is 2 — a single angle is not a cut', () => {
    assert.equal(MIN_POVS_FOR_CUT, 2);
});

test('gate: one POV does not weave', () => {
    assert.equal(shouldWeave([pov('0xa', '孟雲屏', '我獨自在台心。')]), false);
});

test('gate: two distinct POVs weave', () => {
    assert.equal(
        shouldWeave([pov('0xa', '孟雲屏', '我立在台心。'), pov('0xb', '顧驚鴻', '我看著他。')]),
        true,
    );
});

test('gate: same character twice counts as one voice', () => {
    const povs = [pov('0xa', '孟雲屏', '第一念。'), pov('0xa', '孟雲屏', '第二念。')];
    assert.equal(countDistinctVoices(povs), 1);
    assert.equal(shouldWeave(povs), false);
});

test('gate: empty bodies are ignored', () => {
    const povs = [pov('0xa', '孟雲屏', '有內容。'), pov('0xb', '顧驚鴻', '   ')];
    assert.equal(countDistinctVoices(povs), 1);
    assert.equal(shouldWeave(povs), false);
});

test('user prompt carries the event frame + every POV body', () => {
    const prompt = buildUserPrompt({
        sagaName: '春雪社',
        day: 3,
        sceneName: '後台戲房',
        eventLabel: '誰壓軸的暗潮浮上檯面',
        povs: [
            pov('0xa', '孟雲屏', '我立在台心，不讓半步。', '花旦'),
            pov('0xb', '顧驚鴻', '我冷眼看她爭那盞燈。', '小生'),
        ],
    });
    assert.match(prompt, /春雪社/);
    assert.match(prompt, /第 3 日/);
    assert.match(prompt, /後台戲房/);
    assert.match(prompt, /誰壓軸的暗潮浮上檯面/);
    assert.match(prompt, /孟雲屏（花旦）/);
    assert.match(prompt, /我立在台心，不讓半步。/);
    assert.match(prompt, /我冷眼看她爭那盞燈。/);
});

test('cut header round-trips and strips before the prose', () => {
    const header: EventCutHeader = {
        v: 1,
        kind: 'event_cut',
        eventTx: '0xdeadbeef',
        eventLabel: '誰壓軸',
        sceneId: '0xscene',
        sceneName: '後台戲房',
        day: 3,
        povCharacterIds: ['0xa', '0xb'],
        sourcePovBlobIds: ['blobA', 'blobB'],
    };
    const prose = '## 第三回　台心一盞燈　冷眼兩重心\n\n那夜後台……';
    const embedded = embedCutHeader(prose, header);
    assert.ok(embedded.startsWith('<!--es:cut'));

    const { header: parsed, body } = parseCutHeader(embedded);
    assert.equal(body, prose); // header fully stripped, prose intact
    assert.deepEqual(parsed, header);
    assert.equal(parsed?.eventTx, '0xdeadbeef');
});

test('parseCutHeader on plain prose returns it unchanged', () => {
    const { header, body } = parseCutHeader('## 無頭的一回\n\n正文。');
    assert.equal(header, undefined);
    assert.equal(body, '## 無頭的一回\n\n正文。');
});
