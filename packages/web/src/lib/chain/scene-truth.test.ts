import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { __resetSceneTruth, recordSceneTruth, takeSceneTruth } from './scene-truth.ts';

function withLedger(fn: (dir: string) => void): void {
    const previousDir = process.env.SCENE_TRUTH_DIR;
    const previousKey = process.env.CHARACTER_SESSION_KEY;
    const dir = mkdtempSync(join(tmpdir(), 'scene-truth-'));
    process.env.SCENE_TRUTH_DIR = dir;
    delete process.env.CHARACTER_SESSION_KEY;
    try {
        fn(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
        if (previousDir === undefined) delete process.env.SCENE_TRUTH_DIR;
        else process.env.SCENE_TRUTH_DIR = previousDir;
        if (previousKey === undefined) delete process.env.CHARACTER_SESSION_KEY;
        else process.env.CHARACTER_SESSION_KEY = previousKey;
    }
}

test('scene truth persists on disk and is consumed exactly once', () => {
    withLedger(() => {
        recordSceneTruth('spring-snow', 'backstage', {
            day: 3,
            characterId: 'liu',
            name: '柳生春',
            text: '把借來的唱詞還到她手中。',
            inner: '她若看懂，便不必再問。',
        });

        assert.deepEqual(takeSceneTruth('spring-snow', 'backstage'), [{
            day: 3,
            characterId: 'liu',
            name: '柳生春',
            text: '把借來的唱詞還到她手中。',
            inner: '她若看懂，便不必再問。',
        }]);
        assert.deepEqual(takeSceneTruth('spring-snow', 'backstage'), []);
    });
});

test('same scene id remains isolated between sagas', () => {
    withLedger(() => {
        recordSceneTruth('spring-snow', 'stage', { name: '柳生春', text: '收劍。' });
        recordSceneTruth('other-saga', 'stage', { name: '旁人', text: '開門。' });

        assert.deepEqual(takeSceneTruth('spring-snow', 'stage').map((entry) => entry.name), ['柳生春']);
        assert.deepEqual(takeSceneTruth('other-saga', 'stage').map((entry) => entry.name), ['旁人']);
    });
});

test('session key encrypts objective and inner prose at rest', () => {
    withLedger((dir) => {
        process.env.CHARACTER_SESSION_KEY = '11'.repeat(32);
        recordSceneTruth('spring-snow', 'private-ledger-test', {
            name: '蘇映雪',
            text: '把傘擱在門外。',
            inner: '不願她看見手還在抖。',
        });

        const bucket = join(dir, readdirSync(dir)[0]!);
        const raw = readFileSync(join(bucket, readdirSync(bucket)[0]!), 'utf8');
        assert.equal(raw.includes('把傘擱在門外'), false);
        assert.equal(raw.includes('不願她看見'), false);
        assert.equal(takeSceneTruth('spring-snow', 'private-ledger-test')[0]?.name, '蘇映雪');
    });
});

test('a wrong key fails closed without consuming the ledger', () => {
    withLedger(() => {
        process.env.CHARACTER_SESSION_KEY = '22'.repeat(32);
        recordSceneTruth('spring-snow', 'stage', { name: '連翹', text: '橫劍攔住。' });
        process.env.CHARACTER_SESSION_KEY = '33'.repeat(32);
        assert.throws(() => takeSceneTruth('spring-snow', 'stage'));
        process.env.CHARACTER_SESSION_KEY = '22'.repeat(32);
        assert.equal(takeSceneTruth('spring-snow', 'stage')[0]?.name, '連翹');
    });
});

test('test reset clears only the explicitly configured ledger', () => {
    withLedger(() => {
        recordSceneTruth('spring-snow', 'a', { name: '甲', text: '一。' });
        recordSceneTruth('spring-snow', 'b', { name: '乙', text: '二。' });
        __resetSceneTruth();
        assert.deepEqual(takeSceneTruth('spring-snow', 'a'), []);
        assert.deepEqual(takeSceneTruth('spring-snow', 'b'), []);
    });
});
