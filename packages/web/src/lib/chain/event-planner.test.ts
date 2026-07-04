// Pure module — runs under `node --test`.
//
//   pnpm --filter @endless-story/web test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    framingForStatement,
    parseDirectorContention,
    selectContention,
    pushRecentTemplate,
} from './event-planner.ts';

const row = (statement: string, tension: number) => ({ statement, tension });

test('framingForStatement maps each contested resource to its template', () => {
    assert.equal(framingForStatement('爭得「spotlight:春雪社頭牌名額」').templateId, 'contention:spotlight');
    assert.equal(framingForStatement('爭得「recording:首張唱片灌錄權」').templateId, 'contention:recording');
    assert.equal(framingForStatement('與溫照棠搭戲').templateId, 'contention:partnership');
    assert.equal(framingForStatement('something else').templateId, 'storylet:tension');
});

test('director-created resources recover a coherent contention:<kind> templateId', () => {
    // The templateId keyword must equal the label prefix so the spine settles it.
    const f = framingForStatement('爭得「feud:春雪社班底」');
    assert.equal(f.templateId, 'contention:feud');
    assert.equal(f.templateId.split(':')[1], 'feud');
    assert.equal(parseDirectorContention('與溫照棠搭戲'), null);
    assert.equal(parseDirectorContention('something else'), null);
});

test('selectContention picks the globally highest tension when nothing is recent', () => {
    const picked = selectContention([
        row('爭得「recording:首張唱片灌錄權」', 0.4),
        row('爭得「spotlight:春雪社頭牌名額」', 0.9),
    ]);
    assert.equal(picked.templateId, 'contention:spotlight');
});

test('selectContention skips a recently-used template — breaks the monotony', () => {
    const rows = [
        row('爭得「recording:首張唱片灌錄權」', 0.9),
        row('爭得「spotlight:春雪社頭牌名額」', 0.6),
    ];
    const picked = selectContention(rows, ['爭得「recording:首張唱片灌錄權」']);
    assert.equal(picked.templateId, 'contention:spotlight');
});

test('selectContention rotates SAME-kind stakes by target (傾心柳 vs 傾心蘇)', () => {
    const rows = [
        row('傾心於柳生春', 0.9),
        row('傾心於蘇映雪', 0.6),
    ];
    // Both map to contention:affection — a templateId key would collide and never rotate.
    const picked = selectContention(rows, ['傾心於柳生春']);
    assert.equal(picked.statement, '傾心於蘇映雪');
    assert.equal(picked.templateId, 'contention:affection');
});

test('selectContention falls back to global top when every template is recent', () => {
    const rows = [
        row('爭得「recording:首張唱片灌錄權」', 0.9),
        row('爭得「spotlight:春雪社頭牌名額」', 0.6),
    ];
    const picked = selectContention(rows, ['爭得「recording:首張唱片灌錄權」', '爭得「spotlight:春雪社頭牌名額」']);
    assert.equal(picked.templateId, 'contention:recording');
});

test('selectContention on empty rows returns the default framing', () => {
    assert.equal(selectContention([]).templateId, 'storylet:tension');
});

test('pushRecentTemplate keeps newest-first, dedupes, and bounds length', () => {
    let recent: string[] = [];
    recent = pushRecentTemplate(recent, 'contention:recording');
    recent = pushRecentTemplate(recent, 'contention:spotlight');
    assert.deepEqual(recent, ['contention:spotlight', 'contention:recording']);
    recent = pushRecentTemplate(recent, 'contention:recording');
    assert.deepEqual(recent, ['contention:recording', 'contention:spotlight']);
    recent = pushRecentTemplate(recent, 'contention:partnership');
    assert.deepEqual(recent, ['contention:partnership', 'contention:recording']);
});
